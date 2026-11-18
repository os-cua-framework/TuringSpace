# Agents and models

One official computer-use agent per model. `run.py --agent <name>` builds the agent that `registry.py` names, with the
settings below; `--agent_args` (JSON) overrides any argument of the agent.

| File | Role |
|---|---|
| `registry.py` | `--agent` name → agent and its settings |
| `captcha_prompt.py` | every change the benchmark makes to the agents' prompts |
| `gpt/`, `claude/`, `gemini/`, `kimi/`, `qwen/`, `evocua/`, `opencua/`, `ui_venus/`, `ui_tars/`, `recap/` | the agents of the evaluated models |
| `turingspace/` | TuringSpace-9B, asked in the format of its training samples |
| `openrouter.py`, `thinking.py`, `usage.py` | provider pins, reasoning-effort levels, token usage |

## Prompts

Each model runs in its official computer-use agent from OSWorld (Claude and Gemini: the computer-use tools of their
APIs; UI-Venus-2-9B and ReCAP-32B-Instruct: the CAPTCHA prompts of their authors). The system prompt, the action format
and the context management (which past screenshots and actions each request keeps) follow that agent.
`captcha_prompt.py` holds every change to these prompts: the sentences about the virtual machine, its password, home
directory and date, files, applications and dialogs, asking the user and infeasible tasks are removed, and one sentence
that authorizes the model to solve the puzzles is appended. Claude and Gemini receive this sentence as their whole
system prompt.

Every model receives the same instruction in its own user-message template: "Solve the CAPTCHA puzzle shown on the
screen. Follow the instruction written on the puzzle, then click Verify to submit your answer." When a GPT, Claude or
Gemini model stops without an action, it receives "Yes, go ahead and solve it yourself." with the current screenshot, at
most three times.

A Claude attempt that still stopped to ask for permission after these replies was played again with the system prompt
in `claude/rerun_system_prompt.txt`, which says that the page is a local benchmark and authorizes the model to solve
its puzzles. To do the same, delete the `result.json` of those attempts and run the same command again with
`--system_file mm_agents/claude/rerun_system_prompt.txt`; `run.py` then plays only them.

## Decoding

Temperature and the other sampling parameters follow the model's OSWorld runner, or its model card where the card gives
them (Qwen3.5, Qwen3.8, Kimi K3, UI-Venus-2); the proprietary models use their API defaults. Models with an adjustable
reasoning effort run at medium; Kimi K3 runs at high.

## Models

| Model | `--agent` | `--model` | Served by |
|---|---|---|---|
| GPT-6 Astra | `gpt` | `gpt-6-astra` | OpenAI API |
| GPT-6 Sol | `gpt` | `gpt-6-sol` | OpenAI API |
| Claude Opus 5.5 | `claude` | `claude-opus-5-5` | Anthropic API |
| Claude Fable 5.1 | `claude` | `claude-fable-5-1` | Anthropic API |
| Claude Sonnet 5.5 | `claude` | `claude-sonnet-5-5` | Anthropic API |
| Gemini 4 Argon | `gemini` | `gemini-4-argon` | Gemini API |
| Gemini 3.8 Flash | `gemini` | `gemini-3.8-flash` | Gemini API |
| Kimi K3 | `kimi` | `moonshotai/kimi-k3` | OpenRouter |
| Qwen3.8-Max | `qwen` | `qwen/qwen3.8-max-0902` | OpenRouter |
| Qwen3.8-27B | `qwen` | `qwen/qwen3.8-27b` | OpenRouter |
| Qwen3.5-9B | `qwen` | `Qwen/Qwen3.5-9B` | vLLM |
| EvoCUA-32B | `evocua` | `meituan/EvoCUA-32B-20260105` | vLLM |
| OpenCUA-32B | `opencua` | `xlangai/OpenCUA-32B` | vLLM |
| UI-Venus-2-9B | `venus` | `inclusionAI/UI-Venus-2-9B` | vLLM |
| UI-TARS-1.5-7B | `uitars` | `ByteDance-Seed/UI-TARS-1.5-7B` | vLLM |
| ReCAP-32B-Instruct | `recap` | `ReCAP-Agent/ReCAP-32B-Instruct` | vLLM |
| TuringSpace-9B | `turingspace` | `<TuringSpace-9B checkpoint>` | vLLM |

**API models.** Set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`. For OpenRouter, pass
`--base_url https://openrouter.ai/api/v1` and the OpenRouter key as `OPENAI_API_KEY`; each model is pinned to its
maker's own service (`openrouter.py`).

```bash
python run.py --agent gpt --model gpt-6-astra --result_dir results/gpt-6-astra --num_envs 8
python run.py --agent kimi --model moonshotai/kimi-k3 --base_url https://openrouter.ai/api/v1 \
  --result_dir results/kimi-k3 --num_envs 8
```

**Local models.** Serve the model with vLLM, then point `--base_url` at it. The vLLM arguments of each model:

| Model | vLLM arguments |
|---|---|
| Qwen3.5-9B | `--max-model-len 131072 --limit-mm-per-prompt '{"image": 20}' --reasoning-parser qwen3` |
| UI-Venus-2-9B | `--max-model-len 131072 --limit-mm-per-prompt '{"image": 3}' --reasoning-parser qwen3` |
| UI-TARS-1.5-7B | `--dtype bfloat16 --max-model-len 32768 --limit-mm-per-prompt '{"image": 5}'` |
| EvoCUA-32B | `--tensor-parallel-size 4 --max-model-len 65536 --limit-mm-per-prompt '{"image": 5}'` |
| OpenCUA-32B | `--tensor-parallel-size 4 --max-model-len 32768 --limit-mm-per-prompt '{"image": 3}' --trust-remote-code` |
| ReCAP-32B-Instruct | `--tensor-parallel-size 4 --max-model-len 131072 --limit-mm-per-prompt '{"image": 60}'` |
| TuringSpace-9B | `--max-model-len 32768 --limit-mm-per-prompt '{"image": 20}'` |

```bash
vllm serve Qwen/Qwen3.5-9B --served-model-name Qwen/Qwen3.5-9B --port 8000 --gpu-memory-utilization 0.9 \
  --max-model-len 131072 --limit-mm-per-prompt '{"image": 20}' --reasoning-parser qwen3

python run.py --agent qwen --model Qwen/Qwen3.5-9B --base_url http://127.0.0.1:8000/v1 --api_key EMPTY \
  --result_dir results/qwen3.5-9b-think --num_envs 6
python run.py --agent qwen --model Qwen/Qwen3.5-9B --base_url http://127.0.0.1:8000/v1 --api_key EMPTY \
  --agent_args '{"thinking": "off"}' --result_dir results/qwen3.5-9b --num_envs 6
```

OpenCUA-32B runs on vLLM 0.23 with transformers 4.57.

**TuringSpace-9B** is asked in the format of its training samples (`turingspace/`). Its training samples use
1280×720 screenshots to save GPU memory, so every screenshot is resized to 1280×720 at evaluation as well. The prompt
keeps the last 20 screenshots, thinking is off, and decoding is greedy.

## Adding an agent

An agent has `predict(instruction, obs) -> (response, actions)`, as in OSWorld: `obs['screenshot']` is the PNG of the
screen, and each action is pyautogui code or one of `WAIT`, `DONE` and `FAIL`. Add it to `make_agent` in `registry.py`.
