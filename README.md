# TuringSpace: Grounding Spatial Intelligence in Action with Interactive CAPTCHAs

<p align="center">
🧩 <a href="#-turingspace-bench">TuringSpace-Bench</a> &nbsp;|&nbsp; 📊 <a href="#-results">Results</a> &nbsp;|&nbsp; 🚀 <a href="#-quick-start">Quick start</a> &nbsp;|&nbsp; 🏋️ <a href="#️-training">Training</a> &nbsp;|&nbsp; 🌍 <a href="#-out-of-domain-evaluation">Out-of-domain evaluation</a>
</p>

This repository contains the evaluation code of **TuringSpace-Bench**, a benchmark of 125 interactive spatial CAPTCHAs,
and the training and out-of-domain evaluation of **TuringSpace-9B**. A model sees a 1920×1080 screenshot, clicks and
drags on it, sees the next screenshot, and presses **Verify** when it thinks the puzzle is solved. Every task depends on
the 3D structure behind the picture.

## 📁 What's in this repo

```
TuringSpace/
├── run.py                 run one model on the benchmark
├── lib_run_single.py      one attempt: screenshot -> agent -> actions, until Verify or 50 model calls
├── show_result.py         pass@1 and pass^3, per category and over all tasks
├── play.py                open a test instance in your browser and solve it yourself
├── evaluation_examples/   the 125 tasks by category and the three test seeds
├── results/               the leaderboard
├── tasks/                 the puzzle pages and the 125 task programs, by category
├── turingspace_env/       the browser environment: page, screenshots, pyautogui actions, verdict
├── mm_agents/             one official computer-use agent per model
├── training/              SFT of Qwen3.5-9B into TuringSpace-9B
└── ood_eval/              ReCAP, Open CaptchaWorld and five spatial benchmarks
```

`tasks/`, `turingspace_env/`, `mm_agents/`, `training/` and `ood_eval/` each have a README with their details.

## 🧩 TuringSpace-Bench

Each task is a program that generates a puzzle from a seed, together with a checker of the submitted state. The
benchmark tests every task on seeds 36, 43 and 50, so 375 instances in all. The tasks fall into five categories, 25 each:

| Category | The player |
|---|---|
| A. Spatial relation | marks or selects the answer in a fixed scene: occlusion, containment, support, what another person can see |
| B. Closed-loop manipulation | rotates, moves or aligns objects, and corrects each action after seeing its result |
| C. Multi-step planning | plans a sequence of actions whose single results do not show progress, or predicts how a process unfolds |
| D. Mental transformation | answers about an operation the page never shows: rotating, folding, cutting, changing the viewpoint |
| E. Spatiotemporal reasoning | steps through up to 16 frames and tracks or predicts moving objects and people |

## 📊 Results

pass@1 (%) on TuringSpace-Bench. `results/leaderboard.csv` also holds pass^3 and the standard deviations.

| Model | A | B | C | D | E | All |
|---|---:|---:|---:|---:|---:|---:|
| Human | 97.3 | 93.3 | 93.3 | 92.0 | 94.7 | 94.1 |
| GPT-6 Astra | 72.0 | 85.3 | 76.0 | 85.3 | 52.0 | **74.1** |
| Claude Opus 5.5 | 62.7 | 64.0 | 70.7 | 74.7 | 54.7 | 65.3 |
| Gemini 4 Argon | 58.7 | 66.7 | 64.0 | 52.0 | 48.0 | 57.9 |
| Claude Fable 5.1 | 44.0 | 44.0 | 44.0 | 57.3 | 33.3 | 44.5 |
| GPT-6 Sol | 42.7 | 45.3 | 45.3 | 44.0 | 30.7 | 41.6 |
| Claude Sonnet 5.5 | 37.3 | 48.0 | 34.7 | 34.7 | 30.7 | 37.1 |
| TuringSpace-9B | 53.3 | 16.0 | 30.7 | 21.3 | 44.0 | 33.1 |
| Kimi K3 | 37.3 | 21.3 | 36.0 | 33.3 | 32.0 | 32.0 |
| Qwen3.8-Max | 36.0 | 30.7 | 14.7 | 38.7 | 33.3 | 30.7 |
| Gemini 3.8 Flash | 37.3 | 22.7 | 33.3 | 28.0 | 29.3 | 30.1 |
| Qwen3.8-27B | 6.7 | 5.3 | 4.0 | 4.0 | 9.3 | 5.9 |
| UI-Venus-2-9B | 8.0 | 1.3 | 2.7 | 2.7 | 2.7 | 3.5 |
| EvoCUA-32B | 1.3 | 0.0 | 0.0 | 1.3 | 12.0 | 2.9 |
| OpenCUA-32B | 4.0 | 1.3 | 0.0 | 2.7 | 4.0 | 2.4 |
| Qwen3.5-9B | 0.0 | 0.0 | 0.0 | 4.0 | 8.0 | 2.4 |
| ReCAP-32B-Instruct | 0.0 | 1.3 | 2.7 | 1.3 | 2.7 | 1.6 |
| UI-TARS-1.5-7B | 0.0 | 0.0 | 0.0 | 1.3 | 1.3 | 0.5 |

## 🚀 Quick start

```bash
conda create -n turingspace python=3.11 -y && conda activate turingspace
pip install -r requirements.txt
python -m playwright install chromium
```

Serve the puzzle pages. A test instance opens at `http://127.0.0.1:7869/run.html?task=<task>&seed=<seed>`.

```bash
python -m http.server 7869 --directory tasks
```

Run a model on the 375 test instances and score it. `run.py` writes one folder per attempt (screenshots, `traj.jsonl`,
`result.json`) and skips the attempts that already have a `result.json`.

```bash
python run.py --agent claude --model claude-opus-5-5 --result_dir results/claude-opus-5-5 --num_envs 8
python show_result.py results/claude-opus-5-5
```

Solve a test instance yourself:

```bash
python play.py pipes_connect --seed 36
```

## ⚙️ Evaluation protocol

- **Screen.** Every screenshot is 1920×1080: the page is laid out at 1280×720 CSS pixels and rendered at device pixel
  ratio 1.5. The mouse pointer is drawn on it, and it is taken once the page is still.
- **Agent.** Each model runs in its official computer-use agent, with that agent's system prompt, action format, context
  management and sampling. The benchmark removes the sentences about the virtual machine from the prompt and appends
  one sentence that authorizes the model to solve the puzzles. A Claude attempt that still stopped to ask for
  permission was played again with a longer authorization as its system prompt.
- **Attempt.** One attempt per instance, which ends at the first press of Verify or after 50 model calls.
- **Scores.** pass@1 is the success rate on each seed averaged over the three seeds, with its sample standard
  deviation; pass^3 is the share of tasks solved on all three seeds.

[`mm_agents/README.md`](./mm_agents/README.md) gives the prompts, decoding and serving of every model.

## 🏋️ Training

TuringSpace-9B is Qwen3.5-9B fine-tuned with Megatron-SWIFT on 55,000 trajectories made with TuringSpace-Gym
(`<TuringSpace-Gym link>`). The training screenshots are 1280×720 to save GPU memory, so TuringSpace-9B is also
evaluated on 1280×720 screenshots. [`training/README.md`](./training/README.md) gives the samples, the settings and the
commands.

## 🌍 Out-of-domain evaluation

Qwen3.5-9B, Qwen3.5-27B and TuringSpace-9B are evaluated zero-shot on two interactive CAPTCHA benchmarks (ReCAP, Open
CaptchaWorld) and five spatial benchmarks (SpatialViz-Bench, VSI-Bench, RefSpatial-Bench, VABench-Point,
RoboAfford-Eval). [`ood_eval/README.md`](./ood_eval/README.md) gives the settings, the data and the commands.

## 🙏 Acknowledgements

The agents in `mm_agents/` are the computer-use agents of [OSWorld](https://github.com/xlang-ai/OSWorld). We thank the
authors of [ReCAP](https://github.com/ASTRAL-Group/ReCAP-Agent), [Open CaptchaWorld](https://github.com/MetaAgentX/OpenCaptchaWorld),
[VLMEvalKit](https://github.com/open-compass/VLMEvalKit) and [EmbodiedEvalKit](https://github.com/pickxiguapi/EmbodiedEvalKit)
for releasing their code, and the photographers and font designers listed in `tasks/assets/ATTRIBUTION.md`.

## ⚠️ Intended use

TuringSpace measures and trains spatial understanding through interaction. Like other work on CAPTCHA solving it is
dual-use: agents trained on TuringSpace may also solve deployed CAPTCHAs more often. Do not use TuringSpace to bypass
CAPTCHAs that protect real services, and do not train on the test instances (seeds 36, 43 and 50) of TuringSpace-Bench.

## 📝 Citation

```bibtex
@article{ding2026turingspace,
  title   = {TuringSpace: Grounding Spatial Intelligence in Action with Interactive CAPTCHAs},
  author  = {Ding, Xuwei and Zhai, Skylar and Song, Linxin and Feng, Jiarui and Fu, Dongqi and Xi, Huajun and
             Li, Junnan and Liang, Jingcheng and Zhao, Jieyu and Xia, Yinglong and Li, Hong and Kang, Jian},
  journal = {arXiv preprint},
  year    = {2026}
}
```

## 📄 License

The code is released under the Apache License 2.0 (`LICENSE`); the parts adapted from OSWorld and other projects are
listed in `NOTICE`. The assets keep the licences of their sources (`tasks/assets/ATTRIBUTION.md`).
