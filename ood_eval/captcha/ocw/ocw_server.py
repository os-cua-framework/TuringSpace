# Open CaptchaWorld with one fixed puzzle per page: http://HOST:PORT/?type=<CAPTCHA type>&pid=<puzzle file>.
# Their app.py runs unchanged; this wrapper answers the page's /api/get_puzzle for the puzzle named in the page URL,
# rewords two questions (PROMPT_FIX), and inlines ocw_clean.css. Their /api/check_answer judges the answer.
#
#   python ocw_server.py <OpenCaptchaWorld checkout> [port]
import json
import os
import sys
from urllib.parse import parse_qs, urlparse

CSS = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ocw_clean.css')
root, port = os.path.abspath(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 7860
os.chdir(root)
sys.path.insert(0, root)
import app as ocw  # noqa: E402
from flask import request  # noqa: E402

PROMPT_FIX = {'Dice_Count': 'Sum up the numbers on top of all the dice',
              'Unusual_Detection': 'Select all the animals with the wrong head'}


def pinned():
    q = parse_qs(urlparse(request.headers.get('Referer', '')).query)
    t, pid = q.get('type', [None])[0], q.get('pid', [None])[0]
    return (t, pid) if t in ocw.PUZZLE_SEQUENCES and pid in ocw.PUZZLE_SEQUENCES[t] else None


@ocw.app.before_request
def pin_puzzle():
    if request.path != '/api/get_puzzle' or pinned() is None:
        return None
    t, pid = pinned()
    ocw.PUZZLE_INDEX[t] = ocw.PUZZLE_SEQUENCES[t].index(pid)
    request.args = request.args.copy()
    request.args['debug_type'] = t
    return None


@ocw.app.after_request
def fix_prompt(resp):
    if request.path != '/api/get_puzzle':
        return resp
    body = resp.get_json(silent=True)
    if body and body.get('puzzle_type') in PROMPT_FIX:
        body['prompt'] = PROMPT_FIX[body['puzzle_type']]
        resp.set_data(json.dumps(body))
    return resp


@ocw.app.after_request
def clean_layout(resp):
    if request.path != '/' or resp.mimetype != 'text/html' or request.args.get('type') not in ocw.PUZZLE_SEQUENCES:
        return resp
    resp.direct_passthrough = False
    resp.set_data(resp.get_data(as_text=True).replace('</head>', '<style>\n%s</style>\n</head>' % open(CSS).read(), 1))
    return resp


if __name__ == '__main__':
    ocw.app.run(host='127.0.0.1', port=port, threaded=False)
