# Scores of one or more result directories written by run.py.
#   TuringSpace-Bench: pass@1 = success rate per seed, averaged over the seeds (± standard deviation), per category and
#   over all tasks; pass^3 = share of tasks solved on every seed.
#   ReCAP / Open CaptchaWorld: success rate per CAPTCHA type and over all puzzles.
#
#   python show_result.py results/gpt-6-astra [results/claude-opus-5-5 ...]
import argparse
import json
import os
import statistics
from collections import defaultdict


def load(result_dir):
    recs = []
    for d in sorted(os.listdir(result_dir)):
        f = os.path.join(result_dir, d, 'result.json')
        if os.path.exists(f):
            recs.append(json.load(open(f)))
    return recs


def turingspace_scores(recs):
    by_seed = defaultdict(lambda: defaultdict(list))
    by_task = defaultdict(list)
    for r in recs:
        by_seed[r['seed']][r['category']].append(r['success'])
        by_task[(r['category'], r['config'])].append(r['success'])
    rows = {}
    for cat in sorted({r['category'] for r in recs}) + ['all']:
        per_seed = []
        for seed, cats in sorted(by_seed.items()):
            vals = [v for c, vs in cats.items() for v in vs if cat in ('all', c)]
            per_seed.append(100 * sum(vals) / len(vals))
        tasks = [v for (c, _), v in by_task.items() if cat in ('all', c)]
        std = statistics.stdev(per_seed) if len(per_seed) > 1 else 0.0
        rows[cat] = {'pass@1': statistics.mean(per_seed), 'std': std,
                     'pass^3': 100 * sum(all(v) for v in tasks) / len(tasks), 'n': sum(len(v) for v in tasks)}
    return rows


def captcha_scores(recs):
    by_type = defaultdict(list)
    for r in recs:
        by_type[r['category']].append(r['success'])
    rows = {t: {'pass': 100 * sum(v) / len(v), 'n': len(v)} for t, v in sorted(by_type.items())}
    allv = [r['success'] for r in recs]
    rows['all'] = {'pass': 100 * sum(allv) / len(allv), 'n': len(allv)}
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument('result_dirs', nargs='+', help='result directories written by run.py')
    for result_dir in p.parse_args().result_dirs:
        recs = load(result_dir)
        print(f'== {result_dir} ({len(recs)} episodes)')
        if recs and recs[0].get('source') is None:
            for cat, s in turingspace_scores(recs).items():
                print(f"{cat:30s} pass@1 {s['pass@1']:5.1f} ± {s['std']:4.1f}   pass^3 {s['pass^3']:5.1f}   n={s['n']}")
        else:
            for t, s in captcha_scores(recs).items():
                print(f"{t:30s} pass {s['pass']:5.1f}   n={s['n']}")


if __name__ == '__main__':
    main()
