#!/bin/bash
# Slurm job for sft_qwen35_9b.sh on 4 nodes x 8 GPUs. Fill in the #SBATCH lines and the paths below, then submit:
#   sbatch training/slurm_sft.sbatch
#SBATCH --job-name=turingspace-sft
#SBATCH --account=CHANGE_ME
#SBATCH --partition=CHANGE_ME
#SBATCH --nodes=4
#SBATCH --ntasks-per-node=1
#SBATCH --gres=gpu:8
#SBATCH --cpus-per-task=32
#SBATCH --mem=600G
#SBATCH --time=24:00:00
#SBATCH --output=%x-%j.out

set -euo pipefail

DATA_DIR=/path/to/samples                # train.jsonl, val.jsonl and their images
MODEL=/path/to/Qwen3.5-9B
OUT=/path/to/output/turingspace-9b
CACHE_DIR=/path/to/cache
REPO=${REPO:-$SLURM_SUBMIT_DIR}
ENV_SETUP="source $REPO/training/.venv/bin/activate && export PATH=/usr/local/cuda-12.8/bin:\$PATH"

python3 "$REPO/training/check_data.py" "$DATA_DIR"
mkdir -p "$OUT" "$CACHE_DIR"
export MODEL OUT
export HF_HOME=$CACHE_DIR/huggingface MODELSCOPE_CACHE=$CACHE_DIR/modelscope TRITON_CACHE_DIR=$CACHE_DIR/triton TILELANG_CACHE_DIR=$CACHE_DIR/tilelang
export NPROC_PER_NODE=${SLURM_GPUS_ON_NODE:-$(nvidia-smi -L | wc -l | tr -d " ")}
export NNODES=$SLURM_NNODES
export MASTER_ADDR=$(scontrol show hostnames "$SLURM_JOB_NODELIST" | head -n 1)
export MASTER_PORT=$(( 20000 + SLURM_JOB_ID % 20000 ))

srun --ntasks-per-node=1 --cpus-per-task="${SLURM_CPUS_PER_TASK:-1}" bash -c \
  "export NODE_RANK=\$SLURM_NODEID; $ENV_SETUP; cd '$DATA_DIR' && bash '$REPO/training/sft_qwen35_9b.sh'"
