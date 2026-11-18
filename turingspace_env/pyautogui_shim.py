# Runs the pyautogui code an agent emits against the page. Coordinates are screenshot pixels (1920x1080); the page's
# mouse takes CSS pixels, so every position is divided by the device pixel ratio. `import pyautogui`, `time`, `math`
# and `pyperclip` resolve to this module and any other import fails.
import builtins
import math
import time
from collections import namedtuple

Point = namedtuple('Point', 'x y')
Size = namedtuple('Size', 'width height')

# pyautogui key names -> Playwright key names. Ctrl is "ControlOrMeta" (Cmd on a macOS host).
KEYS = {
    'enter': 'Enter', 'return': 'Enter', '\n': 'Enter', 'esc': 'Escape', 'escape': 'Escape', 'tab': 'Tab', '\t': 'Tab',
    'backspace': 'Backspace', 'delete': 'Delete', 'del': 'Delete', 'space': ' ', ' ': ' ', 'up': 'ArrowUp',
    'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight', 'pageup': 'PageUp', 'pagedown': 'PageDown',
    'pgup': 'PageUp', 'pgdn': 'PageDown', 'home': 'Home', 'end': 'End', 'insert': 'Insert', 'ctrl': 'ControlOrMeta',
    'ctrlleft': 'ControlOrMeta', 'ctrlright': 'ControlOrMeta', 'control': 'ControlOrMeta', 'shift': 'Shift', 'shiftleft': 'Shift',
    'shiftright': 'Shift', 'alt': 'Alt', 'altleft': 'Alt', 'altright': 'Alt', 'option': 'Alt', 'cmd': 'Meta',
    'command': 'Meta', 'win': 'Meta', 'winleft': 'Meta', 'winright': 'Meta', 'super': 'Meta', 'meta': 'Meta',
    'capslock': 'CapsLock',
}
for _i in range(1, 13):
    KEYS[f'f{_i}'] = f'F{_i}'


# Browser zoom shortcuts (Chrome): with Ctrl (or Cmd) held, + / = zoom in, - zoom out, 0 resets; so does Ctrl + wheel.
ZOOM_KEYS = {'+': 1, '=': 1, 'plus': 1, 'equal': 1, 'add': 1, '-': -1, '_': -1, 'minus': -1, 'subtract': -1, '0': 0}
ZOOM_MODIFIERS = ('ControlOrMeta', 'Control', 'Meta')


SELECTED_TEXT = """() => { const e = document.activeElement;
  if (e && typeof e.selectionStart === 'number' && e.value !== undefined) return e.value.slice(e.selectionStart, e.selectionEnd);
  return String(window.getSelection() || ''); }"""


def key_name(k):
    k = str(k)
    return KEYS.get(k.lower(), k if len(k) == 1 else k[:1].upper() + k[1:])


class PyAutoGUIShim:
    """The subset of pyautogui that GUI agents emit, driving a Playwright page. Tracks the pointer in screen pixels."""
    MINIMUM_DURATION = 0.1    # pyautogui: shorter moves are instant
    MINIMUM_SLEEP = 0.05      # pyautogui: a tweened move takes one step per MINIMUM_SLEEP at most

    def __init__(self, page, screen_size, dpr, start=(0, 0), on_zoom=None):
        self.page, self.dpr = page, dpr
        self.on_zoom = on_zoom    # the browser's zoom (CaptchaEnv.zoom_step): +1 / -1 / 0 = reset
        self.held = set()         # keys held down with keyDown
        self.W, self.H = screen_size
        self.x, self.y = start
        self.FAILSAFE, self.PAUSE = False, 0.0
        self.buttons_down = set()
        self.clipboard = Clipboard()
        self.page.mouse.move(self.x / dpr, self.y / dpr)

    # ---- pointer
    def _xy(self, x, y):
        if isinstance(x, (tuple, list)):
            x, y = x[0], x[1]
        return (self.x if x is None else float(x)), (self.y if y is None else float(y))

    def _go(self, x, y, duration=0.0):
        x = min(max(x, 0), self.W - 1)
        y = min(max(y, 0), self.H - 1)
        if duration and duration >= self.MINIMUM_DURATION:
            n = max(1, int(duration / self.MINIMUM_SLEEP))
            x0, y0 = self.x, self.y
            for i in range(1, n + 1):
                self.page.mouse.move((x0 + (x - x0) * i / n) / self.dpr, (y0 + (y - y0) * i / n) / self.dpr)
                time.sleep(duration / n)
        else:
            self.page.mouse.move(x / self.dpr, y / self.dpr)
        self.x, self.y = x, y

    def position(self):
        return Point(int(self.x), int(self.y))

    def size(self):
        return Size(self.W, self.H)

    def onScreen(self, x, y=None):
        x, y = self._xy(x, y)
        return 0 <= x < self.W and 0 <= y < self.H

    def moveTo(self, x=None, y=None, duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self._go(*self._xy(x, y), duration)

    def moveRel(self, xOffset=0, yOffset=0, duration=0.0, tween=None, logScreenshot=None, _pause=True):
        if isinstance(xOffset, (tuple, list)):
            xOffset, yOffset = xOffset
        self._go(self.x + (xOffset or 0), self.y + (yOffset or 0), duration)

    move = moveRel

    def mouseDown(self, x=None, y=None, button='left', duration=0.0, tween=None, logScreenshot=None, _pause=True):
        if x is not None or y is not None:
            self._go(*self._xy(x, y))
        self.page.mouse.down(button=button)
        self.buttons_down.add(button)

    def mouseUp(self, x=None, y=None, button='left', duration=0.0, tween=None, logScreenshot=None, _pause=True):
        if x is not None or y is not None:
            self._go(*self._xy(x, y))
        self.page.mouse.up(button=button)
        self.buttons_down.discard(button)

    def click(self, x=None, y=None, clicks=1, interval=0.0, button='left', duration=0.0, tween=None, logScreenshot=None, _pause=True):
        if x is not None or y is not None:
            self._go(*self._xy(x, y), duration)
        if button == 'primary':
            button = 'left'
        for i in range(int(clicks)):
            self.page.mouse.down(button=button, click_count=i + 1)
            self.page.mouse.up(button=button, click_count=i + 1)
            if interval and i < clicks - 1:
                time.sleep(interval)

    def leftClick(self, x=None, y=None, interval=0.0, duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self.click(x, y, 1, interval, 'left', duration)

    def rightClick(self, x=None, y=None, interval=0.0, duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self.click(x, y, 1, interval, 'right', duration)

    def middleClick(self, x=None, y=None, interval=0.0, duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self.click(x, y, 1, interval, 'middle', duration)

    def doubleClick(self, x=None, y=None, interval=0.0, button='left', duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self.click(x, y, 2, interval, button, duration)

    def tripleClick(self, x=None, y=None, interval=0.0, button='left', duration=0.0, tween=None, logScreenshot=None, _pause=True):
        self.click(x, y, 3, interval, button, duration)

    def dragTo(self, x=None, y=None, duration=0.0, button='left', tween=None, logScreenshot=None, _pause=True, mouseDownUp=True):
        # pyautogui: press at the CURRENT position, move (tweened over `duration`) to (x, y), release
        if mouseDownUp:
            self.page.mouse.down(button=button)
        self._go(*self._xy(x, y), duration)
        if mouseDownUp:
            self.page.mouse.up(button=button)

    def dragRel(self, xOffset=0, yOffset=0, duration=0.0, button='left', tween=None, logScreenshot=None, _pause=True, mouseDownUp=True):
        if isinstance(xOffset, (tuple, list)):
            xOffset, yOffset = xOffset
        self.dragTo(self.x + (xOffset or 0), self.y + (yOffset or 0), duration, button, mouseDownUp=mouseDownUp)

    drag = dragRel

    def scroll(self, clicks, x=None, y=None, logScreenshot=None, _pause=True):
        if x is not None or y is not None:
            self._go(*self._xy(x, y))
        if self.on_zoom and self.held & set(ZOOM_MODIFIERS) and float(clicks):   # Ctrl + wheel: one zoom step per click
            for _ in range(int(abs(float(clicks))) or 1):
                self.on_zoom(1 if float(clicks) > 0 else -1)
            return
        self.page.mouse.wheel(0, -100 * float(clicks))     # pyautogui: positive = up

    vscroll = scroll

    def hscroll(self, clicks, x=None, y=None, logScreenshot=None, _pause=True):
        if x is not None or y is not None:
            self._go(*self._xy(x, y))
        self.page.mouse.wheel(100 * float(clicks), 0)      # positive = right

    # ---- keyboard
    def write(self, message, interval=0.0, logScreenshot=None, _pause=True):
        if isinstance(message, (list, tuple)):              # a list of key names, as pyautogui accepts
            for k in message:
                self.press(k)
                if interval:
                    time.sleep(interval)
            return
        for ch in str(message):
            if ch == '\n':
                self.page.keyboard.press('Enter')
            else:
                self.page.keyboard.type(ch)
            if interval:
                time.sleep(interval)

    typewrite = write

    def _zoom_key(self, modifiers, key):
        """A browser zoom shortcut? Then zoom (the page never sees it, as in a browser) and return True."""
        if self.on_zoom and set(modifiers) & set(ZOOM_MODIFIERS) and str(key).lower() in ZOOM_KEYS:
            self.on_zoom(ZOOM_KEYS[str(key).lower()])
            return True
        return False

    def press(self, keys, presses=1, interval=0.0, logScreenshot=None, _pause=True):
        keys = [keys] if isinstance(keys, str) else list(keys)
        for _ in range(int(presses)):
            for k in keys:
                if self._zoom_key(self.held, key_name(k)):
                    continue
                self.page.keyboard.press(key_name(k))
                if interval:
                    time.sleep(interval)

    def keyDown(self, key, logScreenshot=None, _pause=True):
        if self._zoom_key(self.held, key_name(key)):
            return
        self.held.add(key_name(key))
        self.page.keyboard.down(key_name(key))

    def keyUp(self, key, logScreenshot=None, _pause=True):
        if key_name(key) not in self.held and str(key_name(key)).lower() in ZOOM_KEYS and self.held & set(ZOOM_MODIFIERS):
            return                                          # the up of a zoom key, swallowed like its down
        self.held.discard(key_name(key))
        self.page.keyboard.up(key_name(key))

    def hotkey(self, *keys, interval=0.0, logScreenshot=None, _pause=True):
        if len(keys) == 1 and isinstance(keys[0], (list, tuple)):
            keys = keys[0]
        names = [key_name(k) for k in keys]
        if len(names) == 2 and names[0] in ZOOM_MODIFIERS and names[1].lower() == 'v':
            self.page.keyboard.insert_text(self.clipboard.text)   # paste: the system clipboard (pyperclip) into the page
            return
        if len(names) == 2 and names[0] in ZOOM_MODIFIERS and names[1].lower() in ('c', 'x'):
            self.clipboard.copy(self.page.evaluate(SELECTED_TEXT))    # copy / cut: the selection into that clipboard
        if names and self._zoom_key(set(names[:-1]) | self.held, names[-1]):
            return
        for k in names:
            self.page.keyboard.down(k)
        for k in reversed(names):
            self.page.keyboard.up(k)

    def sleep(self, seconds):
        time.sleep(seconds)

    def isShiftCharacter(self, character):
        return character.isupper() or character in '~!@#$%^&*()_+{}|:"<>?'

    def __setattr__(self, name, value):
        object.__setattr__(self, name, value)   # pyautogui.FAILSAFE = False etc. are accepted and ignored


class Clipboard:
    """The system clipboard as agent code sees it through `import pyperclip` (UI-TARS types by copy + ctrl+v)."""
    def __init__(self):
        self.text = ''

    def copy(self, text):
        self.text = str(text)

    def paste(self):
        return self.text


ALLOWED_MODULES = {'time': time, 'math': math}


def run_code(shim, code):
    """Run agent pyautogui code with `pyautogui` bound to the shim. Any import other than pyautogui / time / math fails."""
    def _import(name, globals=None, locals=None, fromlist=(), level=0):
        root = name.split('.')[0]
        if root == 'pyautogui':
            return shim
        if root in ALLOWED_MODULES:
            return ALLOWED_MODULES[root]
        if root == 'pyperclip':
            return shim.clipboard
        raise ImportError(f'module {name!r} is not available')
    safe_builtins = dict(vars(builtins))
    safe_builtins['__import__'] = _import
    for k in ('open', 'exec', 'eval', 'compile', 'input', 'exit', 'quit'):
        safe_builtins.pop(k, None)
    exec(code, {'__builtins__': safe_builtins, 'pyautogui': shim, 'time': time, 'math': math})
