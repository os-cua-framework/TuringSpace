# Opens one test instance in your browser to solve it yourself. The page judges your first press of Verify.
#
#   python play.py pipes_connect --seed 36
#   python play.py char_click/mirror --seed 43
import argparse
import functools
import http.server
import json
import os
import webbrowser
from urllib.parse import urlencode

REPO = os.path.dirname(os.path.abspath(__file__))
TASKS_DIR = os.path.join(REPO, 'tasks')
TEST_ALL = os.path.join(REPO, 'evaluation_examples', 'test_all.json')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


if __name__ == '__main__':
    spec = json.load(open(TEST_ALL))
    configs = [c for names in spec['categories'].values() for c in names]
    p = argparse.ArgumentParser()
    p.add_argument('task', choices=configs, metavar='task', help='a task of evaluation_examples/test_all.json')
    p.add_argument('--seed', type=int, default=spec['seeds'][0], choices=spec['seeds'])
    p.add_argument('--port', type=int, default=7870)
    a = p.parse_args()
    server = http.server.ThreadingHTTPServer(('127.0.0.1', a.port), functools.partial(QuietHandler, directory=TASKS_DIR))
    task, _, cue = a.task.partition('/')
    url = f"http://127.0.0.1:{a.port}/run.html?{urlencode({'task': task, 'seed': a.seed, 'cue': cue})}"
    print(f'{url}\nCtrl-C stops the server.')
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
