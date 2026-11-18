# Out-of-domain evaluation

| Path | Role |
|---|---|
| `captcha/recap/` | the 140 ReCAP puzzles and the patch that seeds its puzzle server |
| `captcha/ocw/` | the 453 Open CaptchaWorld puzzles and the server that shows one puzzle per page |
| `spatial/` | data preparation, prompts, runners and scoring of the five spatial benchmarks |

ReCAP and Open CaptchaWorld run through `run.py` and `turingspace_env/`; the spatial benchmarks need
`pip install -r ood_eval/requirements.txt`.

Qwen3.5-9B, Qwen3.5-27B and TuringSpace-9B are evaluated zero-shot on seven benchmarks, all with thinking off.

| Benchmark | Items | The model | Score |
|---|---|---|---|
| ReCAP | 140 puzzles of 7 types | solves interactive CAPTCHAs with mouse and keyboard | share of puzzles solved within 50 model calls |
| Open CaptchaWorld | 453 puzzles of 19 types | solves interactive CAPTCHAs with mouse and keyboard | share of puzzles its server judges solved |
| SpatialViz-Bench | 1,180 | answers spatial visualization questions with an option letter | accuracy |
| VSI-Bench | 5,130 | answers questions on indoor videos with an option letter or a number | EASI VSI-Bench aggregate |
| RefSpatial-Bench | 277 | points at the place a spatial description refers to | share of points inside the mask |
| VABench-Point | 300 | points where a robot should act to complete an instruction | share of points inside the mask |
| RoboAfford-Eval | 338 | points at an object, the part to grasp, or a free region on a table | share of points inside the mask |

## Settings

**ReCAP and Open CaptchaWorld** run through the environment, agents and settings of TuringSpace-Bench; only the page,
the task instruction and the verdict change (`turingspace_env/sources.py`). Qwen3.5-9B and Qwen3.5-27B use the Qwen
agent with the sampling of their model card, and TuringSpace-9B uses its own agent.

**SpatialViz-Bench, VSI-Bench and RefSpatial-Bench** use the prompts and answer parsers of VLMEvalKit, and
**VABench-Point and RoboAfford-Eval** those of EmbodiedEvalKit (`spatial/`). Every model gets the same prompts.
Images for TuringSpace-9B are resized to 1280×720, its training resolution. VSI-Bench frames are 640×480, smaller
than 1280×720, so every model gets them at their original size. Points are scored in the original image.

| Benchmark | Model | Input | Decoding | Max new tokens |
|---|---|---|---|---|
| SpatialViz-Bench, RefSpatial-Bench | Qwen3.5-9B, Qwen3.5-27B | original image | temperature 1.0, top-p 0.95, top-k 20, presence penalty 1.5 (VLMEvalKit's Qwen3.5 configuration) | 32,768 |
| | TuringSpace-9B | 1280×720 | greedy | 256 |
| VSI-Bench | Qwen3.5-9B, Qwen3.5-27B | 32 original frames | greedy | 256 |
| | TuringSpace-9B | 32 original frames | greedy | 256 |
| VABench-Point, RoboAfford-Eval | Qwen3.5-9B, Qwen3.5-27B | original image | temperature 0.7, top-p 0.8, top-k 20, repetition penalty 1.05, seed 3407 (EmbodiedEvalKit's default) | 4,096 |
| | TuringSpace-9B | 1280×720 | greedy | 256 |

## Data

**ReCAP.** The puzzle server takes a seed, so that every puzzle is reproducible
(`captcha/recap/seeded_challenges.patch`). `recap140.json` lists 20 puzzles of each of its seven types, from its
held-out assets. For image grids, the environment ticks "I'm not a robot" before the first screenshot.

```bash
git clone https://github.com/ASTRAL-Group/ReCAP-Agent && cd ReCAP-Agent && git checkout 577c772
git apply ../TuringSpace/ood_eval/captcha/recap/seeded_challenges.patch
cd dynamic_captchas && pip install -r requirements.txt && python download_datasets.py
PORT=5050 python app.py
```

**Open CaptchaWorld.** `ocw453.json` lists every puzzle of its repository except the 10 of Hold_Button. `ocw_server.py`
serves one puzzle per page, lays the puzzle out beside its question (`ocw_clean.css`, element sizes unchanged), and
rewords two questions: Dice_Count asks to "Sum up the numbers on top of all the dice" and Unusual_Detection to "Select
all the animals with the wrong head". Its server judges the first answer that the page submits.

```bash
git clone https://github.com/MetaAgentX/OpenCaptchaWorld && cd OpenCaptchaWorld && git checkout 66c0a3b
pip install -r requirements.txt
python ../TuringSpace/ood_eval/captcha/ocw/ocw_server.py . 7860
```

**The five spatial benchmarks.** `prepare_data.py` downloads them from the Hugging Face Hub at fixed revisions. The
questions of SpatialViz-Bench, RefSpatial-Bench and VSI-Bench come from the EASI leaderboard files
(`lmms-lab-si/EASI-Leaderboard-Data`) that VLMEvalKit evaluates, the RefSpatial-Bench images and masks from
`BAAI/RefSpatial-Bench`, and the VSI-Bench videos from `nyu-visionx/VSI-Bench` (32 evenly spaced frames per video).
VABench-Point comes from `IffYuan/VABench-P` and RoboAfford-Eval from `Zray26/roboafford-eval`.

```bash
cd ood_eval/spatial
python prepare_data.py data
```

## Run

ReCAP and Open CaptchaWorld, from the repository root, with the models served as in
[`mm_agents/README.md`](../mm_agents/README.md):

```bash
python run.py --source recap --recap_url http://127.0.0.1:5050 --agent qwen --model Qwen/Qwen3.5-9B \
  --base_url http://127.0.0.1:8000/v1 --api_key EMPTY --agent_args '{"thinking": "off"}' --result_dir results/recap/qwen3.5-9b
python run.py --source ocw --ocw_url http://127.0.0.1:7860 --agent turingspace --model <TuringSpace-9B checkpoint> \
  --base_url http://127.0.0.1:8000/v1 --api_key EMPTY --result_dir results/ocw/turingspace-9b
python show_result.py results/recap/qwen3.5-9b results/ocw/turingspace-9b
```

The five spatial benchmarks, from `ood_eval/spatial/`:

```bash
# Qwen3.5-9B: SpatialViz-Bench and RefSpatial-Bench on a vLLM server
vllm serve Qwen/Qwen3.5-9B --served-model-name qwen35-9b --port 8000 --max-model-len 65536 \
  --limit-mm-per-prompt '{"image": 8}' --reasoning-parser qwen3
python run_vllm.py --root data --out results/qwen35-9b --model qwen35-9b --base_url http://127.0.0.1:8000/v1 \
  --benches spatialviz refspatial --thinking off

# Qwen3.5-9B: VSI-Bench, VABench-Point and RoboAfford-Eval
python run_hf.py --model Qwen/Qwen3.5-9B --root data --out results/qwen35-9b --benches vsibench \
  --thinking off --max_new_tokens 256
python run_hf.py --model Qwen/Qwen3.5-9B --root data --out results/qwen35-9b --benches vabench_point roboafford \
  --thinking off --temperature 0.7 --top_p 0.8 --top_k 20 --repetition_penalty 1.05 --seed 3407 \
  --max_new_tokens 4096

# TuringSpace-9B
python run_hf.py --model <TuringSpace-9B checkpoint> --root data --out results/turingspace-9b \
  --benches spatialviz refspatial vabench_point roboafford --thinking off --resize 1280x720 --max_new_tokens 256
python run_hf.py --model <TuringSpace-9B checkpoint> --root data --out results/turingspace-9b --benches vsibench \
  --thinking off --max_new_tokens 256

python report.py results/qwen35-9b results/turingspace-9b --sub
```

Qwen3.5-27B runs with the commands of Qwen3.5-9B and the model `Qwen/Qwen3.5-27B`, served by vLLM with
`--tensor-parallel-size 2`. `show_result.py` prints the success rate per CAPTCHA type and over all puzzles; `report.py`
prints the score of each spatial benchmark, and `--sub` adds the score per sub-task.

`run_hf.py` resizes each image with `smart_resize` (factor 8, at most 8,294,400 pixels) before `--resize`, stops at
`<|im_end|>` or `<|endoftext|>`, and scores the text after the last `</think>`. `run_vllm.py` sends images at their
original size. Each runner writes one line per item to `<out>/<bench>.jsonl` and skips the items already there; with
`--part i/n` it runs the i-th of n slices, so that slices can run on separate GPUs.
