# Training TuringSpace-9B

TuringSpace-9B is Qwen3.5-9B fine-tuned on 55,000 trajectories made with TuringSpace-Gym (`<TuringSpace-Gym link>`):
500 per task for categories A–D and 200 per task for category E.

| File | Role |
|---|---|
| `sft_qwen35_9b.sh` | the `megatron sft` command of the run |
| `slurm_sft.sbatch` | the same run on 4 nodes × 8 GPUs under Slurm |
| `check_data.py` | checks that every image of the samples exists and matches its `<image>` tags |
| `plugins/loss_only_logits.py` | computes the output layer and the cross entropy only at the trained positions |
| `pyproject.toml`, `uv.lock` | the training environment (ms-swift 4.4.1) |

## Samples

Each sample is one trajectory in the ms-swift agent format, the same format that `mm_agents/turingspace/` uses at test
time: no system message, the `computer_use` tool (coordinates on a 0–999 grid) registered as the request's tools, the
instruction and the first screenshot as the first user turn, then the model's tool calls and a tool response with the
next screenshot. Screenshots are 1280×720 to save GPU memory, and the context keeps the last 20 of them. Thinking is
off, and only the tool calls are trained.

## Settings

| Setting | Value |
|---|---|
| Framework | ms-swift 4.4.1 `megatron sft`, full parameters, vision encoder and aligner frozen |
| Steps | 1,000, global batch 128 (one trajectory per micro batch), max length 20,480 |
| Learning rate | 5e-6, cosine to 1e-6, 3% warmup, AdamW (0.9, 0.95), weight decay 0.033, gradient clip 1.0 |
| Hardware | 32 H200 GPUs (4 nodes × 8), tensor parallel 1, activation recomputation of 16 layers (block) |
| Model | checkpoint-1000 |

## Run

The run reads the samples, `train.jsonl` and `val.jsonl` with their images, from the directory it starts in.

```bash
cd training && uv sync --frozen && cd ..
python training/check_data.py /path/to/samples
sbatch training/slurm_sft.sbatch           # after filling in its #SBATCH lines and paths
```

On a single node, run `MODEL=/path/to/Qwen3.5-9B bash /path/to/TuringSpace/training/sft_qwen35_9b.sh` from the samples
directory.
