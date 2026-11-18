# OSWorld's QwenAgent: XML tool calls on a 0-999 grid, history truncated to `history_n` steps, old screenshots folded
# into COLLAPSED_SCREENSHOT_TEXT by `image_max` / `fold_size`.
import logging
from typing import Dict, List, Optional, Tuple

from ..captcha_prompt import captcha_system
from .actions import parse_internal_response
from .client import call_openai_compatible
from .history import (
    build_messages,
    ensure_empty_think_prefix,
    previous_actions_text,
    update_folding_state,
)
from .images import image_size_from_base64, image_size_from_bytes, process_image
from .prompts import build_instruction_prompt, build_internal_system_prompt, build_internal_tools_def

logger = logging.getLogger("desktopenv.qwen_agent")


class QwenAgent:
    COLLAPSED_SCREENSHOT_TEXT = "This screenshot has been collapsed."

    def __init__(
        self,
        model: str = "qwen-vl",
        max_tokens: int = 32768,
        top_p: float = 0.9,
        temperature: float = 0.0,
        action_space: str = "pyautogui",
        observation_type: str = "screenshot",
        history_n: int = 100,
        add_thought_prefix: bool = False,
        coordinate_type: str = "relative",
        image_max: int = 20,
        fold_size: int = 10,
        collapse_text: Optional[str] = None,
        enable_thinking: bool = False,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.model = model
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.temperature = temperature
        self.action_space = action_space
        self.observation_type = observation_type
        self.history_n = history_n
        self.add_thought_prefix = add_thought_prefix
        self.coordinate_type = coordinate_type
        self.image_max = int(image_max)
        self.fold_size = int(fold_size)
        self.collapse_text = collapse_text or self.COLLAPSED_SCREENSHOT_TEXT
        self.enable_thinking = enable_thinking
        self.base_url = base_url
        self.api_key = api_key

        if action_space != "pyautogui":
            raise ValueError("QwenAgent supports only pyautogui action space")
        if observation_type != "screenshot":
            raise ValueError("QwenAgent supports only screenshot observations")
        if self.image_max < 1:
            raise ValueError("image_max must be >= 1")
        if self.fold_size < 1:
            raise ValueError("fold_size must be >= 1")

        self.actions: List[str] = []
        self.responses: List[str] = []
        self.screenshots: List[str] = []
        self.folded_prefix_k = 0

    def _build_payload(self, messages: List[Dict]) -> Dict:
        return {
            "model": self.model,
            "messages": messages,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "temperature": self.temperature,
        }

    def predict(self, instruction: str, obs: Dict) -> Tuple[str, List[str]]:
        screenshot_bytes = obs["screenshot"]

        original_width, original_height = image_size_from_bytes(screenshot_bytes)
        processed_b64 = process_image(screenshot_bytes)
        processed_width, processed_height = image_size_from_base64(processed_b64)

        self.screenshots.append(processed_b64)
        total_steps = len(self.screenshots)
        self.folded_prefix_k = update_folding_state(
            total_steps,
            self.folded_prefix_k,
            self.image_max,
            self.fold_size,
        )

        start_step = max(1, total_steps - self.history_n)
        previous_actions_str = previous_actions_text(self.actions, start_step)

        tools_def = build_internal_tools_def(processed_width, processed_height, self.coordinate_type)
        system_prompt = captcha_system(build_internal_system_prompt(tools_def, self.collapse_text), 'qwen')
        instruction_prompt = build_instruction_prompt(instruction, previous_actions_str)

        messages = build_messages(
            system_prompt=system_prompt,
            instruction_prompt=instruction_prompt,
            screenshots=self.screenshots,
            responses=self.responses,
            start_step=start_step,
            total_steps=total_steps,
            folded_prefix_k=self.folded_prefix_k,
            collapse_text=self.collapse_text,
            response_transform=ensure_empty_think_prefix,
        )

        response = self.call_llm(self._build_payload(messages), self.model)

        logger.info("Qwen Output: %s", response)
        self.responses.append(response or "")

        low_level_instruction, pyautogui_code = parse_internal_response(
            response or "",
            coordinate_type=self.coordinate_type,
            original_width=original_width,
            original_height=original_height,
            processed_width=processed_width,
            processed_height=processed_height,
        )

        logger.info("Low level instruction: %s", low_level_instruction)
        logger.info("Pyautogui code: %s", pyautogui_code)

        self.actions.append(low_level_instruction)
        return response or "", pyautogui_code

    def call_llm(self, payload: Dict, model: str) -> str:
        return call_openai_compatible(
            payload,
            model,
            base_url=self.base_url,
            api_key=self.api_key,
            default_max_tokens=self.max_tokens,
            default_temperature=self.temperature,
            default_top_p=self.top_p,
            logger=logger,
        )

    def reset(self, _logger=None, *args, **kwargs):
        global logger
        logger = _logger if _logger is not None else logging.getLogger("desktopenv.qwen_agent")
        self.actions = []
        self.responses = []
        self.screenshots = []
        self.folded_prefix_k = 0
