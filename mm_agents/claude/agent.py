# Claude through the Anthropic API computer toolset. Each predict answers the previous tool_use blocks with tool_result
# blocks and returns the new tool_use blocks as actions, each with the pyautogui 'command' the environment runs.
# A turn's calls run in order, in chunks that end at a screenshot / zoom, so that call sees the screen at that point.
import base64
import io
import json
import time

from PIL import Image

from .. import usage
from ..captcha_prompt import AUTHORIZATION, CONTINUE, MAX_CONTINUES

NOT_EXECUTED = 'Not executed: an earlier computer action in this turn failed.'
# xdotool-style key names (the toolset's key / hold_key / modifier text) -> pyautogui names
XKEY = {'return': 'enter', 'kp_enter': 'enter', 'escape': 'esc', 'page_up': 'pageup', 'prior': 'pageup',
        'page_down': 'pagedown', 'next': 'pagedown', 'caps_lock': 'capslock', 'control': 'ctrl', 'ctrl_l': 'ctrl',
        'ctrl_r': 'ctrl', 'control_l': 'ctrl', 'control_r': 'ctrl', 'shift_l': 'shift', 'shift_r': 'shift', 'alt_l': 'alt',
        'alt_r': 'alt', 'super': 'win', 'super_l': 'win', 'super_r': 'win', 'meta': 'win', 'cmd': 'win', 'command': 'win',
        'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right', 'minus': '-', 'plus': '+',
        'equal': '=', 'comma': ',', 'period': '.', 'slash': '/', 'backslash': '\\', 'semicolon': ';', 'apostrophe': "'",
        'grave': '`', 'bracketleft': '[', 'bracketright': ']'}
MODS = {'ctrl', 'shift', 'alt', 'win'}


def _key(name):
    t = str(name).strip()
    return t if len(t) == 1 else XKEY.get(t.lower(), t.lower())


def _combo(text):
    s = str(text or '').strip()
    if not s:
        raise ValueError('text (key name) is required')
    if s == '+':
        return ['+']
    parts = [p.strip() for p in s.split('+')]
    if any(not p for p in parts):
        raise ValueError(f'cannot parse key combination "{s}"')
    return [_key(p) for p in parts]


def _xy(v, what):
    if not (isinstance(v, (list, tuple)) and len(v) == 2 and all(isinstance(n, (int, float)) for n in v)):
        raise ValueError(f'{what} must be [x, y] (numbers)')
    return int(round(v[0])), int(round(v[1]))


def _held(mods_text, body):
    """Wrap pyautogui lines in keyDown/keyUp of the modifier keys named in `text` (clicks, drags, scrolls)."""
    if mods_text is None or str(mods_text).strip() == '':
        return body
    mods = _combo(mods_text)
    if any(m not in MODS for m in mods):
        raise ValueError(f'"{mods_text}" is not a modifier (shift, ctrl, alt, super)')
    down = ''.join(f'pyautogui.keyDown({m!r})\n' for m in mods)
    up = ''.join(f'pyautogui.keyUp({m!r})\n' for m in reversed(mods))
    return down + body + up


def tool_call_to_pyautogui(name, inp, cursor):
    """One computer toolset call -> pyautogui code (screen pixels). Returns (code, new_cursor). Raises on bad input."""
    if name in ('left_click', 'right_click', 'middle_click', 'double_click', 'triple_click'):
        p = cursor if inp.get('coordinate') is None else _xy(inp['coordinate'], 'coordinate')
        fn = {'left_click': 'click', 'right_click': 'rightClick', 'middle_click': 'middleClick',
              'double_click': 'doubleClick', 'triple_click': 'tripleClick'}[name]
        return _held(inp.get('text'), f'pyautogui.moveTo({p[0]}, {p[1]})\npyautogui.{fn}()\n'), p
    if name == 'left_click_drag':
        a, b = _xy(inp.get('start_coordinate'), 'start_coordinate'), _xy(inp.get('coordinate'), 'coordinate')
        return _held(inp.get('text'), f'pyautogui.moveTo({a[0]}, {a[1]})\npyautogui.dragTo({b[0]}, {b[1]}, duration=0.5)\n'), b
    if name == 'mouse_move':
        p = _xy(inp.get('coordinate'), 'coordinate')
        return f'pyautogui.moveTo({p[0]}, {p[1]})\n', p
    if name in ('left_mouse_down', 'left_mouse_up'):
        p = cursor if inp.get('coordinate') is None else _xy(inp['coordinate'], 'coordinate')
        fn = 'mouseDown' if name == 'left_mouse_down' else 'mouseUp'
        return f'pyautogui.moveTo({p[0]}, {p[1]})\npyautogui.{fn}()\n', p
    if name == 'scroll':
        d, n = inp.get('scroll_direction'), inp.get('scroll_amount')
        if d not in ('up', 'down', 'left', 'right'):
            raise ValueError('scroll_direction must be up, down, left or right')
        if not isinstance(n, int) or n < 0:
            raise ValueError('scroll_amount must be a non-negative integer')
        p = cursor if inp.get('coordinate') is None else _xy(inp['coordinate'], 'coordinate')
        call = {'up': f'scroll({n})', 'down': f'scroll({-n})', 'left': f'hscroll({-n})', 'right': f'hscroll({n})'}[d]
        return _held(inp.get('text'), f'pyautogui.moveTo({p[0]}, {p[1]})\npyautogui.{call}\n'), p
    if name == 'type':
        if not isinstance(inp.get('text'), str):
            raise ValueError('text must be a string')
        return f"pyautogui.write({inp['text']!r})\n", cursor
    if name == 'key':
        keys, rep = _combo(inp.get('text')), inp.get('repeat', 1)
        if not isinstance(rep, int) or not 1 <= rep <= 100:
            raise ValueError('repeat must be an integer 1-100')
        return f'pyautogui.hotkey(*{keys!r})\n' * rep, cursor
    if name == 'hold_key':
        keys, d = _combo(inp.get('text')), inp.get('duration')
        if not isinstance(d, (int, float)) or not 0 <= d <= 300:
            raise ValueError('duration must be a number of seconds, 0-300')
        return (''.join(f'pyautogui.keyDown({k!r})\n' for k in keys) + f'time.sleep({d})\n'
                + ''.join(f'pyautogui.keyUp({k!r})\n' for k in reversed(keys))), cursor
    if name == 'wait':
        d = inp.get('duration')
        if not isinstance(d, (int, float)) or not 0 <= d <= 300:
            raise ValueError('duration must be a number of seconds, 0-300')
        return f'time.sleep({d})\n', cursor
    raise ValueError(f'unknown computer action "{name}"')


def _png_block(png):
    return {'type': 'image', 'source': {'type': 'base64', 'media_type': 'image/png', 'data': base64.b64encode(png).decode()}}


def zoom_image(png, region, screen):
    """The toolset's zoom: region [x0, y0, x1, y1] of the screen, scaled up to fit the screen size (aspect kept)."""
    if not (isinstance(region, (list, tuple)) and len(region) == 4 and all(isinstance(n, (int, float)) for n in region)):
        raise ValueError('region must be [x0, y0, x1, y1] (numbers)')
    W, H = screen
    x0, y0 = max(0, min(region[0], region[2])), max(0, min(region[1], region[3]))
    x1, y1 = min(W, max(region[0], region[2])), min(H, max(region[1], region[3]))
    if x1 - x0 < 1 or y1 - y0 < 1:
        raise ValueError('region is empty or outside the screen')
    im = Image.open(io.BytesIO(png)).crop((int(x0), int(y0), int(-(-x1 // 1)), int(-(-y1 // 1))))
    s = min(W / im.width, H / im.height)
    if s != 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, format='PNG')
    return out.getvalue()


class ClaudeAgent:
    def __init__(self, model='claude-sonnet-5-5', env=None, max_tokens=64000, effort='high', screen_size=(1920, 1080),
                 request_timeout=900, client=None, system=AUTHORIZATION, **kwargs):
        self.model, self.max_tokens, self.effort, self.system = model, max_tokens, effort, system
        self.thinking = {'type': 'adaptive', 'display': 'summarized'}
        self.tools = [{'type': 'computer_toolset_20260801'}]
        self.screen = tuple(screen_size)
        self.request_timeout = request_timeout
        self._client = client
        self.messages, self.pending, self.results = [], [], []
        self.last_block, self.cursor, self.failed = None, (0, 0), False
        self.last_usage = []
        self.continues, self.answer_text = 0, False

    @property
    def client(self):
        if self._client is None:
            import anthropic
            self._client = anthropic.Anthropic(max_retries=4)     # ANTHROPIC_API_KEY
        return self._client

    def _call(self):
        body = dict(model=self.model, max_tokens=self.max_tokens, tools=self.tools, thinking=self.thinking,
                    output_config={'effort': self.effort}, messages=self.messages, system=self.system)
        last = None
        for attempt in range(4):
            try:
                with self.client.messages.stream(**body, extra_body={'cache_control': {'type': 'ephemeral'}},
                                                 timeout=self.request_timeout) as stream:
                    msg = stream.get_final_message()
                return msg.model_dump() if hasattr(msg, 'model_dump') else msg
            except Exception as e:
                status = getattr(e, 'status_code', None)
                if isinstance(status, int) and 400 <= status < 500 and status not in (408, 409, 429):
                    raise
                last = e
                time.sleep(5 * (attempt + 1))
        raise last

    def _result(self, block, content, error=False):
        r = {'type': 'tool_result', 'tool_use_id': block['id'], 'content': content}
        if block.get('toolset_name'):
            r['toolset_name'] = block['toolset_name']
        if error:
            r['is_error'] = True
        return r

    def predict(self, instruction, obs):
        png = obs['screenshot']
        if not self.messages:
            self.messages.append({'role': 'user', 'content': [_png_block(png), {'type': 'text', 'text': instruction}]})
        elif self.answer_text:                                    # the last reply had no action
            self.messages.append({'role': 'user', 'content': [_png_block(png), {'type': 'text', 'text': CONTINUE}]})
            self.answer_text = False
        elif self.last_block is not None:                         # the observing call that ended the previous chunk
            b, self.last_block = self.last_block, None
            try:
                if b['name'] == 'screenshot':
                    self.results.append(self._result(b, [_png_block(png)]))
                elif b['name'] == 'zoom':
                    self.results.append(self._result(b, [_png_block(zoom_image(png, b['input'].get('region'), self.screen))]))
            except Exception as e:
                self.results.append(self._result(b, f'Error: {e}'[:300], True))
                self.failed = True
        if not self.pending:                                      # the turn is done: send its results, ask the model
            if self.results:
                # the last successful result carries the current screenshot
                k = max((i for i, r in enumerate(self.results) if not r.get('is_error')), default=None)
                if k is not None and not any(c.get('type') == 'image' for c in (self.results[k]['content'] if isinstance(self.results[k]['content'], list) else [])):
                    self.results[k]['content'] = list(self.results[k]['content']) + [_png_block(png)]
                self.messages.append({'role': 'user', 'content': self.results})
            self.results, self.failed = [], False
            with usage.Timer() as t:
                msg = self._call()
            self.last_usage.append(usage.anthropic(msg.get('usage'), t.seconds))
            self.messages.append({'role': 'assistant', 'content': msg['content']})
            uses = [b for b in msg['content'] if b.get('type') == 'tool_use']
            if msg.get('stop_reason') == 'refusal':
                return json.dumps(msg, default=str), ['FAIL']
            if not uses and msg.get('stop_reason') != 'max_tokens' and self.continues < MAX_CONTINUES:
                self.continues, self.answer_text = self.continues + 1, True
                return json.dumps(msg, default=str), ['WAIT']
            if msg.get('stop_reason') == 'max_tokens' or not uses:
                return json.dumps(msg, default=str), ['DONE']
            self.pending, self.response = uses, json.dumps(msg, default=str)
        # run the next chunk: calls up to and including the next screenshot / zoom
        actions = []
        while self.pending:
            b = self.pending.pop(0)
            if self.failed:
                self.results.append(self._result(b, NOT_EXECUTED, True))
                continue
            name, inp = b.get('name'), b.get('input') or {}
            if name == 'cursor_position':
                self.results.append(self._result(b, [{'type': 'text', 'text': f'X={self.cursor[0]}, Y={self.cursor[1]}'}]))
                continue
            if name in ('screenshot', 'zoom'):
                self.last_block = b
                actions.append('WAIT')                            # nothing to run; the next predict gets the screen
                break
            try:
                code, self.cursor = tool_call_to_pyautogui(name, inp, self.cursor)
            except Exception as e:
                self.results.append(self._result(b, f'Error: {e}'[:300], True))
                self.failed = True
                continue
            self.results.append(self._result(b, [{'type': 'text', 'text': 'OK'}]))
            actions.append({'action_type': 'tool_use', 'name': name, 'input': inp, 'id': b['id'], 'command': code})
        if not actions:
            actions = ['WAIT']
        return self.response, actions
