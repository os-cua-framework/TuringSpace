# Gemini through the Interactions API computer_use tool (ai.google.dev/gemini-api/docs/computer-use), with
# captcha_prompt.AUTHORIZATION as the system instruction. Calls use x / y on a 0-999 grid, scaled to screen pixels.
import base64
import json

from .. import usage
from ..captcha_prompt import AUTHORIZATION, CONTINUE, MAX_CONTINUES

PAGE_URL = 'http://127.0.0.1/captcha'
UNSUPPORTED = {'navigate', 'go_back', 'go_forward', 'open_app', 'list_apps', 'long_press'}


def _g(o, k, d=None):
    return o.get(k, d) if isinstance(o, dict) else getattr(o, k, d)


def call_to_pyautogui(name, a, screen=(1920, 1080)):
    """One computer_use function call -> pyautogui code (screen pixels). Returns None for 'take_screenshot'."""
    W, H = screen
    px = lambda x, y: (int(x / 1000 * W), int(y / 1000 * H))
    at = lambda: px(a['x'], a['y']) if a.get('x') is not None and a.get('y') is not None else None
    if name in ('click', 'double_click', 'triple_click', 'middle_click', 'right_click'):
        fn = {'click': 'click', 'double_click': 'doubleClick', 'triple_click': 'tripleClick', 'middle_click': 'middleClick',
              'right_click': 'rightClick'}[name]
        p = at()
        return f'pyautogui.{fn}({p[0]}, {p[1]})' if p else f'pyautogui.{fn}()'
    if name in ('mouse_down', 'mouse_up'):
        p = at()
        fn = 'mouseDown' if name == 'mouse_down' else 'mouseUp'
        return (f'pyautogui.moveTo({p[0]}, {p[1]})\n' if p else '') + f'pyautogui.{fn}()'
    if name == 'move':
        p = at()
        return f'pyautogui.moveTo({p[0]}, {p[1]})'
    if name == 'drag_and_drop':
        s, e = px(a['start_x'], a['start_y']), px(a['end_x'], a['end_y'])
        return f'pyautogui.moveTo({s[0]}, {s[1]})\npyautogui.mouseDown()\npyautogui.moveTo({e[0]}, {e[1]})\npyautogui.mouseUp()'
    if name == 'type':
        code = f"pyautogui.write({str(a.get('text', ''))!r})"
        return code + ("\npyautogui.press('enter')" if a.get('press_enter') else '')
    if name == 'press_key':
        return f"pyautogui.press({str(a.get('key', ''))!r})"
    if name in ('key_down', 'key_up'):
        return f"pyautogui.{'keyDown' if name == 'key_down' else 'keyUp'}({str(a.get('key', ''))!r})"
    if name == 'hotkey':
        keys = a.get('keys') or []
        keys = keys.split('+') if isinstance(keys, str) else keys
        return f'pyautogui.hotkey(*{[str(k).strip() for k in keys]!r})'
    if name == 'scroll':
        d, mag = a.get('direction', 'down'), float(a.get('magnitude_in_pixels', 300))
        p = at()
        pre = f'pyautogui.moveTo({p[0]}, {p[1]})\n' if p else ''
        clicks = mag / 100                                     # the environment scrolls 100 px per wheel click
        return pre + {'up': f'pyautogui.scroll({clicks})', 'down': f'pyautogui.scroll({-clicks})',
                      'left': f'pyautogui.hscroll({-clicks})', 'right': f'pyautogui.hscroll({clicks})'}[d]
    if name == 'wait':
        return f"time.sleep({float(a.get('seconds', 1))})"
    if name == 'take_screenshot':
        return None
    raise ValueError(f'unknown computer_use function {name!r}')


def _blocked(it, steps, calls):
    """The API stopped the reply before the model answered: status 'failed', or no function call and no model text."""
    if calls:
        return False
    status = _g(it, 'status')
    if status == 'failed':
        return True
    if status == 'incomplete':                          # cut off at the output limit: the model did answer
        return False
    return not any(_g(s, 'type') == 'text' or (_g(s, 'type') == 'model_output' and _g(s, 'content')) for s in steps)


class GeminiComputerAgent:
    def __init__(self, model='gemini-3.8-flash', environment='browser', screen_size=(1920, 1080), thinking_level='medium',
                 api_key=None, client=None, block_retries=3, **kwargs):
        self.model, self.screen = model, tuple(screen_size)
        self.thinking_level = thinking_level
        self.tool = {'type': 'computer_use', 'environment': environment, 'enable_prompt_injection_detection': True}
        self.api_key, self._client = api_key, client
        self.prev_id, self.pending = None, []
        self.last_usage = []
        self.block_retries, self.blocked, self.last_blocks = block_retries, False, []
        self.continues, self.answer_text = 0, False

    @property
    def client(self):
        if self._client is None:
            from google import genai
            self._client = genai.Client(api_key=self.api_key) if self.api_key else genai.Client()   # GEMINI_API_KEY
        return self._client

    def predict(self, instruction, obs):
        img = {'type': 'image', 'data': base64.b64encode(obs['screenshot']).decode(), 'mime_type': 'image/png'}
        if self.prev_id is None:
            inp = [{'type': 'text', 'text': instruction}, img]
        else:
            inp = []
            for call_id, name, err, ack in self.pending:
                body = {'url': PAGE_URL}
                if err:
                    body['error'] = err
                if ack:
                    body['safety_acknowledgement'] = True
                r = {'type': 'function_result', 'name': name, 'call_id': call_id, 'result': body}
                if err:
                    r['is_error'] = True
                inp.append(r)
            inp.append({'type': 'user_input', 'content': [{'type': 'text', 'text': CONTINUE}, img] if self.answer_text else [img]})
            self.answer_text = False
        req = dict(model=self.model, input=inp, tools=[self.tool], generation_config={'thinking_level': self.thinking_level},
                   system_instruction=AUTHORIZATION)
        if self.prev_id:
            req['previous_interaction_id'] = self.prev_id
        dump = lambda s: s.model_dump() if hasattr(s, 'model_dump') else s
        self.last_blocks = []
        # a blocked reply, or a request refused for safety, is sent again up to block_retries times
        for _ in range(1 + self.block_retries):
            with usage.Timer() as t:
                try:
                    it = self.client.interactions.create(**req)
                except Exception as e:
                    status = getattr(e, 'status_code', None) or getattr(e, 'code', None)
                    if status != 400 or 'safety' not in str(e).lower():
                        raise
                    self.last_usage.append(usage.record())
                    self.last_blocks.append({'status': 'request_blocked', 'errors': [str(e)[:500]], 'steps': []})
                    continue
            self.last_usage.append(usage.gemini_interactions(_g(it, 'usage'), t.seconds))
            steps = _g(it, 'steps') or []
            calls = [s for s in steps if _g(s, 'type') == 'function_call']
            if not _blocked(it, steps, calls):
                break
            self.last_blocks.append({'status': _g(it, 'status'), 'errors': [dump(e) for e in (_g(it, 'errors') or [])],
                                     'steps': [dump(s) for s in steps]})
        else:
            self.blocked, self.pending = True, []
            return json.dumps(self.last_blocks, default=str), []
        self.prev_id = _g(it, 'id')
        response = json.dumps([dump(s) for s in steps], default=str)
        if not calls:
            if _g(it, 'status') == 'incomplete':        # cut off at the output limit: no action this call
                self.pending = []
                return response, []
            if self.continues < MAX_CONTINUES:
                self.continues, self.answer_text, self.pending = self.continues + 1, True, []
                return response, ['WAIT']
            return response, ['DONE']
        actions, self.pending = [], []
        for c in calls:
            name, args, cid = _g(c, 'name'), dict(_g(c, 'arguments') or {}), _g(c, 'id')
            ack = (args.get('safety_decision') or {}).get('decision') == 'require_confirmation'
            if name in UNSUPPORTED:
                self.pending.append((cid, name, f'{name} is not available on this screen', ack))
                continue
            try:
                code = call_to_pyautogui(name, args, self.screen)
            except Exception as e:
                self.pending.append((cid, name, f'{type(e).__name__}: {e}', ack))
                continue
            self.pending.append((cid, name, None, ack))
            actions.append('WAIT' if code is None else code)
        return response, actions or ['WAIT']
