# UI-Venus-2 agent: the system prompt of captcha_system_prompt.txt, screenshots as user turns, and its action DSL
# (coordinates on a 0-999 grid) turned into pyautogui code.
import base64
import os
import re

from ..captcha_prompt import captcha_system
from ..thinking import REASONING_FIELDS

HERE = os.path.dirname(os.path.abspath(__file__))
GRID = 999
CALL = re.compile(r'\b(DoubleClick|LongPress|Click|Drag|Swipe|Type|Wait|PressEnter|PressBack|PressHome|PressRecent|'
                  r'GetScreenshot|LaunchApp|CallUser|Answer|Finished)\s*\(')
NUM = r'[-+]?(?:\d+(?:\.\d*)?|\.\d+)'


def parse_venus_actions(text):
    """The action calls in text; each call is cut at its matching ')' (quotes and nesting respected)."""
    out, pos = [], 0
    while True:
        m = CALL.search(text, pos)
        if not m:
            break
        i, depth, q = m.end(), 1, None
        while i < len(text) and depth > 0:
            ch = text[i]
            if q:
                if ch == '\\':
                    i += 1
                elif ch == q:
                    q = None
            elif ch in '"\'':
                q = ch
            elif ch in '([':
                depth += 1
            elif ch in ')]':
                depth -= 1
            i += 1
        if depth != 0:
            break
        arg, pos = text[m.end():i - 1], i

        def pt(key):
            r = re.search(rf'\b{key}\s*=\s*[(\[]\s*({NUM})\s*,\s*({NUM})\s*[)\]]', arg)
            return [float(r.group(1)), float(r.group(2))] if r else None

        def st(key):
            r = re.search(rf'\b{key}\s*=\s*([\'"])([\s\S]*?)\1', arg)
            return r.group(2) if r else None
        a = {'name': m.group(1)}
        if a['name'] in ('Click', 'DoubleClick', 'LongPress'):
            a['box'] = pt('box') or pt('bbox')
        elif a['name'] in ('Drag', 'Swipe'):
            a['start'], a['end'] = pt('start'), pt('end')
        elif a['name'] in ('Type', 'CallUser', 'Answer', 'Finished'):
            a['content'] = st('content')
        out.append(a)
    return out


class UIVenusAgent:
    def __init__(self, model='ui-venus-2-9b', base_url=None, api_key=None, n_img=2, temperature=0.0, top_p=0.95,
                 top_k=20, presence_penalty=0.0, max_tokens=40960, seed=996, enable_thinking=True,
                 screen_size=(1920, 1080), client=None, **kwargs):
        self.model, self.n_img = model, n_img
        self.sampling = {k: v for k, v in dict(temperature=temperature, top_p=top_p, max_tokens=max_tokens, seed=seed,
                                               presence_penalty=presence_penalty).items() if v is not None}
        self.extra = {'chat_template_kwargs': {'enable_thinking': enable_thinking}}
        if top_k is not None:
            self.extra['top_k'] = top_k
        self.W, self.H = screen_size
        self.base_url, self.api_key = base_url or os.environ.get('OPENAI_BASE_URL'), api_key or os.environ.get('OPENAI_API_KEY', 'EMPTY')
        self._client = client
        self.template = open(os.path.join(HERE, 'captcha_system_prompt.txt'), encoding='utf-8').read()
        self.shots, self.replies = [], []

    @property
    def client(self):
        if self._client is None:
            import openai
            self._client = openai.OpenAI(base_url=self.base_url, api_key=self.api_key)
        return self._client

    def system(self, instruction):
        """The prompt file with its closing "### User Task" section filled with the instruction."""
        i = self.template.rfind('### User Task\n')
        if i < 0:
            raise ValueError('the UI-Venus CAPTCHA prompt has no "### User Task" section')
        return captcha_system(self.template[:i + len('### User Task\n')] + instruction, 'venus')

    def messages(self, instruction):
        """The current screenshot and the n_img before it; older user turns are empty."""
        img = lambda png: {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + base64.b64encode(png).decode()}}
        k = len(self.shots) - 1
        start = max(0, k - max(0, self.n_img))
        msgs = [{'role': 'system', 'content': self.system(instruction)}]
        for i in range(k):
            msgs.append({'role': 'user', 'content': [img(self.shots[i])] if self.n_img > 0 and i >= start else ''})
            msgs.append({'role': 'assistant', 'content': self.replies[i]})
        msgs.append({'role': 'user', 'content': [img(self.shots[k])]})
        return msgs

    def px(self, c):
        return (max(0, min(self.W - 1, int(c[0] * self.W / GRID))), max(0, min(self.H - 1, int(c[1] * self.H / GRID))))

    def predict(self, instruction, obs):
        self.shots.append(obs['screenshot'])
        r = self.client.chat.completions.create(model=self.model, messages=self.messages(instruction), **self.sampling,
                                                extra_body=self.extra)
        m = r.choices[0].message
        content = m.content or ''
        # the server returns the thinking as reasoning_content or as reasoning, depending on the vLLM version
        thought = next((str(v).strip() for v in (getattr(m, f, None) for f in REASONING_FIELDS) if v), '')
        body = content
        tm = re.search(r'<think>([\s\S]*?)</think>', content, re.I)
        if tm:
            thought = thought or tm.group(1).strip()
            body = content[tm.end():]
        am = re.search(r'<action\b[^>]*>([\s\S]*?)</action>', body, re.I)
        action_text = (am.group(1) if am else body).strip()
        self.last_reasoning = thought
        self.replies.append((f'<think>{thought}</think>\n' if thought else '') + f'<action>{action_text}</action>')
        return content, self.to_pyautogui(parse_venus_actions(action_text))

    def to_pyautogui(self, acts):
        out = []
        for a in acts:
            n = a['name']
            if n in ('Click', 'DoubleClick', 'LongPress') and a.get('box'):
                x, y = self.px(a['box'])
                out.append(f'pyautogui.click({x}, {y})' if n == 'Click' else f'pyautogui.doubleClick({x}, {y})' if n == 'DoubleClick'
                           else f'pyautogui.moveTo({x}, {y})\npyautogui.mouseDown()\ntime.sleep(1)\npyautogui.mouseUp()')
            elif n in ('Drag', 'Swipe') and a.get('start') and a.get('end'):
                (sx, sy), (ex, ey) = self.px(a['start']), self.px(a['end'])
                out.append(f'pyautogui.moveTo({sx}, {sy})\npyautogui.dragTo({ex}, {ey}, duration={0.5 if n == "Drag" else 0.3})')
            elif n == 'Type':
                out.append(f"pyautogui.write({(a.get('content') or '')!r})")
            elif n == 'PressEnter':
                out.append("pyautogui.press('enter')")
            elif n == 'Wait':
                out.append('time.sleep(2)')
            elif n in ('CallUser', 'Answer', 'Finished'):
                out.append('DONE')
                break
            # PressBack / PressHome / PressRecent / GetScreenshot / LaunchApp have no effect in a browser page
        return out
