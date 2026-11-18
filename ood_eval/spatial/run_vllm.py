# Ask a vLLM OpenAI-compatible server every item of the chosen benchmarks, score each reply and append it to
# <out>/<bench>[.p<i>of<n>].jsonl. Items already in any <bench>*.jsonl of <out> are skipped.
# Images are sent at their original size. Default sampling = VLMEvalKit's Qwen3.5 config.
# usage: python run_vllm.py --root <data dir> --out <result dir> --model <served name> --base_url http://HOST:PORT/v1
#        [--benches spatialviz refspatial] [--thinking off] [--part i/n]
import argparse
import asyncio
import base64
import glob
import io
import json
import os
import sys
import time

from openai import AsyncOpenAI
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benches                                                   # noqa: E402
import prompts                                                   # noqa: E402
import scoring                                                   # noqa: E402


def data_url(path):
    im = Image.open(path)
    size = im.size
    if im.mode not in ('RGB', 'L'):
        im = im.convert('RGB')
    buf = io.BytesIO()
    im.save(buf, format='PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode(), size


async def ask(client, args, item, sem):
    async with sem:
        urls, sizes = zip(*[data_url(p) for p in item['images']])
        messages = prompts.build(item, urls)
        kw = dict(model=args.model, messages=messages, max_tokens=args.max_tokens, temperature=args.temperature,
                  top_p=args.top_p, presence_penalty=args.presence_penalty,
                  extra_body={'top_k': args.top_k, 'repetition_penalty': 1.0,
                              'chat_template_kwargs': {'enable_thinking': args.thinking == 'on'}})
        t0 = time.time()
        for attempt in range(5):
            try:
                r = await client.chat.completions.create(**kw)
                break
            except Exception as e:
                if attempt == 4:
                    return dict(id=item['id'], error=repr(e)[:500])
                await asyncio.sleep(5 * (attempt + 1))
        msg = r.choices[0].message
        text = msg.content or ''
        reasoning = getattr(msg, 'reasoning', None) or getattr(msg, 'reasoning_content', None)
        rec = dict(id=item['id'], sub=item['sub'], text=text, reasoning=reasoning,
                   finish=r.choices[0].finish_reason, sizes=sizes, secs=round(time.time() - t0, 1),
                   tokens=r.usage.completion_tokens)
        rec.update(scoring.score(item, text, sizes[0]))
        return rec


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--model', required=True)
    ap.add_argument('--base_url', required=True)
    ap.add_argument('--benches', nargs='+', default=benches.BENCHES)
    ap.add_argument('--thinking', choices=['on', 'off'], default='on')
    ap.add_argument('--max_tokens', type=int, default=32768)
    ap.add_argument('--temperature', type=float, default=1.0)
    ap.add_argument('--top_p', type=float, default=0.95)
    ap.add_argument('--top_k', type=int, default=20)
    ap.add_argument('--presence_penalty', type=float, default=1.5)
    ap.add_argument('--concurrency', type=int, default=64)
    ap.add_argument('--part', default=None, help='i/n: only the i-th (1-based) of n contiguous slices of the items')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    client = AsyncOpenAI(base_url=args.base_url, api_key='EMPTY', timeout=1800)
    sem = asyncio.Semaphore(args.concurrency)
    for b in args.benches:
        items = benches.load(b, args.root)
        tag = ''
        if args.part:
            i, n = map(int, args.part.split('/'))
            items = items[len(items) * (i - 1) // n: len(items) * i // n]
            tag = f'.p{i}of{n}'
        done = set()
        for f in glob.glob(f'{args.out}/{b}.jsonl') + glob.glob(f'{args.out}/{b}.*.jsonl'):
            for line in open(f):
                r = json.loads(line)
                if 'error' not in r:
                    done.add(r['id'])
        todo = [it for it in items if it['id'] not in done]
        print(f'{time.strftime("%T")} {b}: {len(items)} items, {len(todo)} to go', flush=True)
        with open(f'{args.out}/{b}{tag}.jsonl', 'a') as f:
            for k, fut in enumerate(asyncio.as_completed([ask(client, args, it, sem) for it in todo]), 1):
                f.write(json.dumps(await fut) + '\n')
                f.flush()
                if k % 200 == 0:
                    print(f'  {k}/{len(todo)}', flush=True)
        print(f'{time.strftime("%T")} {b} done', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
