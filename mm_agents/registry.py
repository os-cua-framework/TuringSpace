# --agent name -> the agent and its settings. Each agent is the model's official computer-use agent in OSWorld (ReCAP
# and Claude / Gemini: their authors' own), changed only by captcha_prompt.py. --agent_args overrides any argument.
import json
import os

from .thinking import effort_levels

SCREEN = (1920, 1080)
AGENTS = ['gpt', 'claude', 'gemini', 'kimi', 'qwen', 'evocua', 'opencua', 'venus', 'uitars', 'recap', 'turingspace']


def _endpoint(args, url_var, key_var, default_key_var=None):
    """For agents that read their endpoint from environment variables."""
    if args.base_url:
        os.environ[url_var] = args.base_url
    if args.api_key:
        os.environ[key_var] = args.api_key
    elif default_key_var and default_key_var in os.environ and key_var not in os.environ:
        os.environ[key_var] = os.environ[default_key_var]


def make_agent(name, args, env=None):
    """Returns (agent, loop options for lib_run_single)."""
    over = json.loads(args.agent_args or '{}')
    model = args.model

    if name == 'gpt':
        from .gpt import GPTComputerAgent
        if args.api_key:
            os.environ['OPENAI_API_KEY'] = args.api_key
        kw = dict(env=env, model=model, temperature=1.0, top_p=0.9, max_trajectory_length=3, screen_width=SCREEN[0],
                  screen_height=SCREEN[1], reasoning_effort='medium', client_password='osworld-public-evaluation')
        kw.update(over)
        return GPTComputerAgent(**kw), {}

    if name == 'claude':
        from .claude import ClaudeAgent
        kw = dict(model=model, env=env, effort='medium')
        if getattr(args, 'system_file', None):
            with open(args.system_file) as f:
                kw['system'] = f.read().strip()
        kw.update(over)
        return ClaudeAgent(**kw), {}

    if name == 'gemini':
        from .gemini import GeminiComputerAgent
        kw = dict(model=model, environment='browser', screen_size=SCREEN, api_key=args.api_key, thinking_level='medium')
        kw.update(over)
        return GeminiComputerAgent(**kw), {}

    if name == 'kimi':
        from .kimi import KimiAgent
        if args.api_key:
            os.environ['OPENAI_API_KEY'] = args.api_key
        kw = dict(model=model, max_tokens=65536, top_p=1.0, temperature=1.0, action_space='pyautogui',
                  observation_type='screenshot', screen_size=SCREEN, coordinate_type='absolute', max_steps=args.max_steps,
                  thinking=True, reasoning_effort='high', password='osworld-public-evaluation', agent_mode='gui',
                  base_url=args.base_url, api_key_env='OPENAI_API_KEY', request_timeout=900.0, request_max_retries=5,
                  retry_delay=5.0, retry_max_delay=90.0, max_history_length=1000, num_max_images=100,
                  num_compact_images=10, fail_on_max_steps=True)
        kw.update(over)
        return KimiAgent(**kw), {'set_task_config': True}

    if name == 'qwen':
        from .qwen import QwenAgentWithOptions
        kw = dict(model=model, action_space='pyautogui', observation_type='screenshot', coordinate_type='relative',
                  add_thought_prefix=False, history_n=100, image_max=20, fold_size=10, enable_thinking=False,
                  base_url=args.base_url, api_key=args.api_key or os.environ.get('OPENAI_API_KEY'), thinking='on',
                  reasoning_effort='medium' if 'medium' in effort_levels(model) else None)
        kw.update(over)
        return QwenAgentWithOptions(**kw), {}

    if name == 'evocua':
        from .evocua import EvoCUAAgent
        _endpoint(args, 'OPENAI_BASE_URL', 'OPENAI_API_KEY')
        kw = dict(model=model, max_tokens=32768, top_p=0.9, temperature=0.01, action_space='pyautogui',
                  observation_type='screenshot', max_steps=args.max_steps, prompt_style='S2', max_history_turns=4,
                  screen_size=SCREEN, coordinate_type='relative', password='osworld-public-evaluation', resize_factor=32)
        kw.update(over)
        return EvoCUAAgent(**kw), {'break_on_empty': True}

    if name == 'opencua':
        from .opencua import OpenCUAAgent
        _endpoint(args, 'OPENCUA_BASE_URL', 'OPENCUA_API_KEY', 'OPENAI_API_KEY')
        kw = dict(env=env, model=model, max_tokens=2048, top_p=0.9, temperature=0, action_space='pyautogui',
                  observation_type='screenshot', cot_level='l2', history_type='action_history', screen_size=SCREEN,
                  coordinate_type='qwen25', max_image_history_length=3, max_steps=args.max_steps,
                  use_old_sys_prompt=False, password='osworld-public-evaluation')
        kw.update(over)
        return OpenCUAAgent(**kw), {'break_on_empty': True}

    if name == 'venus':
        from .ui_venus import UIVenusAgent
        kw = dict(model=model, base_url=args.base_url, api_key=args.api_key, enable_thinking=True, temperature=1.0,
                  top_p=0.95, top_k=20, presence_penalty=0.0, seed=None)
        kw.update(over)
        return UIVenusAgent(**kw), {}

    if name == 'uitars':
        from .ui_tars import UITARSAgent
        _endpoint(args, 'DOUBAO_API_URL', 'DOUBAO_API_KEY', 'OPENAI_API_KEY')
        os.environ.setdefault('DOUBAO_API_KEY', 'EMPTY')
        conf = {'infer_mode': 'qwen25vl_normal', 'prompt_style': 'qwen25vl_normal', 'input_swap': True,
                'language': 'English', 'history_n': 5, 'max_pixels': 16384 * 28 * 28, 'min_pixels': 100 * 28 * 28,
                'callusr_tolerance': 3, 'temperature': 0.0, 'top_k': -1, 'top_p': 0.9, 'max_tokens': 1000}
        conf.update({k: v for k, v in over.items() if k in conf})
        kw = dict(model=model, action_space='pyautogui', observation_type='screenshot',
                  max_trajectory_length=args.max_steps, model_type='qwen25vl', runtime_conf=conf)
        kw.update({k: v for k, v in over.items() if k not in conf})
        return UITARSAgent(**kw), {}

    if name == 'recap':
        from .recap import ReCAPAgent
        kw = dict(model=model, base_url=args.base_url, api_key=args.api_key)
        kw.update(over)
        return ReCAPAgent(**kw), {'break_on_empty': True}

    if name == 'turingspace':
        from .turingspace import TuringSpaceAgent
        kw = dict(model=model, base_url=args.base_url, api_key=args.api_key or os.environ.get('OPENAI_API_KEY'))
        kw.update(over)
        return TuringSpaceAgent(**kw), {}

    raise ValueError(f'unknown agent {name!r}; one of {AGENTS}')
