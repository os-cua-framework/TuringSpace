# Scores per benchmark from result dirs, one column per dir.
#   SpatialViz-Bench, RefSpatial-Bench, VABench-Point, RoboAfford-Eval: mean item score x100
#   VSI-Bench: mean per question type, the three object_rel_direction levels averaged into one, then the mean of the
#              8 task scores x100
# Files of one benchmark (<bench>.jsonl, <bench>.p<i>of<n>.jsonl) are read in file-name order; a later record replaces
# one with the same id; error records are not scored.
# usage: python report.py <result dir> [<result dir> ...] [--sub]
import collections
import glob
import json
import os
import sys

BENCHES = ['spatialviz', 'refspatial', 'vsibench', 'vabench_point', 'roboafford']
REL_DIR = ('object_rel_direction_easy', 'object_rel_direction_medium', 'object_rel_direction_hard')


def records(d, bench):
    out = {}
    for f in sorted(glob.glob(f'{d}/{bench}.jsonl') + glob.glob(f'{d}/{bench}.*.jsonl')):
        for line in open(f):
            r = json.loads(line)
            if 'error' not in r:
                out[r['id']] = r
    return out


def scores(rs, bench):
    """-> {'ALL': score, <sub>: score, ...} x100"""
    by = collections.defaultdict(list)
    for r in rs.values():
        by[r['sub']].append(r['score'])
    sub = {k: 100 * sum(v) / len(v) for k, v in by.items()}
    if bench == 'vsibench':
        lv = [sub.pop(k) for k in REL_DIR if k in sub]
        if lv:
            sub['object_rel_direction'] = sum(lv) / len(lv)
        total = sum(sub.values()) / len(sub)
    else:
        total = 100 * sum(r['score'] for r in rs.values()) / len(rs)
    return {'ALL': total, **dict(sorted(sub.items()))}, len(rs)


def main():
    dirs = [a for a in sys.argv[1:] if not a.startswith('--')]
    by_sub = '--sub' in sys.argv
    table = collections.defaultdict(dict)
    for d in dirs:
        for b in BENCHES:
            rs = records(d, b)
            if rs:
                s, n = scores(rs, b)
                for k, v in s.items():
                    table[(b, k)][d] = (v, n if k == 'ALL' else None)
    print('| benchmark | sub | ' + ' | '.join(os.path.basename(os.path.normpath(d)) for d in dirs) + ' |')
    print('|---|---|' + '---|' * len(dirs))
    for b in BENCHES:
        keys = [k for (bb, k) in table if bb == b]
        for k in sorted(keys, key=lambda k: (k != 'ALL', k)):
            if k != 'ALL' and not by_sub:
                continue
            cells = []
            for d in dirs:
                v = table[(b, k)].get(d)
                cells.append('-' if v is None else f'{v[0]:.1f}' + (f' (n={v[1]})' if v[1] else ''))
            print(f'| {b} | {k} | ' + ' | '.join(cells) + ' |')


if __name__ == '__main__':
    main()
