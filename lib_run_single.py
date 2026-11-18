# One episode, the loop of OSWorld's lib_run_single.run_single_example: observe -> agent.predict -> env.step for each
# returned action, until the page judges a submission or the agent has made max_steps model calls.
#
# Writes to example_result_dir:
#   step_0.png, step_N.png   the first screen and the screen after every action
#   traj.jsonl               one line per model call ({"type": "model_call", token usage}) and per action
#   result.json              outcome, success, token usage summed over the episode
import datetime
import json
import os
import shutil
import time

from mm_agents.usage import total as usage_total


def run_single_example(agent, env, example, max_steps, example_result_dir, opts=None):
    """opts from mm_agents.registry: break_on_empty = end the episode when predict returns no action;
    set_task_config = call agent.set_task_config(example) first."""
    opts = opts or {}
    shutil.rmtree(example_result_dir, ignore_errors=True)
    os.makedirs(example_result_dir)
    traj = os.path.join(example_result_dir, 'traj.jsonl')

    def log(line):
        with open(traj, 'a') as f:
            f.write(json.dumps(line, ensure_ascii=False, default=str) + '\n')

    t0 = time.time()
    obs = env.reset(task_config=example)
    if opts.get('set_task_config'):
        agent.set_task_config(example)
    with open(os.path.join(example_result_dir, 'step_0.png'), 'wb') as f:
        f.write(obs['screenshot'])
    done, step_idx, n_actions, outcome, error = False, 0, 0, None, None
    usage = []
    try:
        while not done and step_idx < max_steps:
            out = agent.predict(example['instruction'], obs)
            response, actions = out[0], out[1]
            calls, agent.last_usage = list(getattr(agent, 'last_usage', None) or []), []
            for u in calls:
                usage.append(u)
                log({'type': 'model_call', 'step_num': step_idx + 1, 'call': len(usage), **u})
            reasoning, blocks = getattr(agent, 'last_reasoning', None), getattr(agent, 'last_blocks', None)
            extra = {**({'reasoning': reasoning} if reasoning else {}), **({'blocked_replies': blocks} if blocks else {})}
            actions = list(actions or [])
            if not actions:
                log({'step_num': step_idx + 1, 'action_num': None, 'action': None, 'response': response, **extra,
                     'done': False, 'info': {'no_action': True}})
            if getattr(agent, 'blocked', False):
                outcome = 'blocked'
                break
            if opts.get('break_on_empty') and (not actions or (isinstance(actions[0], str) and (
                    actions[0] == '' or actions[0].lower().startswith('error')))):
                done = True
                break
            for action in actions:
                n_actions += 1
                obs, reward, done, info = env.step(action)
                shot = f'step_{n_actions}.png'
                with open(os.path.join(example_result_dir, shot), 'wb') as f:
                    f.write(obs['screenshot'])
                log({'step_num': step_idx + 1, 'action_num': n_actions,
                     'action_timestamp': datetime.datetime.now().strftime('%Y%m%d@%H%M%S%f'),
                     'action': action, 'response': response, **extra, 'done': done, 'info': info, 'screenshot_file': shot})
                if done:
                    break
            step_idx += 1
    except Exception as e:
        error = f'{type(e).__name__}: {e}'
    result = env.evaluate()
    submitted = env.submitted()
    if outcome is None:
        outcome = ('pass' if result else 'fail') if submitted else ('error' if error else
                   'no_submit_terminate' if done else 'no_submit_max_steps')
    rec = {'id': example['id'], 'category': example['category'], 'config': example['config'], 'task': example['task'],
           'seed': example['seed'], 'outcome': outcome, 'success': bool(result), 'submitted': submitted,
           'model_calls': step_idx, 'actions': n_actions, 'seconds': round(time.time() - t0, 1), 'error': error,
           'page_errors': env.page_errors[:3], 'detail': (env.result() or {}).get('detail')}
    if usage:
        rec['usage'] = usage_total(usage)
    source = env.record()
    if source is not None:
        rec['source'] = source
    with open(os.path.join(example_result_dir, 'result.json'), 'w') as f:
        json.dump(rec, f, ensure_ascii=False, indent=1)
    return rec
