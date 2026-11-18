# OSWorld's OpenCUA agent at CoT level l2 with action history; the model's coordinates are pixels of the Qwen2.5-VL
# resized screenshot.
import ast
import logging
import os
import re
import time
import traceback
from typing import Dict, List, Tuple

import httpx
from loguru import logger

from ..captcha_prompt import captcha_system
from .prompts import ACTION_HISTORY_TEMPLATE, INSTRUCTION_TEMPLATE, STEP_TEMPLATE, build_sys_prompt
from .utils import encode_image, smart_resize

FUNCTION_PARAMETERS = {
    'click': ['x', 'y', 'clicks', 'interval', 'button', 'duration', 'pause'],
    'rightClick': ['x', 'y', 'duration', 'tween', 'pause'],
    'middleClick': ['x', 'y', 'duration', 'tween', 'pause'],
    'doubleClick': ['x', 'y', 'interval', 'button', 'duration', 'pause'],
    'tripleClick': ['x', 'y', 'interval', 'button', 'duration', 'pause'],
    'moveTo': ['x', 'y', 'duration', 'tween', 'pause'],
    'dragTo': ['x', 'y', 'duration', 'button', 'mouseDownUp', 'pause'],
}


def parse_response_to_cot_and_action(input_string, screen_size) -> Tuple[str, List[str], dict]:
    """Parses the Observation, Thought and Action sections and the code block of a reply."""
    sections = {}
    try:
        obs_match = re.search(r'^##\s*Observation\s*:?[\n\r]+(.*?)(?=^##\s*Thought:|^##\s*Action:|^##|\Z)', input_string, re.DOTALL | re.MULTILINE)
        if obs_match:
            sections['observation'] = obs_match.group(1).strip()

        thought_match = re.search(r'^##\s*Thought\s*:?[\n\r]+(.*?)(?=^##\s*Action:|^##|\Z)', input_string, re.DOTALL | re.MULTILINE)
        if thought_match:
            sections['thought'] = thought_match.group(1).strip()

        action_match = re.search(r'^##\s*Action\s*:?[\n\r]+(.*?)(?=^##|\Z)', input_string, re.DOTALL | re.MULTILINE)
        if action_match:
            sections['action'] = action_match.group(1).strip()

        code_blocks = re.findall(r'```(?:code|python)?\s*(.*?)\s*```', input_string, re.DOTALL | re.IGNORECASE)
        if not code_blocks:
            logger.error("No code blocks found in the input string")
            return f"<Error>: no code blocks found in the input string: {input_string}", ["FAIL"], sections
        code_block = code_blocks[-1].strip()
        sections['original_code'] = code_block

        if "computer.wait" in code_block.lower():
            sections["code"] = "WAIT"
            return sections['action'], ["WAIT"], sections

        elif "computer.terminate" in code_block.lower():
            lower_block = code_block.lower()
            if ("failure" in lower_block) or ("fail" in lower_block):
                sections['code'] = "FAIL"
                return code_block, ["FAIL"], sections
            elif "success" in lower_block:
                sections['code'] = "DONE"
                return code_block, ["DONE"], sections
            else:
                logger.error("Terminate action found but no specific status provided in code block")
                return f"<Error>: terminate action found but no specific status provided in code block: {input_string}", ["FAIL"], sections

        sections['code'] = project_coordinate_to_absolute_scale(code_block, screen_width=screen_size[0], screen_height=screen_size[1])

        if not sections['code'] or not sections.get('action'):
            logger.error("Missing required action or code section")
            return f"<Error>: no code parsed: {input_string}", ["FAIL"], sections

        return sections['action'], [sections['code']], sections

    except Exception as e:
        error_message = f"<Error>: parsing response: {str(e)}\nTraceback:\n{traceback.format_exc()}\nInput string: {input_string}"
        logger.error(error_message)
        return error_message, ['FAIL'], sections


def _coordinate_projection(x, y, screen_width, screen_height):
    """Model pixels on the resized screenshot -> screen pixels; values in [0, 1] are read as fractions of it."""
    height, width = smart_resize(height=screen_height, width=screen_width, factor=28, min_pixels=3136, max_pixels=12845056)
    if 0 <= x <= 1 and 0 <= y <= 1:
        return int(round(x * width)), int(round(y * height))
    return int(x / width * screen_width), int(y / height * screen_height)


def project_coordinate_to_absolute_scale(code, screen_width, screen_height):
    """Rewrites the x, y of every pyautogui call in code to screen pixels."""
    new_code = code
    for full_call in re.findall(r'(pyautogui\.\w+\([^\)]*\))', code):
        func_match = re.match(r'(pyautogui\.\w+)\((.*)\)', full_call, re.DOTALL)
        if not func_match:
            continue
        func_name = func_match.group(1)
        args_str = func_match.group(2)

        try:
            parsed = ast.parse(f"func({args_str})").body[0].value
            parsed_args = parsed.args
            parsed_keywords = parsed.keywords
        except SyntaxError:
            return code

        param_names = FUNCTION_PARAMETERS.get(func_name.split('.')[-1], [])

        args = {}
        for idx, arg in enumerate(parsed_args):
            if idx < len(param_names):
                args[param_names[idx]] = ast.literal_eval(arg)

        try:
            for kw in parsed_keywords:
                args[kw.arg] = ast.literal_eval(kw.value)
        except Exception as e:
            logger.error(f"Error parsing keyword arguments: {e}")
            return code

        updated = False
        if 'x' in args and 'y' in args:
            try:
                x_rel = float(args['x'])
                y_rel = float(args['y'])
                x_abs, y_abs = _coordinate_projection(x_rel, y_rel, screen_width, screen_height)
                logger.warning(f"Projecting coordinates: ({x_rel}, {y_rel}) to ({x_abs}, {y_abs}) using qwen25 projection.")
                args['x'] = x_abs
                args['y'] = y_abs
                updated = True
            except ValueError:
                pass

        if updated:
            reconstructed_args = []
            for param_name in param_names:
                if param_name not in args:
                    break
                arg_value = args[param_name]
                reconstructed_args.append(f"'{arg_value}'" if isinstance(arg_value, str) else str(arg_value))

            used_params = set(param_names[:len(reconstructed_args)])
            for kw in parsed_keywords:
                if kw.arg not in used_params:
                    arg_value = args[kw.arg]
                    if isinstance(arg_value, str):
                        reconstructed_args.append(f"{kw.arg}='{arg_value}'")
                    else:
                        reconstructed_args.append(f"{kw.arg}={arg_value}")

            new_code = new_code.replace(full_call, f"{func_name}({', '.join(reconstructed_args)})")

    return new_code


class OpenCUAAgent:
    """OpenCUA: observes screenshots and acts with pyautogui code."""

    def __init__(
            self,
            model: str,
            history_type: str,
            max_steps: int,
            max_image_history_length: int = 3,
            max_tokens: int = 1500,
            top_p: float = 0.9,
            temperature: float = 0,
            action_space: str = "pyautogui",
            observation_type: str = "screenshot",
            cot_level: str = "l2",
            screen_size: Tuple[int, int] = (1920, 1080),
            coordinate_type: str = "qwen25",
            use_old_sys_prompt: bool = False,
            password="osworld-public-evaluation",
            **kwargs
    ):
        assert model is not None, "Model cannot be None"
        assert history_type == "action_history", f"Invalid history type: {history_type}"
        assert cot_level == "l2", f"Invalid cot_level: {cot_level}"
        assert coordinate_type == "qwen25", f"Invalid coordinate type: {coordinate_type}"
        assert not use_old_sys_prompt, "use_old_sys_prompt is not supported"
        assert action_space == "pyautogui", "Invalid action space"
        assert observation_type == "screenshot", "Invalid observation type"

        self.model = model
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.temperature = temperature
        self.screen_size = screen_size
        self.max_image_history_length = max_image_history_length
        self.max_steps = max_steps
        self.system_prompt = captcha_system(build_sys_prompt(password), 'opencua')

        self.actions = []
        self.observations = []
        self.cots = []

    def reset(self, _logger=None):
        global logger
        logger = _logger if _logger is not None else logging.getLogger("desktopenv.agent")
        self.observations = []
        self.cots = []
        self.actions = []

    def predict(self, instruction: str, obs: Dict) -> Tuple[str, List[str], Dict]:
        """The next action(s) for the current screenshot."""
        logger.info(f"========================== {self.model} ===================================")
        logger.info(f"Instruction: \n{instruction}")

        messages = [{"role": "system", "content": self.system_prompt}]

        # The last max_image_history_length - 1 steps keep their screenshot; older steps are joined into one message.
        history_step_texts = []
        for i in range(len(self.actions)):
            history_content = STEP_TEMPLATE.format(step_num=i + 1) + ACTION_HISTORY_TEMPLATE.format(
                action=self.cots[i].get('action'))
            if i > len(self.actions) - self.max_image_history_length:
                messages.append({
                    "role": "user",
                    "content": [{
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{encode_image(self.observations[i]['screenshot'])}"}
                    }]
                })
                messages.append({"role": "assistant", "content": history_content})
            else:
                history_step_texts.append(history_content)
                if i == len(self.actions) - self.max_image_history_length:
                    messages.append({"role": "assistant", "content": "\n".join(history_step_texts)})

        messages.append({
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encode_image(obs['screenshot'])}"}},
                {"type": "text", "text": INSTRUCTION_TEMPLATE.format(instruction=instruction)}
            ]
        })

        max_retry = 5
        retry_count = 0
        low_level_instruction = None
        pyautogui_actions = None
        other_cot = {}

        while retry_count < max_retry:
            try:
                response = self.call_llm({
                    "model": self.model,
                    "messages": messages,
                    "max_tokens": self.max_tokens,
                    "top_p": self.top_p,
                    "temperature": self.temperature if retry_count == 0 else max(0.2, self.temperature)
                }, self.model)

                logger.info(f"Model Output: \n{response}")
                if not response:
                    logger.error("No response found in the response.")
                    raise ValueError(f"No response found in the response:\n{response}.")

                low_level_instruction, pyautogui_actions, other_cot = parse_response_to_cot_and_action(response, self.screen_size)
                if "<Error>" in low_level_instruction or not pyautogui_actions:
                    logger.error(f"Error parsing response: {low_level_instruction}")
                    raise ValueError(f"Error parsing response: {low_level_instruction}")
                break

            except Exception as e:
                logger.error(f"Error during message preparation: {e}")
                retry_count += 1
                if retry_count == max_retry:
                    logger.error("Maximum retries reached. Exiting.")
                    return str(e), ['FAIL'], other_cot

        logger.info(f"Action: \n{low_level_instruction}")
        logger.info(f"Code: \n{pyautogui_actions}")

        self.observations.append(obs)
        self.actions.append(low_level_instruction)
        self.cots.append(other_cot)

        if len(self.actions) >= self.max_steps and 'computer.terminate' not in pyautogui_actions[0].lower():
            logger.warning(f"Reached maximum steps {self.max_steps}. Forcing termination.")
            pyautogui_actions = ['FAIL']
            other_cot['code'] = 'FAIL'

        return response, pyautogui_actions, other_cot

    def call_llm(self, payload, model):
        """POST to the chat completions endpoint at OPENCUA_BASE_URL; retries until the reply finishes with stop."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ['OPENCUA_API_KEY']}"
        }
        url = os.environ.get("OPENCUA_BASE_URL", f"https://{self.model}.app.msh.team/v1").rstrip("/") + "/chat/completions"

        for _ in range(20):
            response = httpx.post(url, headers=headers, json=payload, timeout=500, verify=False)

            if response.status_code != 200:
                logger.error("Failed to call LLM: " + response.text)
                logger.error("Retrying...")
                time.sleep(5)
            else:
                response = response.json()
                if response["choices"][0].get("finish_reason") == "stop":
                    return response['choices'][0]['message']['content']
                logger.error("LLM did not finish properly, retrying...")
                time.sleep(5)
