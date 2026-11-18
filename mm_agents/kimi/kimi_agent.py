"""OSWorld's Kimi K3 computer-use agent (GUI mode), with the CAPTCHA system prompt of captcha_prompt.py."""

from __future__ import annotations

import base64
import datetime
import json
import logging
import os
import random
import time
from collections.abc import Mapping
from copy import deepcopy
from typing import Any

import requests

from .utils import (
    KIMI_TOOLS,
    canonicalize_selected_tool_calls,
    parse_kimi_tool_calls_to_action,
    sanitize_tool_calls,
)
from mm_agents.captcha_prompt import captcha_system
from mm_agents.openrouter import fit_request
from mm_agents.thinking import REASONING_FIELDS, effort_fields, served_by
from mm_agents import usage as usage_record


LOGGER = logging.getLogger("desktopenv.agent.kimi")


class _NonRetryableModelError(RuntimeError):
    """An HTTP request the caller must fix instead of retrying."""


_GUI_MODE_OPENING = (
    "You are an agent operating an Ubuntu desktop VM. Complete the user's "
    "task by interacting with the computer through the provided GUI tools. "
    'The computer password is "{password}".'
)

_SHARED_EXECUTION_POLICY = """- Use execute_pyautogui_code for every click, keypress, scroll, drag, window action, or visible application interaction. Batch consecutive GUI actions into one call whenever the later actions do not depend on observing a new screenshot first. Use the requested native application for substantive document, spreadsheet, presentation, image, audio, or video edits when its final state matters. wait_for_state only waits and finish_task only ends the task; neither performs any GUI action.
- Preserve every exact path, filename, extension, requested application, and constraint from the instruction. Save material work and verify the resulting state or file.
- Before Submit, Publish, Send, or finish_task(status="success"), make one consolidated check that every requested item is complete and no error, recovery, upload, attachment, or format dialog remains.
- Never call finish_task while a described action (clicking, opening, typing, saving, waiting, verifying) is still pending; execute it first. When the current task or phase is genuinely complete, call finish_task with status="success" (in a multi-phase task this ends only the current phase so the runner can evaluate it and continue); use status="failure" only when the task is truly infeasible, not merely because one approach failed.
- Call ask_user only when that tool is available and a required fact or permission cannot be obtained from the environment. Ask one precise question and continue from the returned answer. If ask_user is absent, do not ask.
- Never modify evaluator, task, or gold/reference files; never reboot, shut down, format disks, or damage networking."""

_GUI_MODE_BLOCKS = """<TASK_FEASIBILITY>
Declare a task infeasible only when it fundamentally cannot be completed in the current environment: a required application is missing and cannot be installed, permissions make the task impossible, the instruction is contradictory, or the designated application lacks the requested capability. If so, call finish_task with status="failure".
</TASK_FEASIBILITY>

<APPLICATION_RULES>
* For GIMP and LibreOffice tasks, use the GUI interface directly. Do not use LibreOffice macros, GIMP Script-Fu, Python scripts, shell scripts, or external application workarounds unless the task explicitly requires them.
* For GIMP tasks, do not save or export files unless the instruction explicitly asks you to. Existing output-file tasks usually say "export", not "save".
* For PDFs, if one screenshot is not enough to read what you need, use the GUI to navigate, zoom, or search within the PDF. Do not assume unavailable content without checking.
</APPLICATION_RULES>"""

_SYS_PROMPT_CLOSING = (
    "The current date is {current_date}. You have at most {max_steps} "
    "environment steps. Use absolute PyAutoGUI pixel coordinates for the "
    "{screen_width}x{screen_height} screen."
)

GUI_MODE_SYS_PROMPT = "\n\n".join(
    [_GUI_MODE_OPENING, "Execution policy:\n" + _SHARED_EXECUTION_POLICY, _GUI_MODE_BLOCKS, _SYS_PROMPT_CLOSING]
)


def build_system_prompt(*, password: str, max_steps: int, screen_size: tuple[int, int]) -> str:
    """The official GUI-mode system prompt, then captcha_system('kimi')."""
    prompt = GUI_MODE_SYS_PROMPT.format(
        password=password,
        max_steps=max_steps,
        current_date=datetime.date.today().strftime("%A, %B %d, %Y"),
        screen_width=screen_size[0],
        screen_height=screen_size[1],
    )
    return captcha_system(prompt, 'kimi')


def _encode_image(image_content: bytes | bytearray | memoryview | str) -> str:
    if isinstance(image_content, str):
        if image_content.startswith("data:image/"):
            return image_content.split(",", 1)[-1]
        return image_content
    return base64.b64encode(bytes(image_content)).decode("ascii")


def _shorten(value: Any, limit: int = 500) -> str:
    text = str(value or "")
    if len(text) <= limit:
        return text
    return text[:limit] + f"... <truncated {len(text) - limit} chars>"


class KimiAgent:
    def __init__(
        self,
        model: str,
        max_steps: int = 100,
        *,
        agent_mode: str = "gui",
        max_tokens: int = 65536,
        top_p: float = 0.95,
        temperature: float = 0.0,
        action_space: str = "pyautogui",
        observation_type: str = "screenshot",
        screen_size: tuple[int, int] = (1920, 1080),
        coordinate_type: str = "absolute",
        password: str = "osworld-public-evaluation",
        thinking: bool = True,
        max_history_length: int = 1000,
        history_slide_chunk: int = 10,
        num_max_images: int = 100,
        num_compact_images: int = 10,
        fail_on_max_steps: bool = True,
        base_url: str | None = None,
        api_key: str | None = None,
        api_key_env: str | None = None,
        request_timeout: float = 900.0,
        request_max_retries: int = 5,
        retry_delay: float = 5.0,
        retry_max_delay: float = 90.0,
        reasoning_effort: str | None = None,
    ) -> None:
        if agent_mode != "gui":
            raise ValueError(f"Unsupported agent_mode: {agent_mode!r}")
        if coordinate_type != "absolute":
            raise ValueError(f"Unsupported coordinate_type: {coordinate_type!r}")
        if action_space != "pyautogui":
            raise ValueError("Kimi agent requires action_space='pyautogui'.")
        if observation_type != "screenshot":
            raise ValueError("Kimi agent requires observation_type='screenshot'.")
        if not isinstance(model, str) or not model.strip():
            raise ValueError("model must be a non-empty model id.")

        self.model = model.strip()
        self.base_url = (
            base_url
            or os.environ.get("KIMI_BASE_URL")
            or os.environ.get("OPENAI_BASE_URL")
            or "https://api.moonshot.ai/v1"
        ).rstrip("/")
        self.api_key = api_key
        self.api_key_env = api_key_env
        self.max_tokens = int(max_tokens)
        self.top_p = float(top_p)
        self.temperature = float(temperature)
        self.screen_size = tuple(screen_size)
        self.thinking = bool(thinking)
        self.max_steps = int(max_steps)
        self.max_history_length = max(1, int(max_history_length))
        self.history_slide_chunk = max(1, int(history_slide_chunk))
        self.num_max_images = max(1, int(num_max_images))
        self.num_compact_images = max(1, min(int(num_compact_images), self.num_max_images))
        self.fail_on_max_steps = bool(fail_on_max_steps)
        self.request_timeout = max(1.0, float(request_timeout))
        self.request_max_retries = max(1, int(request_max_retries))
        self.retry_delay = max(0.0, float(retry_delay))
        self.retry_max_delay = max(self.retry_delay, float(retry_max_delay))
        self.reasoning_effort = reasoning_effort
        self.extra_body = {"think_mode": "on"} if self.thinking else {}
        self._logger = LOGGER
        self.task_config: dict[str, Any] = {}
        self.system_prompt = build_system_prompt(
            password=password, max_steps=self.max_steps, screen_size=self.screen_size
        )
        self.history: dict[int, dict[str, Any]] = {}
        self.cur_step = 0
        self.last_usage: list[dict[str, Any]] = []
        self.last_reasoning = ""

    def set_task_config(self, task_config: Mapping[str, Any]) -> None:
        self.task_config = dict(task_config)

    def reset(self, _logger: Any = None, *, task_config: Any = None, **kwargs: Any) -> None:
        if _logger is not None:
            self._logger = _logger
        if task_config is not None:
            self.set_task_config(task_config)
        self.history = {}
        self.cur_step = 0

    def _image_message_from_obs(self, obs: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{_encode_image(obs['screenshot'])}",
                "detail": "high",
            },
        }

    def _history_steps(self) -> list[int]:
        if self.cur_step <= self.max_history_length:
            start_step = 0
        else:
            overflow = self.cur_step - self.max_history_length
            start_step = (
                (overflow - 1) // self.history_slide_chunk + 1
            ) * self.history_slide_chunk
        return [step for step in range(start_step, self.cur_step) if step in self.history]

    def _build_history_assistant(self, history: Mapping[str, Any], call_counter: int) -> dict[str, Any]:
        content = str(history.get("response") or "")
        tool_calls = sanitize_tool_calls(history["response_info"].get("tool_calls"))
        for index, tool_call in enumerate(tool_calls):
            tool_call["id"] = f"call_{call_counter + index}"
        if tool_calls and not any(
            tool_call["function"]["name"] == "take_screenshot"
            for tool_call in tool_calls
        ):
            tool_calls.append(
                {
                    "id": f"call_{call_counter + len(tool_calls)}",
                    "type": "function",
                    "function": {
                        "name": "take_screenshot",
                        "arguments": "{}",
                    },
                }
            )
        assistant: dict[str, Any] = {"content": content}
        if tool_calls:
            assistant["tool_calls"] = tool_calls
        thought = history["cot"]["thought"]
        if thought:
            assistant["reasoning_content"] = thought
        return assistant

    def prepare_messages(self, instruction: str, obs: Mapping[str, Any]) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": instruction},
        ]
        history_steps = self._history_steps()
        total_images = len(history_steps) + 1
        if total_images > self.num_max_images:
            chunk = max(1, self.num_max_images - self.num_compact_images)
            num_events = (total_images - self.num_max_images - 1) // chunk + 1
            num_compact = num_events * chunk + 1
            # the newest screenshot always stays an image
            num_compact = min(num_compact, total_images - 1)
        else:
            num_compact = 0

        def screenshot_content(
            observation: Mapping[str, Any], step_num: int, image_index: int
        ) -> list[dict[str, Any]]:
            if image_index >= num_compact:
                return [self._image_message_from_obs(observation)]
            return [{"type": "text", "text": f"[Screenshot at Step {step_num}]"}]

        call_counter = 0
        screenshot_call_id = f"call_{call_counter}"
        call_counter += 1
        messages.append(
            {
                "role": "assistant",
                "content": (
                    "I'll start by taking a screenshot to see the current state "
                    "of the screen."
                ),
                "tool_calls": [
                    {
                        "id": screenshot_call_id,
                        "type": "function",
                        "function": {
                            "name": "take_screenshot",
                            "arguments": "{}",
                        },
                    }
                ],
            }
        )

        if history_steps:
            first_step = history_steps[0]
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": screenshot_call_id,
                    "content": screenshot_content(
                        self.history[first_step]["observation"], first_step, 0
                    ),
                }
            )
            for history_index, step_num in enumerate(history_steps):
                assistant = self._build_history_assistant(self.history[step_num], call_counter)
                messages.append({"role": "assistant", **assistant})
                tool_calls = assistant.get("tool_calls") or []
                call_counter += len(tool_calls)
                for tool_call in tool_calls:
                    if tool_call["function"]["name"] == "take_screenshot":
                        if history_index + 1 < len(history_steps):
                            next_step = history_steps[history_index + 1]
                            observation = self.history[next_step]["observation"]
                            screenshot_step = next_step
                        else:
                            observation = obs
                            screenshot_step = self.cur_step
                        content: Any = screenshot_content(
                            observation, screenshot_step, history_index + 1
                        )
                    else:
                        content = ""
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": content,
                        }
                    )
        else:
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": screenshot_call_id,
                    "content": [self._image_message_from_obs(obs)],
                }
            )

        return messages

    def _resolved_api_key(self) -> str:
        if self.api_key:
            return self.api_key
        candidate_names = [self.api_key_env] if self.api_key_env else []
        candidate_names.extend(["KIMI_API_KEY", "OPENAI_API_KEY"])
        for name in candidate_names:
            if name and os.environ.get(name):
                return os.environ[name]
        raise RuntimeError(
            "Missing API key: set KIMI_API_KEY or OPENAI_API_KEY, or pass api_key."
        )

    def _chat_completions_url(self) -> str:
        if self.base_url.endswith("/chat/completions"):
            return self.base_url
        return self.base_url + "/chat/completions"

    def call_llm(self, payload: Mapping[str, Any]) -> tuple[str, dict[str, Any]]:
        """Returns (message content, info with finish_reason, choices, tool_calls, reasoning_content, usage)."""
        key = self._resolved_api_key()
        authorization = key if key.lower().startswith("bearer ") else f"Bearer {key}"
        headers = {"Content-Type": "application/json", "Authorization": authorization}
        data = dict(payload)
        last_error: Exception | None = None

        for attempt in range(1, self.request_max_retries + 1):
            try:
                response = requests.post(
                    self._chat_completions_url(),
                    headers=headers,
                    data=json.dumps(data),
                    timeout=self.request_timeout,
                    verify=True,
                )
                if response.status_code != 200:
                    error = (
                        f"HTTP {response.status_code}: "
                        f"{_shorten(response.text, 2000)}"
                    )
                    if (
                        400 <= response.status_code < 500
                        and response.status_code not in {408, 409, 425, 429}
                    ):
                        raise _NonRetryableModelError(error)
                    raise RuntimeError(error)
                body = response.json()
                choice = body["choices"][0]
                message = choice.get("message") or {}
                finish_reason = choice.get("finish_reason")
                tool_calls = message.get("tool_calls") or []
                content = str(message.get("content") or "")
                if not content.strip() and not tool_calls:
                    raise RuntimeError(
                        "Empty message.content and no tool_calls in LLM response"
                    )
                if finish_reason not in {None, "stop", "tool_calls"} and not tool_calls:
                    raise RuntimeError(f"Unexpected finish_reason={finish_reason!r}")
                info: dict[str, Any] = {
                    "finish_reason": finish_reason,
                    "n": len(body.get("choices") or []),
                    "choices": body.get("choices") or [],
                    "tool_calls": tool_calls,
                    "reasoning_content": next((message.get(f) for f in REASONING_FIELDS if message.get(f)), "") or "",
                }
                if "usage" in body:
                    info["usage"] = body["usage"]
                return content, info
            except _NonRetryableModelError as exc:
                raise RuntimeError(f"call_llm rejected a non-retryable request: {exc}") from exc
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                self._logger.warning(
                    "Kimi model call attempt %d/%d failed: %s",
                    attempt,
                    self.request_max_retries,
                    exc,
                )
                if attempt < self.request_max_retries and self.retry_delay:
                    delay_cap = min(
                        self.retry_max_delay,
                        self.retry_delay * (2 ** (attempt - 1)),
                    )
                    delay = random.uniform(0.0, delay_cap)
                    self._logger.info(
                        "Retrying Kimi model call in %.2f seconds.", delay
                    )
                    time.sleep(delay)
        raise RuntimeError(
            f"call_llm failed after {self.request_max_retries} attempts: {last_error}"
        )

    def _payload(self, messages: list[dict[str, Any]], temperature: float) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "temperature": temperature,
            "tools": deepcopy(KIMI_TOOLS),
        }
        # sent as a top-level field, which OpenRouter does not take
        if self.extra_body and served_by(self.base_url) != 'openrouter':
            payload["extra_body"] = deepcopy(self.extra_body)
        payload.update(effort_fields(self.base_url, self.reasoning_effort))
        return fit_request(self.base_url, self.model, payload)

    @staticmethod
    def _is_protocol_error(actions: Any) -> bool:
        return bool(
            isinstance(actions, list)
            and len(actions) == 1
            and isinstance(actions[0], dict)
            and actions[0].get("action_type") == "PROTOCOL_ERROR"
        )

    def _store_history(
        self,
        *,
        observation: Mapping[str, Any],
        response: str,
        response_info: Mapping[str, Any],
        low_level_instruction: str,
        actions: list[Any],
        sections: Mapping[str, Any],
    ) -> None:
        canonical_response_info = dict(response_info)
        canonical_response_info["tool_calls"] = canonicalize_selected_tool_calls(
            list(response_info.get("tool_calls") or []),
            sections.get("selected_tool_index"),
        )
        self.history[self.cur_step] = {
            "observation": dict(observation),
            "response": response,
            "response_info": canonical_response_info,
            "cot": {"thought": str(response_info.get("reasoning_content") or "")},
            "low_level_instruction": low_level_instruction,
            "action": actions,
            "tool_call_sections": dict(sections),
        }
        self.cur_step += 1

    def predict(self, instruction: str, obs: Mapping[str, Any], **kwargs: Any) -> tuple[str, list[Any]]:
        observation = dict(obs)
        response = ""
        response_info: dict[str, Any] = {}
        low_level_instruction = ""
        actions: list[Any] = []
        sections: dict[str, Any] = {}
        for attempt in range(3):
            messages = self.prepare_messages(instruction, observation)
            # a protocol error is asked again with the same messages at temperature 0.3
            temperature = self.temperature if attempt == 0 else 0.3
            t_call = time.time()
            response, response_info = self.call_llm(self._payload(messages, temperature))
            self.last_usage.append(usage_record.openai_chat(response_info.get("usage"), time.time() - t_call))
            low_level_instruction, actions, sections = parse_kimi_tool_calls_to_action(
                response,
                list(response_info.get("tool_calls") or []),
                self.screen_size,
            )
            if not self._is_protocol_error(actions):
                break
            self._logger.warning(
                "Kimi protocol error on attempt %d/3, retrying: %s",
                attempt + 1,
                actions[0].get("message"),
            )
        else:
            raise RuntimeError(
                "Kimi protocol error after 3 attempts: "
                f"{actions[0].get('message')}"
            )

        if not actions:
            raise RuntimeError("Kimi agent returned no executable action.")
        first_action_is_terminal = bool(
            isinstance(actions[0], str) and actions[0] in {"DONE", "FAIL"}
        )
        if (
            self.fail_on_max_steps
            and self.cur_step + 1 >= self.max_steps
            and not first_action_is_terminal
        ):
            self._logger.warning("Reached max_steps=%d; forcing failure.", self.max_steps)
            low_level_instruction = "Fail because the maximum step limit was reached."
            actions = ["FAIL"]
            sections = {**sections, "code": "FAIL", "forced_max_steps": True}

        self._store_history(
            observation=observation,
            response=response,
            response_info=response_info,
            low_level_instruction=low_level_instruction,
            actions=actions,
            sections=sections,
        )
        self.last_reasoning = str(response_info.get("reasoning_content") or "")
        return response, actions


__all__ = ["KimiAgent"]
