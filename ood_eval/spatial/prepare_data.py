# Download the five benchmarks from the Hugging Face Hub and convert them into the files benches.py reads.
#   SpatialViz-Bench (1,180), RefSpatial-Bench (277 questions), VSI-Bench (5,130 questions):
#       EASI leaderboard TSVs (lmms-lab-si/EASI-Leaderboard-Data, the files VLMEvalKit evaluates)
#       -> <root>/easi/<name>.jsonl; SpatialViz images decoded from the TSV into <root>/easi/images/SpatialVizBench/
#   RefSpatial-Bench images and masks: BAAI/RefSpatial-Bench -> <root>/RefSpatial-Bench/<split>/{image,mask}/
#   VSI-Bench videos: nyu-visionx/VSI-Bench; 32 frames per video, np.linspace(0, n_frames - 1, 32, dtype=int),
#       saved as JPEG (PIL defaults) to <root>/easi/images/VSI-Bench/<video>/frame-<i>-of-32.jpg
#   VABench-Point (300): IffYuan/VABench-P, RoboAfford-Eval (338): Zray26/roboafford-eval
#       parquet -> <root>/<repo>/items.jsonl + images/ + masks/ (image bytes written as stored)
# requires: huggingface_hub, pandas, pyarrow, opencv-python, pillow, numpy
# usage: python prepare_data.py <data dir> [--benches spatialviz refspatial vsibench vabench_point roboafford]
#        [--workers 8]
import argparse
import ast
import base64
import csv
import io
import json
import os
import zipfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

EASI = ('lmms-lab-si/EASI-Leaderboard-Data', '52bb1dd2bc5cd58a291b3a780dab08d19c0ccf0d')
REFSPATIAL = ('BAAI/RefSpatial-Bench', '5cb4c34a36c09962442fc5b76e2e462b75008329')
VSI = ('nyu-visionx/VSI-Bench', '3a6a1cf9ac54c403509b15260897cc6ddc41b408')
VABENCH = ('IffYuan/VABench-P', '3f1f75ce84bd2a862a6611b867f6ddf60cfe46bd')
ROBOAFFORD = ('Zray26/roboafford-eval', '82c5607352897c66773f624ffd8ce5cd55aa5203')
NFRAME = 32


def download(repo, local_dir, patterns):
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=repo[0], revision=repo[1], repo_type='dataset', local_dir=local_dir,
                      allow_patterns=patterns)


def easi_tsv(root, name):
    download(EASI, f'{root}/easi', [f'{name}.tsv'])
    return f'{root}/easi/{name}.tsv'


def count(path):
    return sum(1 for _ in open(path))


def spatialviz(root):
    import pandas as pd
    E = f'{root}/easi'
    d = pd.read_csv(easi_tsv(root, 'SpatialVizBench'), sep='\t')
    os.makedirs(f'{E}/images/SpatialVizBench', exist_ok=True)
    with open(f'{E}/SpatialVizBench.jsonl', 'w') as f:
        for r in d.to_dict('records'):
            img = f"images/SpatialVizBench/{r['index']}.jpg"
            data = r.pop('image')
            if not os.path.exists(f'{E}/{img}'):
                open(f'{E}/{img}', 'wb').write(base64.b64decode(data))
            r['image_path'] = [img]
            f.write(json.dumps({k: v for k, v in r.items() if not (isinstance(v, float) and pd.isna(v))}) + '\n')
    assert count(f'{E}/SpatialVizBench.jsonl') == 1180


def refspatial(root):
    import pandas as pd
    download(REFSPATIAL, f'{root}/RefSpatial-Bench', ['Location/*', 'Placement/*', 'Unseen/*'])
    d = pd.read_csv(easi_tsv(root, 'RefSpatial'), sep='\t')
    with open(f'{root}/easi/RefSpatial.jsonl', 'w') as f:
        for r in d.to_dict('records'):
            for k in ('image_path', 'mask_path', 'candidates'):
                if isinstance(r.get(k), str) and r[k].startswith('['):
                    r[k] = ast.literal_eval(r[k])
            f.write(json.dumps(r, default=str) + '\n')
    assert count(f'{root}/easi/RefSpatial.jsonl') == 277


def save_image(field, bench_dir, sub, stem):
    """an HF image cell {bytes, path} -> its file under <bench_dir>/<sub>/, path relative to bench_dir"""
    if not field or field.get('bytes') is None:
        return None
    ext = {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}[Image.open(io.BytesIO(field['bytes'])).format]
    rel = f'{sub}/{stem}.{ext}'
    with open(f'{bench_dir}/{rel}', 'wb') as f:
        f.write(field['bytes'])
    return rel


def parquet_bench(root, repo, name, n_items):
    import glob
    import pyarrow.parquet as pq
    d = f'{root}/{name}'
    download(repo, d, ['data/test-*.parquet'])
    os.makedirs(f'{d}/images', exist_ok=True)
    os.makedirs(f'{d}/masks', exist_ok=True)
    rows = [r for f in sorted(glob.glob(f'{d}/data/test-*.parquet')) for r in pq.read_table(f).to_pylist()]
    with open(f'{d}/items.jsonl', 'w') as out:
        for i, r in enumerate(rows):
            img_key = 'img' if 'img' in r else 'image'
            rec = {k: v for k, v in r.items() if k not in (img_key, 'mask', 'depth_image')}
            rec.update(row=i, image=save_image(r[img_key], d, 'images', str(i)),
                       mask=save_image(r.get('mask'), d, 'masks', str(i)))
            out.write(json.dumps(rec) + '\n')
    assert len(rows) == n_items


def vabench_point(root):
    parquet_bench(root, VABENCH, 'VABench-P', 300)


def roboafford(root):
    parquet_bench(root, ROBOAFFORD, 'roboafford-eval', 338)


def vsi_frames(args):
    video, V, FR = args
    import cv2
    out = [f'{FR}/{video}/frame-{i}-of-{NFRAME}.jpg' for i in range(1, NFRAME + 1)]
    if all(os.path.exists(p) for p in out):
        return video, out
    cap = cv2.VideoCapture(f'{V}/{video}')
    n = 0
    while cap.grab():
        n += 1
    idx = np.linspace(0, n - 1, NFRAME, dtype=int).tolist()
    if idx[-1] != n - 1:
        idx.append(n - 1)
    assert len(idx) == NFRAME, (video, n)
    os.makedirs(f'{FR}/{video}', exist_ok=True)
    cap = cv2.VideoCapture(f'{V}/{video}')
    want = dict(zip(idx, out))
    k = 0
    while want and cap.grab():
        if k in want:
            ok, f = cap.retrieve()
            assert ok, (video, k)
            Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)).save(want.pop(k))
        k += 1
    assert not want, (video, n, sorted(want))
    return video, out


def vsibench(root, workers):
    V = f'{root}/VSI-Bench'
    FR = f'{root}/easi/images/VSI-Bench'
    download(VSI, V, ['arkitscenes.zip', 'scannet.zip', 'scannetpp.zip'])
    csv.field_size_limit(10 ** 9)
    rows = list(csv.DictReader(open(easi_tsv(root, 'VSI-Bench')), delimiter='\t'))
    assert len(rows) == 5130
    videos = sorted({r['video'] for r in rows})
    for z in ('arkitscenes', 'scannet', 'scannetpp'):
        need = [v for v in videos if v.startswith(z + '/') and not os.path.exists(f'{V}/{v}')]
        if need:
            with zipfile.ZipFile(f'{V}/{z}.zip') as zf:
                for v in need:
                    zf.extract(v, V)
    with ProcessPoolExecutor(workers) as ex:
        paths = dict(ex.map(vsi_frames, [(v, V, FR) for v in videos]))
    with open(f'{root}/easi/VSI-Bench.jsonl', 'w') as f:
        for r in rows:
            f.write(json.dumps(dict(r, frames=paths[r['video']])) + '\n')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('--benches', nargs='+', default=['spatialviz', 'refspatial', 'vsibench', 'vabench_point',
                                                     'roboafford'])
    ap.add_argument('--workers', type=int, default=8)
    args = ap.parse_args()
    root = os.path.abspath(args.root)
    os.makedirs(f'{root}/easi', exist_ok=True)
    for b in args.benches:
        if b == 'vsibench':
            vsibench(root, args.workers)
        else:
            globals()[b](root)
        print(b, 'done', flush=True)


if __name__ == '__main__':
    main()
