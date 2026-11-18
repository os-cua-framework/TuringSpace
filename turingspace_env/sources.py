# Where an episode's page comes from and how it is judged, one class per benchmark. Every benchmark is played through
# the same environment and agents; only the page, the instruction and the verdict differ.
#   turingspace  tasks/run.html. The page judges the first press of Verify and locks.
#   recap        ReCAP's dynamic_captchas server. Solved when the server marks the challenge solved.
#   ocw          Open CaptchaWorld through ood_eval/captcha/ocw_server.py. Its server judges the page's one submission.
import json
import os
import urllib.request
from urllib.parse import urlencode

from playwright.sync_api import TimeoutError as PlaywrightTimeout

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_ALL = os.path.join(REPO, 'evaluation_examples', 'test_all.json')
CAPTCHA_DIR = os.path.join(REPO, 'ood_eval', 'captcha')

INIT_SCRIPT = """
(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__evalLastRaf = 0;
  window.requestAnimationFrame = (cb) => { window.__evalLastRaf = performance.now(); return raf(cb); };
})();
"""
CANVAS_PROBE = """() => {
  const idle = performance.now() - (window.__evalLastRaf ?? 0) > 150;
  const c = document.querySelector('#host canvas'); const g = c && c.getContext('2d');
  if (!g) return { idle, h: 'nogl' };
  const d = g.getImageData(0, 0, c.width, c.height).data; let h = 0;
  for (let i = 0; i < d.length; i += 13) h = (h * 31 + d[i]) | 0;
  return { idle, h };
}"""
DOM_PROBE = """() => {
  const raf = performance.now() - (window.__evalLastRaf ?? 0) > 150;
  const css = document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity);
  return { idle: raf && css, h: 'dom' };
}"""
# ReCAP and Open CaptchaWorld pages are laid out at 1440x810 CSS px (still 1920x1080 screenshots)
BASELINE_DPR = 4 / 3
BOTTOM = """(sel) => Math.max(0, ...[...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null)
  .map((e) => e.getBoundingClientRect().bottom))"""
WAIT_IMAGES = """async () => { await document.fonts.ready;
  await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))); }"""


def _get_json(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.load(r)


class TuringSpaceSource:
    name = 'turingspace'
    instruction = ('Solve the CAPTCHA puzzle shown on the screen. Follow the instruction written on the puzzle, '
                   'then click Verify to submit your answer.')
    probe = CANVAS_PROBE

    def __init__(self, tasks_url):
        self.tasks_url = tasks_url.rstrip('/')

    def load_examples(self, tasks=None, seeds=None):
        spec = json.load(open(TEST_ALL))
        out = []
        for category, names in spec['categories'].items():
            for config in names:
                task, _, cue = config.partition('/')
                if tasks and config not in tasks and task not in tasks and category not in tasks:
                    continue
                for seed in spec['seeds']:
                    if seeds and seed not in seeds:
                        continue
                    out.append({'id': f"{config.replace('/', '__')}_s{seed}", 'category': category, 'config': config,
                                'task': task, 'cue': cue, 'seed': seed, 'instruction': self.instruction})
        return out

    def url(self, c):
        return f"{self.tasks_url}/run.html?{urlencode({'task': c['task'], 'seed': c['seed'], 'cue': c['cue']})}"

    def open(self, env, c):
        env.page.goto(self.url(c), timeout=60000)
        env.page.add_style_tag(content='#cap { visibility: hidden !important; }')
        env.page.wait_for_function("() => document.querySelector('#host canvas') && window.TuringSpace", timeout=60000)
        env.page.evaluate('async () => { await document.fonts.ready; }')
        return {}

    def result(self, env):
        return env.page.evaluate('() => window.TuringSpace.getResult()')

    def submitted(self, env):
        return self.result(env) is not None

    def record(self, env):
        return None


class RecapSource:
    name = 'recap'
    instruction = ('Solve the CAPTCHA as per the given instructions. You may need to interact with various elements such as '
                   'checkboxes, image grids, sliders, or text inputs to complete the CAPTCHA challenge.')
    probe = DOM_PROBE
    dpr = BASELINE_DPR
    puzzle_parts = "button, input:not([type=hidden]), [class*=handle], .tile, .image-tile, .icon-option, .icon-piece"
    examples_file = os.path.join(CAPTCHA_DIR, 'recap', 'recap140.json')

    def __init__(self, recap_url):
        self.recap_url = recap_url.rstrip('/')

    def load_examples(self, tasks=None, seeds=None):
        out = []
        for r in json.load(open(self.examples_file)):
            if (tasks and r['task'] not in tasks) or (seeds and r['seed'] not in seeds):
                continue
            out.append({'id': f"{r['task']}_s{r['seed']}", 'category': r['task'], 'config': r['task'], 'task': r['task'],
                        'seed': r['seed'], 'route': r['route'], 'instruction': self.instruction})
        return out

    def url(self, c):
        return f"{self.recap_url}/challenge/{c['route']}?{urlencode({'seed': c['seed'], 'scope': 'static'})}"

    def open(self, env, c):
        page = env.page
        page.goto(self.url(c), timeout=60000)
        env.state = {'challenge_id': page.input_value('#challenge-id'), 'first': None, 'last': None}
        page.evaluate(WAIT_IMAGES)
        page.wait_for_timeout(1000)
        if c['task'] == 'image_grid':
            # the harness ticks "I'm not a robot" before the first screenshot
            page.click('#checkbox')
            page.wait_for_selector('#challenge-wrapper', state='visible', timeout=30000)
            try:
                page.wait_for_function("""() => { const im = [...document.querySelectorAll('#image-grid img')];
                  return im.length >= 9 && im.every((i) => i.complete && i.naturalWidth > 0); }""", timeout=30000)
            except PlaywrightTimeout:
                pass
            page.wait_for_timeout(800)
        return {}

    def status(self, env):
        st = _get_json(f"{self.recap_url}/status/{env.state['challenge_id']}")
        S = env.state
        S['last'] = st
        if S['first'] is None and (st.get('status') == 'solved' or (st.get('failed_attempts') or 0) > 0):
            S['first'] = {'success': st.get('status') == 'solved', 'after_action': len(env.action_history)}
        return st

    def result(self, env):
        st = self.status(env)
        if st.get('status') == 'solved':
            return {'success': True, 'failed_attempts': st.get('failed_attempts', 0), 'type': st.get('type')}
        return None

    def submitted(self, env):
        self.status(env)
        return env.state['first'] is not None

    def record(self, env):
        self.status(env)
        S = env.state
        return {'challenge_id': S['challenge_id'], 'url': env.page_url, 'first_submission': S['first'],
                'failed_attempts': (S['last'] or {}).get('failed_attempts'), 'status': (S['last'] or {}).get('status')}


class OCWSource:
    name = 'ocw'
    instruction = ('Read the requirements to understand what you need to solve. Use the "Submit" button to check your '
                   'answer. Focus on solving the puzzles accurately.')
    probe = DOM_PROBE
    dpr = BASELINE_DPR
    puzzle_parts = ".puzzle-container button, .puzzle-container input, .puzzle-container img, .puzzle-container canvas"
    examples_file = os.path.join(CAPTCHA_DIR, 'ocw', 'ocw453.json')

    def __init__(self, ocw_url):
        self.ocw_url = ocw_url.rstrip('/')

    def load_examples(self, tasks=None, seeds=None):
        out = []
        for r in json.load(open(self.examples_file))['puzzles']:
            if (tasks and r['type'] not in tasks) or (seeds and r['pid'] not in seeds):
                continue
            out.append({'id': f"{r['type']}__{os.path.splitext(r['pid'])[0]}", 'category': r['type'], 'config': r['type'],
                        'task': r['type'], 'seed': r['pid'], 'pid': r['pid'], 'instruction': self.instruction})
        return out

    def url(self, c):
        return f"{self.ocw_url}/?{urlencode({'type': c['task'], 'pid': c['pid']})}"

    def open(self, env, c):
        page = env.page
        env.state = {'puzzle_id': None, 'result': None, 'replies': []}

        def on_response(resp):
            if '/api/get_puzzle' in resp.url:
                try:
                    env.state['shown'] = resp.json().get('puzzle_id')
                except Exception:
                    pass
                return
            if '/api/check_answer' not in resp.url:
                return
            try:
                req = json.loads(resp.request.post_data or '{}')
            except ValueError:
                req = {}
            try:
                body = resp.json()
            except Exception:
                body = None
            S = env.state
            S['replies'].append({'http': resp.status, 'puzzle_type': req.get('puzzle_type'), 'puzzle_id': req.get('puzzle_id'),
                                 'answer': req.get('answer'), 'correct': (body or {}).get('correct'),
                                 'error': (body or {}).get('error')})
            if S['result'] is not None or resp.status != 200 or not body or body.get('error'):
                return
            S['result'] = {'success': bool(body.get('correct')), 'puzzle_type': req.get('puzzle_type'),
                           'puzzle_id': req.get('puzzle_id'), 'user_answer': body.get('user_answer'),
                           'correct_answer': body.get('correct_answer')}

        page.on('response', on_response)
        page.goto(self.url(c), timeout=60000)
        page.wait_for_function("() => document.querySelector('#puzzle-prompt').textContent !== 'Loading puzzle...'",
                               timeout=60000)
        page.evaluate(WAIT_IMAGES)
        page.wait_for_timeout(500)
        if env.state.get('shown') != c['pid']:
            raise RuntimeError(f"page shows {env.state.get('shown')!r}, not {c['pid']!r}")
        env.state['puzzle_id'] = c['pid']
        return {}

    def result(self, env):
        return env.state['result']

    def submitted(self, env):
        return env.state['result'] is not None

    def record(self, env):
        S = env.state
        return {'url': env.page_url, 'puzzle_id': S['puzzle_id'], 'check_answer_replies': S['replies']}


def make_source(args):
    if args.source == 'turingspace':
        return TuringSpaceSource(args.tasks_url)
    if args.source == 'recap':
        return RecapSource(args.recap_url)
    if args.source == 'ocw':
        return OCWSource(args.ocw_url)
    raise ValueError(f'--source {args.source}: turingspace | recap | ocw')
