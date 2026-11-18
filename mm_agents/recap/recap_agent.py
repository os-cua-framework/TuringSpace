# ReCAP-32B-Instruct (ReCAP-Agent/ReCAP-Agent) asked with the prompts, history, decoding and tool-call parsing of its
# authors' CAPTCHA evaluation harness (model family "qwen3"); the parsed actions are returned as pyautogui code.
import base64
import io
import json
import os

from PIL import Image

from .. import usage

GRID = 1000

SUBSEQUENT_PROMPT_DEFAULT = """
Continue solving the CAPTCHA. Observe the current state and take the next actions.
"""

BASE_PROMPT_QWEN3 = """
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
"type": "function",
    "function": {
        "name_for_human": "computer_use",
        "name": "computer_use",
        "description": "\n".join(
            [
                "Use a mouse and keyboard to interact with a computer, and take screenshots.",
                "* This is an interface to a desktop GUI. You do not have access to a terminal or applications menu. You must click on desktop icons to start applications.",
                "* Some applications may take time to start or process actions, so you may need to wait and take successive screenshots to see the results of your actions. E.g. if you click on Firefox and a window doesn't open, try wait and taking another screenshot.",
                "* The screen's resolution is 1000x1000.",
                "* Whenever you intend to move the cursor to click on an element like an icon, you should consult a screenshot to determine the coordinates of the element before moving the cursor.",
                "* If you tried clicking on a program or link but it failed to load even after waiting, try adjusting your cursor position so that the tip of the cursor visually falls on the element that you want to click.",
                "* Make sure to click any buttons, links, icons, etc with the cursor tip in the center of the element. Don't click boxes on their edges unless asked.",
            ]
        ),
        "parameters": {
            "properties": {
                "action": {
                    "description": "\n".join(
                        [
                            "* `key`: Performs key down presses on the arguments passed in order, then performs key releases in reverse order.",
                            "* `type`: Type a string of text on the keyboard.",
                            "* `mouse_move`: Move the cursor to a specified (x, y) pixel coordinate on the screen.",
                            "* `left_click`: Click the left mouse button at a specified (x, y) pixel coordinate on the screen.",
                            "* `left_click_drag`: Click and drag the cursor to a specified (x, y) pixel coordinate on the screen.",
                            "* `right_click`: Click the right mouse button at a specified (x, y) pixel coordinate on the screen.",
                            "* `middle_click`: Click the middle mouse button at a specified (x, y) pixel coordinate on the screen.",
                            "* `double_click`: Double-click the left mouse button at a specified (x, y) pixel coordinate on the screen.",
                            "* `triple_click`: Triple-click the left mouse button at a specified (x, y) pixel coordinate on the screen (simulated as double-click since it's the closest action).",
                            "* `scroll`: Performs a scroll of the mouse scroll wheel.",
                            "* `hscroll`: Performs a horizontal scroll (mapped to regular scroll).",
                            "* `wait`: Wait specified seconds for the change to happen.",
                            "* `terminate`: Terminate the current task and report its completion status.",
                            "* `answer`: Answer a question.",
                        ]
                    ),
                    "enum": [
                        "key",
                        "type",
                        "mouse_move",
                        "left_click",
                        "left_click_drag",
                        "right_click",
                        "middle_click",
                        "double_click",
                        "scroll",
                        "wait",
                        "terminate",
                    ],
                    "type": "string",
                },
                "keys": {"description": "Required only by `action=key`.", "type": "array"},
                "text": {"description": "Required only by `action=type`.", "type": "string"},
                "coordinate": {"description": "The x,y coordinates for mouse actions.", "type": "array"},
                "pixels": {"description": "The amount of scrolling.", "type": "number"},
                "time": {"description": "The seconds to wait.", "type": "number"},
                "status": {"description": "The status of the task.", "type": "string", "enum": ["success", "failure"]},
            },
            "required": ["action"],
            "type": "object",
        },
        "args_format": "Format the arguments as a JSON object.",
    },
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{{"name": <function-name>, "arguments": <args-json-object>}}
</tool_call>

# Response format

Response format for every step:
1) A single <tool_call>...</tool_call> block containing only the JSON: {{"name": <function-name>, "arguments": <args-json-object>}}.

Rules:
- Be brief: output concise thoughts.
- Do not output anything else outside those parts.
- If finishing, use action=terminate in the tool call.
"""


def extract_tool_calls(response):
    """The text of each <tool_call> block, or of a line that is a bare JSON object."""
    calls, inside, buf = [], False, []
    for raw in response.splitlines():
        line = raw.strip()
        if not line:
            continue
        if '<tool_call>' in line:
            if '</tool_call>' in line:
                payload = line[line.find('<tool_call>') + len('<tool_call>'):line.find('</tool_call>')].strip()
                if payload:
                    calls.append(payload)
                continue
            inside, buf = True, []
            continue
        if line.startswith('</tool_call>'):
            inside = False
            if buf:
                calls.append('\n'.join(buf))
                buf = []
            continue
        if inside:
            buf.append(line)
            continue
        if line.startswith('{') and line.endswith('}'):
            calls.append(line)
    if buf:
        calls.append('\n'.join(buf))
    return calls


def _load(candidate):
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, list):
        return [p for p in parsed if isinstance(p, dict)]
    return [parsed] if isinstance(parsed, dict) else []


def extract_payloads(text):
    """The JSON objects of one tool call: one JSON value, a comma-separated run of them, or every JSON fragment found."""
    s = text.strip()
    if not s:
        return []
    for cand in (s, '[' + s.rstrip(', \t\r\n') + ']'):
        got = _load(cand)
        if got is not None:
            return got
    dec, out, i = json.JSONDecoder(), [], 0
    while i < len(s):
        while i < len(s) and s[i] not in '{[':
            i += 1
        if i >= len(s):
            break
        try:
            parsed, end = dec.raw_decode(s, i)
        except json.JSONDecodeError:
            i += 1
            continue
        out += [p for p in parsed if isinstance(p, dict)] if isinstance(parsed, list) else [parsed] if isinstance(parsed, dict) else []
        i = end
        while i < len(s) and s[i] in ' \t\r\n,':
            i += 1
    return out


ACTION_TYPES = {'left_click': 'click', 'right_click': 'right_click', 'middle_click': 'middle_click',
                'double_click': 'double_click', 'mouse_move': 'mouse_move', 'left_click_drag': 'drag_to'}


def parse_actions(response):
    """Action dicts (type, x, y on the 1000 grid, text, keys, pixels, duration) of every computer_use call."""
    acts = []
    for call in extract_tool_calls(response):
        for p in extract_payloads(call):
            if p.get('name') != 'computer_use':
                continue
            args = p.get('arguments') or {}
            name = args.get('action')
            if not name:
                continue
            coord = args.get('coordinate')
            x = y = None
            if isinstance(coord, (list, tuple)) and len(coord) >= 2:
                x, y = coord[0], coord[1]
            a = dict(type=None, x=None, y=None, text=None, keys=None, pixels=None, duration=None)
            if name in ACTION_TYPES:
                a.update(type=ACTION_TYPES[name], x=x, y=y, duration=args.get('duration') if name == 'left_click_drag' else None)
            elif name == 'type':
                a.update(type='type', text=args.get('text', ''))
            elif name == 'key':
                keys = args.get('keys')
                keys = [str(k) for k in keys] if isinstance(keys, list) else keys.replace('+', ' ').split() if isinstance(keys, str) else None
                a.update(type='key', keys=keys)
            elif name == 'scroll':
                a.update(type='scroll', x=x, y=y, pixels=args.get('pixels'))
            elif name == 'wait':
                a.update(type='wait', duration=args.get('time', 5.0))
            elif name in ('terminate', 'answer'):
                a.update(type='terminate')
            else:
                continue
            acts.append(a)
    return acts


def to_pixels(acts, W, H):
    """Grid coordinates to pixels, rounded and clamped to [0, size]; a pointer action without both coordinates is
    dropped (scroll is kept without them)."""
    def conv(v, size):
        if v is None:
            return None
        try:
            n = float(v) * (size / (GRID - 1))
        except (TypeError, ValueError):
            return None
        return int(round(max(0.0, min(n, float(size)))))
    out = []
    for a in acts:
        if a['type'] in ('click', 'double_click', 'right_click', 'middle_click', 'mouse_move', 'drag_to', 'scroll'):
            a['x'], a['y'] = conv(a['x'], W), conv(a['y'], H)
            if a['type'] != 'scroll' and (a['x'] is None or a['y'] is None):
                continue
        out.append(a)
    return out


def summary(a):
    """One action as a line of "Previous Actions Taken"; other types print their name."""
    t = a.get('type', 'unknown')
    if t == 'click':
        return f"Clicked at ({a.get('x', '?')}, {a.get('y', '?')})"
    if t == 'type':
        return f"Typed '{a.get('text', '')}'"
    if t == 'wait':
        return 'Waited'
    if t in ('finished', 'terminate'):
        return 'Indicated finished'
    if t == 'scroll':
        return f"Scrolled {a.get('text', 'unknown')} at ({a.get('x', '?')}, {a.get('y', '?')})"
    return str(t)


def to_pyautogui(a):
    t, x, y = a['type'], a['x'], a['y']
    if t == 'click':
        return f'pyautogui.click({x}, {y})'
    if t == 'double_click':
        return f'pyautogui.doubleClick({x}, {y})'
    if t == 'right_click':
        return f'pyautogui.rightClick({x}, {y})'
    if t == 'middle_click':
        return f'pyautogui.middleClick({x}, {y})'
    if t == 'mouse_move':
        return f'pyautogui.moveTo({x}, {y})'
    if t == 'drag_to':
        return f'pyautogui.dragTo({x}, {y})'
    if t == 'type':
        return f"pyautogui.write({(a['text'] or '')!r})"
    if t == 'key':
        return f'pyautogui.hotkey(*{a["keys"]!r})' if a['keys'] else None
    if t == 'scroll':                                    # positive pixels scroll down
        return f'pyautogui.scroll({-(float(a["pixels"]) if a["pixels"] is not None else 1.0) / 100})'
    if t == 'wait':
        return f'time.sleep({float(a["duration"] if a["duration"] is not None else 5.0)})'
    return None                                          # terminate is not executed


class ReCAPAgent:
    def __init__(self, model='recap', base_url=None, api_key=None, temperature=0.8, top_p=0.9, max_tokens=1024,
                 screen_size=(1920, 1080), client=None, **kwargs):
        self.model = model
        self.sampling = dict(temperature=temperature, top_p=top_p, max_completion_tokens=max_tokens)
        self.W, self.H = screen_size
        self.base_url, self.api_key = base_url or os.environ.get('OPENAI_BASE_URL'), api_key or os.environ.get('OPENAI_API_KEY', 'EMPTY')
        self._client = client
        self.history = []                                 # no system turn
        self.rounds = []                                  # [(round, [action dicts])]

    @property
    def client(self):
        if self._client is None:
            import openai
            self._client = openai.OpenAI(base_url=self.base_url, api_key=self.api_key)
        return self._client

    def prompt(self):
        call = len(self.rounds) + 1
        if call == 1:
            return BASE_PROMPT_QWEN3
        ctx = '\n\n## Previous Actions Taken:\n'
        for r, acts in self.rounds:
            ctx += (f'Round {r}: ' + '; '.join(summary(a) for a in acts) + '\n') if acts else f'Round {r}: No action parsed\n'
        return SUBSEQUENT_PROMPT_DEFAULT + ctx

    def ask(self, text, png):
        buf = io.BytesIO()
        Image.open(io.BytesIO(png)).convert('RGB').save(buf, format='JPEG')
        self.history.append({'role': 'user', 'content': [
            {'type': 'text', 'text': text}, {'type': 'text', 'text': 'Current CAPTCHA state'},
            {'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode('ascii')}}]})
        with usage.Timer() as t:
            r = self.client.chat.completions.create(model=self.model, messages=self.history, **self.sampling)
        self.last_usage.append(usage.openai_chat(r.usage, t.seconds))
        content = r.choices[0].message.content or ''
        self.history.append({'role': 'assistant', 'content': content})
        return content

    def predict(self, instruction, obs):
        self.last_usage = []
        text = self.prompt()
        content = self.ask(text, obs['screenshot'])
        acts = to_pixels(parse_actions(content), self.W, self.H)
        if not acts:                                     # asked once more on the same screenshot
            retry = self.ask(text, obs['screenshot'])
            content = content + '\n\n[no action parsed; asked again]\n' + retry
            acts = to_pixels(parse_actions(retry), self.W, self.H)
        if not acts:
            return content, []
        self.rounds.append((len(self.rounds) + 1, acts))
        code = [c for c in (to_pyautogui(a) for a in acts) if c]
        return content, code or ['WAIT']                 # terminate alone: the episode goes on
