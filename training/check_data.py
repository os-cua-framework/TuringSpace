# Checks the samples directory before training: every image a sample names exists, and every sample has as many <image>
# tags as images. Exits 1 on any problem.
#   python check_data.py ROOT [--files train.jsonl val.jsonl]
import argparse, json, os, sys

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default='.')
    ap.add_argument('--files', nargs='+', default=['train.jsonl', 'val.jsonl'])
    a = ap.parse_args()
    bad = []
    for name in a.files:
        path = os.path.join(a.root, name)
        if not os.path.exists(path):
            bad.append(f'{name}: not found under {os.path.abspath(a.root)}')
            continue
        n = imgs = missing = 0
        for i, line in enumerate(open(path), 1):
            row = json.loads(line)
            n += 1
            tags = sum(m['content'].count('<image>') for m in row['messages'])
            if tags != len(row['images']):
                bad.append(f'{name}:{i}: {tags} <image> tags, {len(row["images"])} images')
            for p in row['images']:
                imgs += 1
                if not os.path.exists(os.path.join(a.root, p)):
                    missing += 1
                    if missing <= 3:
                        bad.append(f'{name}:{i}: image not found: {p}')
        if missing > 3:
            bad.append(f'{name}: {missing} images not found in all')
        print(f'{name}: {n} samples, {imgs} images, {missing} missing')
    for b in bad[:20]:
        print('  ' + b)
    sys.exit(1 if bad else 0)
