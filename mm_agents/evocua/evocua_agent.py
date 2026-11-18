# OSWorld's EvoCUA agent with the S2 prompt style: one Qwen-style <tool_call> per step, coordinates on a 0-999 grid.
import json
import logging
import os
from io import BytesIO
from typing import Dict, List, Optional, Tuple

import backoff
import openai
from PIL import Image

from ..captcha_prompt import SYSTEM_SUFFIX
from .prompts import S2_DESCRIPTION_PROMPT_TEMPLATE, S2_INSTRUCTION_TEMPLATE, S2_SYSTEM_PROMPT, build_s2_tools_def
from .utils import log_messages, process_image

logger = logging.getLogger("desktopenv.evocua")

CLICKS = {
    "left_click": "click",
    "click": "click",
    "right_click": "rightClick",
    "middle_click": "middleClick",
    "double_click": "doubleClick",
    "triple_click": "tripleClick",
}


def _clean_keys(raw_keys):
    keys = raw_keys if isinstance(raw_keys, list) else [raw_keys]
    cleaned_keys = []
    for key in keys:
        if isinstance(key, str):
            if key.startswith("keys=["):
                key = key[6:]
            if key.endswith("]"):
                key = key[:-1]
            if key.startswith("['") or key.startswith('["'):
                key = key[2:] if len(key) > 2 else key
            if key.endswith("']") or key.endswith('"]'):
                key = key[:-2] if len(key) > 2 else key
            key = key.strip()
        cleaned_keys.append(key)
    return cleaned_keys


def _type_as_presses(text):
    result = ""
    for char in text:
        if char == '\n':
            result += "pyautogui.press('enter')\n"
        elif char == "'":
            result += 'pyautogui.press("\'")\n'
        elif char == '\\':
            result += "pyautogui.press('\\\\')\n"
        elif char == '"':
            result += "pyautogui.press('\"')\n"
        else:
            result += f"pyautogui.press('{char}')\n"
    return result


class EvoCUAAgent:
    """EvoCUA, a native GUI agent model for desktop automation."""

    def __init__(
        self,
        model: str = "EvoCUA-S2",
        max_tokens: int = 32768,
        top_p: float = 0.9,
        temperature: float = 0.0,
        action_space: str = "pyautogui",
        observation_type: str = "screenshot",
        max_steps: int = 50,
        prompt_style: str = "S2",
        max_history_turns: int = 4,
        screen_size: Tuple[int, int] = (1920, 1080),
        coordinate_type: str = "relative",
        password: str = "osworld-public-evaluation",
        resize_factor: int = 32,
        **kwargs
    ):
        assert prompt_style == "S2", f"Invalid prompt_style: {prompt_style}"
        assert coordinate_type == "relative", f"Invalid coordinate_type: {coordinate_type}"
        assert action_space == "pyautogui", f"Invalid action space: {action_space}"
        assert observation_type == "screenshot", f"Invalid observation type: {observation_type}"

        self.model = model
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.temperature = temperature
        self.max_steps = max_steps
        self.max_history_turns = max_history_turns
        self.screen_size = screen_size
        self.resize_factor = resize_factor

        self.actions = []
        self.responses = []
        self.screenshots = []

    def reset(self, _logger=None, vm_ip=None):
        global logger
        if _logger:
            logger = _logger
        self.actions = []
        self.responses = []
        self.screenshots = []

    def predict(self, instruction: str, obs: Dict) -> Tuple[Optional[str], List[str]]:
        logger.info(f"========================== {self.model} ===================================")
        logger.info(f"Instruction: \n{instruction}")

        screenshot_bytes = obs["screenshot"]
        original_width, original_height = Image.open(BytesIO(screenshot_bytes)).size
        processed_b64, p_width, p_height = process_image(screenshot_bytes, factor=self.resize_factor)
        self.screenshots.append(processed_b64)

        description_prompt = S2_DESCRIPTION_PROMPT_TEMPLATE.format(
            resolution_info="* The screen's resolution is 1000x1000.")
        tools_def = build_s2_tools_def(description_prompt)
        system_prompt = S2_SYSTEM_PROMPT.format(tools_xml=json.dumps(tools_def)) + SYSTEM_SUFFIX

        # On a context-length error, retry with one history turn fewer.
        history_n = self.max_history_turns
        response = None
        while True:
            messages = self._build_messages(instruction, processed_b64, len(self.actions), history_n, system_prompt)
            try:
                response = self.call_llm({
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": self.max_tokens,
                    "top_p": self.top_p,
                    "temperature": self.temperature,
                })
                break
            except Exception as e:
                if self._should_giveup_on_context_error(e) and history_n > 0:
                    history_n -= 1
                    logger.warning(f"Context too large, retrying with history_n={history_n}")
                else:
                    logger.error(f"Error in predict: {e}")
                    break

        self.responses.append(response)

        low_level_instruction, pyautogui_code = self._parse_response(response, original_width, original_height)

        first_action = pyautogui_code[0] if pyautogui_code else ""
        if len(self.actions) + 1 >= self.max_steps and str(first_action).upper() not in ("DONE", "FAIL"):
            logger.warning(f"Reached maximum steps {self.max_steps}. Forcing termination with FAIL.")
            low_level_instruction = "Fail the task because reaching the maximum step limit."
            pyautogui_code = ["FAIL"]

        logger.info(f"Low level instruction: {low_level_instruction}")
        logger.info(f"Pyautogui code: {pyautogui_code}")

        self.actions.append(low_level_instruction)
        return response, pyautogui_code

    def _build_messages(self, instruction, current_img, step, history_n, system_prompt):
        """The last history_n turns as screenshot/response pairs; the instruction and the older actions go with the
        first image."""
        messages = [{"role": "system", "content": [{"type": "text", "text": system_prompt}]}]

        previous_actions = [f"Step {i + 1}: {self.actions[i]}" for i in range(max(0, step - history_n))]
        instruction_prompt = S2_INSTRUCTION_TEMPLATE.format(
            instruction=instruction, previous_actions="\n".join(previous_actions) if previous_actions else "None")

        history_len = min(history_n, len(self.responses))
        if history_len > 0:
            hist_responses = self.responses[-history_len:]
            hist_imgs = self.screenshots[-history_len - 1:-1]
            for i in range(history_len):
                content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{hist_imgs[i]}"}}]
                if i == 0:
                    content.append({"type": "text", "text": instruction_prompt})
                messages.append({"role": "user", "content": content})
                messages.append({"role": "assistant", "content": [{"type": "text", "text": hist_responses[i]}]})

        content = [{"type": "image_url", "image_url": {"url": f"data:image/png;base64,{current_img}"}}]
        if history_len == 0:
            content.append({"type": "text", "text": instruction_prompt})
        messages.append({"role": "user", "content": content})
        return messages

    def _parse_response(self, response: Optional[str], original_width: int, original_height: int
                        ) -> Tuple[str, List[str]]:
        """Converts the reply to (low-level instruction, pyautogui code)."""
        low_level_instruction = ""
        pyautogui_code: List[str] = []

        if response is None or not response.strip():
            return low_level_instruction, pyautogui_code

        def adjust_coordinates(x: float, y: float) -> Tuple[int, int]:
            return int(x * (original_width / 999)), int(y * (original_height / 999))

        def process_tool_call(json_str: str) -> None:
            try:
                tool_call = json.loads(json_str)
                if tool_call.get("name") != "computer_use":
                    return
                args = tool_call["arguments"]
                action = args["action"]

                if action in CLICKS:
                    fn = CLICKS[action]
                    if "coordinate" in args:
                        x, y = args["coordinate"]
                        adj_x, adj_y = adjust_coordinates(x, y)
                        pyautogui_code.append(f"pyautogui.{fn}({adj_x}, {adj_y})")
                    else:
                        pyautogui_code.append(f"pyautogui.{fn}()")

                elif action == "type":
                    text = args.get("text", "")
                    try:
                        text = text.encode('latin-1', 'backslashreplace').decode('unicode_escape')
                    except Exception as e:
                        logger.error(f"Failed to unescape text: {e}")
                    logger.info(f"Pyautogui code[before rewrite]: {text}")
                    pyautogui_code.append(_type_as_presses(text))
                    logger.info(f"Pyautogui code[after rewrite]: {pyautogui_code}")

                elif action == "key":
                    keys = _clean_keys(args.get("keys", []))
                    keys_str = ", ".join([f"'{key}'" for key in keys])
                    if len(keys) > 1:
                        pyautogui_code.append(f"pyautogui.hotkey({keys_str})")
                    else:
                        pyautogui_code.append(f"pyautogui.press({keys_str})")

                elif action == "key_down":
                    for k in _clean_keys(args.get("keys", [])):
                        pyautogui_code.append(f"pyautogui.keyDown('{k}')")

                elif action == "key_up":
                    for k in reversed(_clean_keys(args.get("keys", []))):
                        pyautogui_code.append(f"pyautogui.keyUp('{k}')")

                elif action == "scroll":
                    pyautogui_code.append(f"pyautogui.scroll({args.get('pixels', 0)})")

                elif action == "wait":
                    pyautogui_code.append("WAIT")

                elif action == "terminate":
                    status = args.get("status", "success")
                    pyautogui_code.append("FAIL" if str(status).lower() == "failure" else "DONE")

                elif action == "mouse_move":
                    if "coordinate" in args:
                        x, y = args["coordinate"]
                        adj_x, adj_y = adjust_coordinates(x, y)
                        pyautogui_code.append(f"pyautogui.moveTo({adj_x}, {adj_y})")
                    else:
                        pyautogui_code.append("pyautogui.moveTo(0, 0)")

                elif action == "left_click_drag":
                    if "coordinate" in args:
                        x, y = args["coordinate"]
                        adj_x, adj_y = adjust_coordinates(x, y)
                        duration = args.get("duration", 0.5)
                        pyautogui_code.append(f"pyautogui.dragTo({adj_x}, {adj_y}, duration={duration})")
                    else:
                        pyautogui_code.append("pyautogui.dragTo(0, 0)")
            except (json.JSONDecodeError, KeyError) as e:
                logger.error(f"Failed to parse tool call: {e}")

        inside_tool_call = False
        current_tool_call: List[str] = []

        for line in response.split("\n"):
            line = line.strip()
            if not line:
                continue

            if line.lower().startswith("action:"):
                if not low_level_instruction:
                    low_level_instruction = line.split("Action:")[-1].strip()
                continue

            if line.startswith("<tool_call>"):
                inside_tool_call = True
                continue
            elif line.startswith("</tool_call>"):
                if current_tool_call:
                    process_tool_call("\n".join(current_tool_call))
                    current_tool_call = []
                inside_tool_call = False
                continue

            if inside_tool_call:
                current_tool_call.append(line)
                continue

            if line.startswith("{") and line.endswith("}"):
                try:
                    json_obj = json.loads(line)
                    if "name" in json_obj and "arguments" in json_obj:
                        process_tool_call(line)
                except json.JSONDecodeError:
                    pass

        if current_tool_call:
            process_tool_call("\n".join(current_tool_call))

        if not low_level_instruction and len(pyautogui_code) > 0:
            first_action = pyautogui_code[0]
            if "." in first_action:
                action_type = first_action.split(".", 1)[1].split("(", 1)[0]
            else:
                action_type = first_action.lower()
            low_level_instruction = f"Performing {action_type} action"

        return low_level_instruction, pyautogui_code

    @staticmethod
    def _should_giveup_on_context_error(e):
        """Context-length errors are not retried here; predict shortens the history instead."""
        error_str = str(e)
        return "Too Large" in error_str or "context_length_exceeded" in error_str or "413" in error_str

    @backoff.on_exception(backoff.constant, Exception, interval=30, max_tries=10,
                          giveup=_should_giveup_on_context_error.__func__)
    def call_llm(self, payload):
        """OpenAI-compatible chat completion; the server is OPENAI_BASE_URL."""
        client = openai.OpenAI(base_url=os.environ.get("OPENAI_BASE_URL", "url-xxx"),
                               api_key=os.environ.get("OPENAI_API_KEY", "sk-xxx"))
        messages = payload["messages"]
        log_messages(messages, "LLM Request")
        try:
            resp = client.chat.completions.create(
                model=payload["model"],
                messages=messages,
                max_tokens=payload["max_tokens"],
                temperature=self.temperature,
                top_p=self.top_p,
            )
            content = resp.choices[0].message.content
            logger.info(f"LLM Response:\n{content}")
            return content
        except Exception as e:
            logger.error(f"LLM Call failed: {e}")
            raise e
