# Runs one model on TuringSpace-Bench (or on ReCAP / Open CaptchaWorld with --source). Each worker process owns one
# browser environment and plays episodes from a shared queue; an agent is built new for every episode. Episodes that
# already have a result.json in --result_dir are skipped, so an interrupted run continues where it stopped.
#
#   python run.py --agent gpt --model gpt-6-astra --result_dir results/gpt-6-astra
#   python run.py --agent qwen --model Qwen/Qwen3.5-9B --base_url http://127.0.0.1:8000/v1 --result_dir results/qwen3.5-9b
import argparse
import json
import multiprocessing as mp
import os
import sys
import time
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def parse_args(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--agent', required=True, help='an agent name of mm_agents/registry.py')
    p.add_argument('--model', default=None)
    p.add_argument('--base_url', default=None, help='OpenAI-compatible endpoint of a locally served model')
    p.add_argument('--api_key', default=None, help='default: the environment variable the agent reads')
    p.add_argument('--agent_args', default='{}', help='JSON of agent constructor arguments to override')
    p.add_argument('--system_file', default=None, help='claude: a file whose text replaces the system prompt')
    p.add_argument('--source', default='turingspace', choices=['turingspace', 'recap', 'ocw'])
    p.add_argument('--tasks_url', default='http://127.0.0.1:7869')
    p.add_argument('--recap_url', default='http://127.0.0.1:5050')
    p.add_argument('--ocw_url', default='http://127.0.0.1:7860')
    p.add_argument('--tasks', default='', help='comma list of tasks or categories; empty = all')
    p.add_argument('--seeds', default='', help='comma list; empty = 36,43,50')
    p.add_argument('--max_steps', type=int, default=50, help='model calls per episode')
    p.add_argument('--num_envs', type=int, default=1)
    p.add_argument('--result_dir', required=True)
    return p.parse_args(argv)


def worker(idx, args, queue):
    from lib_run_single import run_single_example
    from mm_agents.registry import make_agent
    from turingspace_env import TuringSpaceEnv, make_source
    env = TuringSpaceEnv(make_source(args))
    while True:
        try:
            ex = queue.get(timeout=1)
        except Exception:
            break
        out = os.path.join(args.result_dir, ex['id'])
        agent, opts = make_agent(args.agent, args, env=env)
        try:
            rec = run_single_example(agent, env, ex, args.max_steps, out, opts=opts)
        except Exception:
            print(f"[{idx}] {ex['id']}: not run\n{traceback.format_exc()}", flush=True)
            continue
        print(f"[{idx}] {ex['id']}: {rec['outcome']} ({rec['actions']} actions, {rec['seconds']}s)", flush=True)
    env.close()


def main():
    args = parse_args()
    from turingspace_env import make_source
    examples = make_source(args).load_examples([t for t in args.tasks.split(',') if t] or None,
                                               [int(s) if s.isdigit() else s for s in args.seeds.split(',') if s] or None)
    os.makedirs(args.result_dir, exist_ok=True)
    todo = [e for e in examples if not os.path.exists(os.path.join(args.result_dir, e['id'], 'result.json'))]
    run_args = {k: v for k, v in vars(args).items() if k != 'api_key'}
    json.dump({'args': run_args, 'n_examples': len(examples), 'started': time.strftime('%Y-%m-%d %H:%M:%S')},
              open(os.path.join(args.result_dir, 'run_args.json'), 'w'), indent=1)
    print(f'{len(examples)} examples, {len(todo)} to run, {args.num_envs} envs', flush=True)
    ctx = mp.get_context('spawn')
    queue = ctx.Queue()
    for e in todo:
        queue.put(e)
    procs = [ctx.Process(target=worker, args=(i, args, queue)) for i in range(max(1, min(args.num_envs, len(todo))))]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
    recs = [json.load(open(f)) for f in (os.path.join(args.result_dir, e['id'], 'result.json') for e in examples)
            if os.path.exists(f)]
    with open(os.path.join(args.result_dir, 'results.jsonl'), 'w') as f:
        for r in recs:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')
    print(f'done: {sum(r["success"] for r in recs)}/{len(recs)} solved')


if __name__ == '__main__':
    main()
