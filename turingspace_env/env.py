# A puzzle page as an OSWorld-style environment: reset(example) -> obs, step(action) -> (obs, reward, done, info),
# evaluate() -> 1.0 / 0.0. An action is what OSWorld agents return: pyautogui code, a dict with 'command', or one of
# 'WAIT' / 'DONE' / 'FAIL'.
#
# Screen: the page is laid out at 1280x720 CSS px and rendered at device pixel ratio 1.5, so every screenshot is
# 1920x1080 and coordinates are screenshot pixels. The pointer is drawn onto each screenshot. After every action the
# environment waits until the page is still, then takes the screenshot.
import io
import os
import sys
import time

from PIL import Image
from playwright.sync_api import TimeoutError as PlaywrightTimeout, sync_playwright

from .pyautogui_shim import PyAutoGUIShim, run_code
from .sources import BOTTOM, INIT_SCRIPT

HERE = os.path.dirname(os.path.abspath(__file__))
CURSOR = Image.open(os.path.join(HERE, 'cursor.png')).convert('RGBA')
CURSOR_HOTSPOT = (2, 2)
SCREEN = (1920, 1080)
DPR = 1.5
LOAD_TRIES = 3
CHROMIUM_ARGS = ['--disable-gpu', '--js-flags=--no-maglev-osr']
FIT_TRIES, FIT_MARGIN = 3, 8
ZOOM_LEVELS = (0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0)
SET_ZOOM = """(z) => { const h = document.documentElement.style;
  if (z === 1) { h.zoom = h.width = h.height = ''; } else { h.zoom = String(z); h.width = (100 / z) + 'vw'; h.height = (100 / z) + 'vh'; } }"""


class TuringSpaceEnv:
    def __init__(self, source, headless=True, cursor_start=(1860, 1020), settle_first_ms=300, settle_cap_ms=4000):
        self.source = source
        self.screen_size = SCREEN
        self.base_dpr = getattr(source, 'dpr', DPR)
        self._set_dpr(self.base_dpr)
        self.cursor_start = cursor_start
        self.settle_first_ms, self.settle_cap_ms = settle_first_ms, settle_cap_ms
        self._pw = sync_playwright().start()
        for stream in (sys.stdout, sys.stderr):
            try:
                os.set_blocking(stream.fileno(), True)
            except (AttributeError, OSError, ValueError):
                pass
        self._browser = self._pw.chromium.launch(headless=headless, args=CHROMIUM_ARGS)
        self._ctx = self.page = self.pyautogui = None
        self.task_config, self.instruction, self.state, self.open_info, self.page_url = None, None, {}, {}, None
        self.action_history, self.page_errors = [], []

    def _set_dpr(self, dpr):
        self.dpr = dpr
        self.viewport = {'width': round(self.screen_size[0] / dpr), 'height': round(self.screen_size[1] / dpr)}

    def reset(self, task_config):
        """Opens the example's page. A source that names its puzzle parts gets its page laid out again at a smaller scale
        until those parts fit on the screen."""
        self._set_dpr(self.base_dpr)
        parts = getattr(self.source, 'puzzle_parts', None)
        bottom = 0
        for fit in range(FIT_TRIES):
            self._open(task_config)
            bottom = self.page.evaluate(BOTTOM, parts) if parts else 0
            if bottom <= self.viewport['height'] - FIT_MARGIN or fit == FIT_TRIES - 1:
                break
            self._set_dpr(self.screen_size[1] / (bottom + FIT_MARGIN + 8 * fit))
        if parts:
            self.open_info = {**(self.open_info or {}), 'dpr': round(self.dpr, 4), 'page_bottom_css': round(bottom)}
        self.zoom = 1.0
        self.pyautogui = PyAutoGUIShim(self.page, self.screen_size, self.dpr, start=self.cursor_start, on_zoom=self.zoom_step)
        self.settle()
        return self._get_obs()

    def _open(self, task_config):
        self.task_config, self.instruction = task_config, task_config.get('instruction')
        for attempt in range(LOAD_TRIES):
            if self._ctx:
                self._ctx.close()
            self.action_history, self.page_errors = [], []
            self._ctx = self._browser.new_context(viewport=self.viewport, device_scale_factor=self.dpr)
            self._ctx.add_init_script(INIT_SCRIPT)
            self.page = self._ctx.new_page()
            self.page.on('pageerror', lambda e: self.page_errors.append(str(e)[:300]))
            self.state, self.page_url = {}, self.source.url(task_config)
            try:
                self.open_info = self.source.open(self, task_config)
                break
            except PlaywrightTimeout:
                if attempt == LOAD_TRIES - 1:
                    raise
                time.sleep(5 * (attempt + 1))

    def _get_obs(self):
        return {'screenshot': self.screenshot(), 'accessibility_tree': None, 'terminal': None, 'instruction': self.instruction}

    def step(self, action, pause=0):
        self.action_history.append(action)
        done, info = False, {}
        kind = action.get('action_type') if isinstance(action, dict) else action
        if kind in ('WAIT', 'FAIL', 'DONE'):
            if kind == 'WAIT':
                time.sleep(pause)
            else:
                done, info = True, {'fail': True} if kind == 'FAIL' else {'done': True}
        elif kind == 'WAIT_FOR_STATE':
            pass
        elif isinstance(action, dict) and 'command' not in action:
            info['unsupported'] = kind
        else:
            code = action['command'] if isinstance(action, dict) else action
            try:
                run_code(self.pyautogui, code)
            except Exception as e:
                info['error'] = f'{type(e).__name__}: {e}'[:300]
        if not self.settle():
            info['unsettled'] = True
        if pause:
            time.sleep(pause)
        if self.result() is not None:
            done, info['submitted'] = True, True
        return self._get_obs(), 0, done, info

    def evaluate(self):
        r = self.result()
        return 1.0 if r and r.get('success') else 0.0

    def close(self):
        if self._ctx:
            self._ctx.close()
        self._browser.close()
        self._pw.stop()

    def result(self):
        """The verdict that ends the episode, or None."""
        return self.source.result(self)

    def submitted(self):
        return self.source.submitted(self)

    def record(self):
        rec = self.source.record(self)
        return {**(self.open_info or {}), **rec} if rec is not None else None

    def settle(self):
        """Waits until no animation frame ran for 150 ms and the board looks the same twice (at most settle_cap_ms)."""
        self.page.wait_for_timeout(self.settle_first_ms)
        t0, last = time.time(), None
        while (time.time() - t0) * 1000 < self.settle_cap_ms:
            try:
                s = self.page.evaluate(self.source.probe)
            except Exception:
                s = {'idle': True, 'h': 'err'}
            if s['idle'] and s['h'] == last:
                return True
            last = s['h']
            self.page.wait_for_timeout(100)
        return False

    def zoom_step(self, direction):
        """The browser's zoom shortcuts: +1 / -1 = the next level up / down, 0 = back to 100%."""
        i = ZOOM_LEVELS.index(self.zoom)
        i = ZOOM_LEVELS.index(1.0) if direction == 0 else min(max(i + direction, 0), len(ZOOM_LEVELS) - 1)
        self.zoom = ZOOM_LEVELS[i]
        self.page.evaluate(SET_ZOOM, self.zoom)

    def screenshot(self):
        img = Image.open(io.BytesIO(self.page.screenshot())).convert('RGBA')
        x, y = self.pyautogui.position()
        img.alpha_composite(CURSOR, (max(0, x - CURSOR_HOTSPOT[0]), max(0, y - CURSOR_HOTSPOT[1])))
        out = io.BytesIO()
        img.convert('RGB').save(out, format='PNG')
        return out.getvalue()
