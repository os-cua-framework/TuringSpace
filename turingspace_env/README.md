# Environment

A puzzle page in a headless Chromium, behind the interface of OSWorld's `DesktopEnv`, so that OSWorld agents run
unchanged.

| File | Role |
|---|---|
| `env.py` | `TuringSpaceEnv`: `reset`, `step`, `evaluate`, screenshots |
| `sources.py` | where a page comes from and how it is judged: TuringSpace-Bench, ReCAP, Open CaptchaWorld |
| `pyautogui_shim.py` | runs pyautogui code as mouse and keyboard events on the page |
| `cursor.png` | the pointer drawn on every screenshot |

## Interface

```python
from turingspace_env import TuringSpaceEnv, TuringSpaceSource

source = TuringSpaceSource('http://127.0.0.1:7869')
env = TuringSpaceEnv(source)
example = source.load_examples(tasks=['pipes_connect'], seeds=[36])[0]
obs = env.reset(example)                   # {'screenshot': PNG bytes, 'instruction': ...}
obs, reward, done, info = env.step("pyautogui.click(960, 540)")
score = env.evaluate()                     # 1.0 when the page judged the submission correct
```

An action is pyautogui code, a dict with a `command`, or one of `WAIT`, `DONE` and `FAIL`, as OSWorld agents return them.
An episode is done when the page has judged a submission.

## Screen

The page is laid out at 1280×720 CSS pixels and rendered at device pixel ratio 1.5, so every screenshot is 1920×1080
and coordinates are screenshot pixels. After every action the environment waits until the page is still: no animation
frame for 150 ms and the same board on two checks, at most 4 s. The browser's zoom keys work as in Chrome. ReCAP and Open
CaptchaWorld pages are laid out at 1440×810 CSS pixels, or larger when the puzzle would not fit, and still give
1920×1080 screenshots.
