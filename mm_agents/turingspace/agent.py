# The agent of TuringSpace-9B, asked exactly in the format of its training samples: no system message (the
# computer_use tool is sent as the request's tools), thinking off, screenshots resized to 1280x720 JPEG, and only the
# last `window` screenshots shown; earlier ones become QwenAgent.COLLAPSED_SCREENSHOT_TEXT.
import base64
import io
import json
import logging

from PIL import Image

from ..qwen.actions import parse_internal_response
from ..qwen.client import call_openai_compatible
from ..qwen.main import QwenAgent
from ..qwen.parser import iter_tool_call_params, parse_coordinate
from ..qwen.prompts import build_instruction_prompt, build_internal_tools_def

logger = logging.getLogger('desktopenv.turingspace_agent')

TOOLS = [build_internal_tools_def(1000, 1000, 'relative')]
COLLAPSED = QwenAgent.COLLAPSED_SCREENSHOT_TEXT
SIZE = (1280, 720)


def train_image(png_bytes):
    """Screenshot -> (data URL of the 1280x720 JPEG the training frames are made of, original (w, h))."""
    im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    b = io.BytesIO()
    im.resize(SIZE, Image.LANCZOS).save(b, 'JPEG', quality=90, optimize=True, progressive=True, subsampling=0)
    return 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode(), im.size


def call_args(params):
    """Parsed <parameter=...> values -> the arguments of a training tool_call (coordinate as a list of ints)."""
    out = {}
    for k, v in params.items():
        if k == 'coordinate':
            v = [int(round(c)) for c in (parse_coordinate(v) or [])]
        out[k] = v
    return out


class TuringSpaceAgent:
    def __init__(self, model, base_url=None, api_key=None, temperature=0.0, top_p=1.0, max_tokens=2048, window=20,
                 **sampling):
        self.model, self.base_url, self.api_key = model, base_url, api_key
        self.temperature, self.top_p, self.max_tokens, self.window = temperature, top_p, max_tokens, int(window)
        self.sampling = sampling                   # further vLLM sampling fields, e.g. top_k
        self.first = None                          # (data URL, size) of the first screenshot
        self.turns = []                            # [{'calls': [arguments, ...], 'raw': reply, 'shot': data URL}]
        self.last_usage = []

    def shown(self, s, n):
        """Is screenshot s (0 = the first one) in the prompt for turn n?"""
        return s > n - self.window

    def messages(self, shot):
        """The prompt for turn n = len(self.turns), `shot` being the screenshot after turn n-1."""
        n = len(self.turns)
        text = build_instruction_prompt(self.instruction, 'None')
        msgs = [{'role': 'user', 'content': [{'type': 'image_url', 'image_url': {'url': self.first[0]}},
                                             {'type': 'text', 'text': text}] if self.shown(0, n) else text}]
        for k, t in enumerate(self.turns):
            if t['calls']:
                msgs.append({'role': 'assistant', 'content': '', 'tool_calls': [
                    {'id': f'call_{k}_{j}', 'type': 'function',
                     'function': {'name': 'computer_use', 'arguments': json.dumps(a, ensure_ascii=False)}}
                    for j, a in enumerate(t['calls'])]})
                call_id = f'call_{k}_{len(t["calls"]) - 1}'
            else:                                  # no parsable call: the reply as it was
                msgs.append({'role': 'assistant', 'content': t['raw']})
                call_id = f'call_{k}_none'
            after = shot if k == n - 1 else self.turns[k + 1]['shot']
            content = [{'type': 'image_url', 'image_url': {'url': after}}] if self.shown(k + 1, n) else COLLAPSED
            msgs.append({'role': 'tool', 'tool_call_id': call_id, 'content': content})
        return msgs

    def predict(self, instruction, obs):
        shot, size = train_image(obs['screenshot'])
        if self.first is None:
            self.first, self.instruction = (shot, size), instruction
        msgs = self.messages(shot)
        # tool_choice none: the tools are rendered into the prompt and the reply comes back as raw text
        payload = {'messages': msgs, 'max_tokens': self.max_tokens, 'temperature': self.temperature, 'top_p': self.top_p,
                   'extra_body': {'tools': TOOLS, 'tool_choice': 'none',
                                  'chat_template_kwargs': {'enable_thinking': False}, **self.sampling}}
        reply = call_openai_compatible(payload, self.model, base_url=self.base_url, api_key=self.api_key,
                                       default_max_tokens=self.max_tokens, default_temperature=self.temperature,
                                       default_top_p=self.top_p, logger=logger, usage_sink=self.last_usage) or ''
        calls = [call_args(p) for p in iter_tool_call_params(reply) if p.get('action')]
        self.turns.append({'calls': calls, 'raw': reply, 'shot': shot})
        _, code = parse_internal_response(reply, coordinate_type='relative', original_width=size[0],
                                          original_height=size[1])
        return reply, code

    def reset(self, _logger=None, *args, **kwargs):
        global logger
        logger = _logger or logger
        self.first, self.turns, self.last_usage = None, [], []
