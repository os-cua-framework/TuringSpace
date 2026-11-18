# transformers runner: bf16 + sdpa, each image resized by smart_resize(factor 8, at most 8,294,400 pixels), then
# optionally resized to --resize WxH (LANCZOS); the reply after the last </think> is scored in the original image's
# frame. Appends to <out>/<bench>[.p<i>of<n>].jsonl; items already in any <bench>*.jsonl of <out> are skipped.
# usage: python run_hf.py --model <dir or HF id> --root <data dir> --out <result dir> --benches ... [--thinking off]
#        [--resize 1280x720] [--max_new_tokens N] [--temperature T --top_p P --top_k K --repetition_penalty R
#        --seed S] [--part i/n]
import argparse
import glob
import json
import os
import sys
import time

import torch
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor
from transformers.models.qwen2_vl.image_processing_qwen2_vl_fast import smart_resize

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import benches                                                   # noqa: E402
import prompts                                                   # noqa: E402
import scoring                                                   # noqa: E402

MAX_PIXELS = 8294400


def load_image(path):
    im = Image.open(path).convert('RGB')
    h, w = smart_resize(im.height, im.width, factor=8, min_pixels=32 * 32, max_pixels=MAX_PIXELS)
    return im.resize((w, h)), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', required=True)
    ap.add_argument('--root', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--benches', nargs='+', required=True)
    ap.add_argument('--part', default=None, help='i/n: only the i-th (1-based) of n contiguous slices of the items')
    ap.add_argument('--max_new_tokens', type=int, default=4096)
    ap.add_argument('--resize', default=None, help='WxH: resize every image to this size before the processor')
    ap.add_argument('--temperature', type=float, default=0.0, help='0 = greedy')
    ap.add_argument('--top_p', type=float, default=1.0)
    ap.add_argument('--top_k', type=int, default=0, help='0 = off')
    ap.add_argument('--repetition_penalty', type=float, default=1.0, help='1.0 = off')
    ap.add_argument('--seed', type=int, default=None, help='torch seed, set once before the first item')
    ap.add_argument('--thinking', choices=['default', 'off'], default='default',
                    help="'default' = the chat template's default; 'off' = enable_thinking=False")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    if args.seed is not None:
        torch.manual_seed(args.seed)
    dev = torch.device('cuda')
    model = AutoModelForImageTextToText.from_pretrained(args.model, torch_dtype=torch.bfloat16,
                                                        attn_implementation='sdpa').to(dev).eval()
    proc = AutoProcessor.from_pretrained(args.model)
    # stop at <|im_end|> (the tokenizer's eos) as well as the generation config's eos (<|endoftext|>)
    cfg_eos = model.generation_config.eos_token_id
    stop_ids = sorted({proc.tokenizer.eos_token_id, *(cfg_eos if isinstance(cfg_eos, list) else [cfg_eos])} - {None})

    for b in args.benches:
        items = benches.load(b, args.root)
        tag = ''
        if args.part:
            i, n = map(int, args.part.split('/'))
            items = items[len(items) * (i - 1) // n: len(items) * i // n]
            tag = f'.p{i}of{n}'
        done = set()
        for f in glob.glob(f'{args.out}/{b}.jsonl') + glob.glob(f'{args.out}/{b}.*.jsonl'):
            done |= {json.loads(line)['id'] for line in open(f)}
        todo = [it for it in items if it['id'] not in done]
        print(f'{time.strftime("%T")} {b}: {len(items)} items, {len(todo)} to go', flush=True)
        with open(f'{args.out}/{b}{tag}.jsonl', 'a') as fout:
            for k, it in enumerate(todo, 1):
                t0 = time.time()
                loaded = [load_image(p) for p in it['images']]
                if args.resize:
                    rs = tuple(map(int, args.resize.split('x')))
                    loaded = [(im.resize(rs, Image.LANCZOS), size) for im, size in loaded]
                messages = prompts.build(it, ['IMAGE'] * len(loaded))
                for m in messages:
                    m['content'] = [{'type': 'image'} if c['type'] == 'image_url' else c for c in m['content']]
                extra = {'enable_thinking': False} if args.thinking == 'off' else {}
                text_in = proc.apply_chat_template(messages, tokenize=False, add_generation_prompt=True, **extra)
                inputs = proc(text=[text_in], images=[im for im, _ in loaded], padding=True,
                              return_tensors='pt').to(dev)
                with torch.no_grad():
                    samp = (dict(do_sample=True, temperature=args.temperature, top_p=args.top_p, top_k=args.top_k)
                            if args.temperature > 0 else dict(do_sample=False))
                    if args.repetition_penalty != 1.0:
                        samp['repetition_penalty'] = args.repetition_penalty
                    out = model.generate(**inputs, max_new_tokens=args.max_new_tokens, eos_token_id=stop_ids, **samp)
                gen = out[0][inputs['input_ids'].shape[1]:]
                full = proc.decode(gen, skip_special_tokens=False)
                reasoning, closed, answer = full.rpartition('</think>')
                if not closed and text_in.rstrip().endswith('<think>'):
                    answer = ''                                  # thinking never ended: no answer
                for s in ('<|im_end|>', '<|endoftext|>'):
                    answer = answer.replace(s, '')
                size = loaded[0][1]
                rec = dict(id=it['id'], sub=it['sub'], text=answer.strip(), reasoning=reasoning or None,
                           finish='length' if len(gen) >= args.max_new_tokens else 'stop', sizes=[size],
                           secs=round(time.time() - t0, 1), tokens=len(gen))
                rec.update(scoring.score(it, rec['text'], size))
                fout.write(json.dumps(rec) + '\n')
                fout.flush()
                if k % 20 == 0:
                    print(f'  {k}/{len(todo)}', flush=True)
        print(f'{time.strftime("%T")} {b} done', flush=True)


if __name__ == '__main__':
    main()
