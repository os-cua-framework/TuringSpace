# Answer extraction and per-item score.
#   mcq (SpatialViz-Bench, VSI-Bench multiple choice): VLMEvalKit can_match_option, exact match with the answer letter
#   na (VSI-Bench numeric): VLMEvalKit can_match_na, mean relative accuracy over thresholds .50:.95:.05
#   RefSpatial-Bench: VLMEvalKit Point2DParser; score = share of the predicted points inside the mask (no point = 0)
#   VABench-Point, RoboAfford-Eval: EmbodiedEvalKit omni_decode_points, points on the 0-1000 grid ->
#     pixels (round(x / 1000 * w), round(y / 1000 * h)); score = share of the points on a mask pixel > 0 (no point = 0)
import numpy as np
from PIL import Image

from eek_parsers import check_points_in_mask, omni_decode_points
from vlmeval_parsers import Point2DParser, can_match_na, can_match_option, mean_relative_accuracy

EEK_BENCHES = ('vabench_point', 'roboafford')


def target_mask(path):
    return np.array(Image.open(path).convert('L')) > 127


def predicted_points(text, size):
    """-> list of (x, y) normalized to [0, 1]"""
    w, h = size
    pts = Point2DParser.parse(text or '', w, h, output='pixel')
    return [((x + 0.5) / w, (y + 0.5) / h) for x, y in np.asarray(pts).reshape(-1, 2)]


def in_mask(item, pts):
    m = target_mask(item['target']['mask'])
    h, w = m.shape
    return [int(0 <= int(x * w) < w and 0 <= int(y * h) < h and m[int(y * h), int(x * w)]) for x, y in pts]


def score_eek(item, text, size):
    w, h = size
    pts = omni_decode_points(str(text))
    px = [[int(round(x / 1000.0 * w)), int(round(y / 1000.0 * h))] for x, y in pts]
    if not px:
        s = 0.0
    else:
        k, n = check_points_in_mask(px, Image.open(item['target']['mask']))
        s = k / n if n > 0 else 0.0
    return {'score': s, 'parsed': [[round(x / 1000.0, 4), round(y / 1000.0, 4)] for x, y in pts]}


def score(item, text, size):
    """size = (w, h) of the item's first original image -> dict(score, parsed)"""
    if item['bench'] in EEK_BENCHES:
        return score_eek(item, text, size)
    if item['kind'] == 'na':
        v = can_match_na(text or '')
        return {'score': mean_relative_accuracy(v, float(item['answer'])) if v is not None else 0.0, 'parsed': v}
    if item['kind'] == 'mcq':
        letter = can_match_option(text or '')
        return {'score': float(bool(letter) and letter == item['answer'].strip().upper()), 'parsed': letter or None}
    pts = predicted_points(text, size)
    hits = in_mask(item, pts) if pts else []
    return {'score': float(np.mean(hits)) if hits else 0.0, 'parsed': [[round(v, 4) for v in p] for p in pts]}
