#!/usr/bin/env bash
# Full-parameter SFT of Qwen3.5-9B into TuringSpace-9B with Megatron-SWIFT. Run it from the samples directory, where
# the image paths of train.jsonl and val.jsonl resolve.
#   MODEL=/path/to/Qwen3.5-9B bash sft_qwen35_9b.sh
# Multi-node runs set NNODES, NODE_RANK, MASTER_ADDR and MASTER_PORT (slurm_sft.sbatch does).
set -euo pipefail
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

PYTORCH_CUDA_ALLOC_CONF='expandable_segments:True' \
NPROC_PER_NODE=${NPROC_PER_NODE:-8} \
CUDA_VISIBLE_DEVICES=${CUDA_VISIBLE_DEVICES:-$(seq -s, 0 $(( ${NPROC_PER_NODE:-8} - 1 )))} \
megatron sft \
    --model "${MODEL:-Qwen/Qwen3.5-9B}" \
    --dataset train.jsonl \
    --val_dataset val.jsonl \
    --split_dataset_ratio 0 \
    --load_from_cache_file true \
    --agent_template qwen3_5 \
    --add_non_thinking_prefix true \
    --loss_scale default+ignore_empty_think \
    --max_length 20480 \
    --truncation_strategy delete \
    --tuner_type full \
    --freeze_llm false \
    --freeze_vit true \
    --freeze_aligner true \
    --tensor_model_parallel_size "${TP:-1}" \
    --micro_batch_size 1 \
    --global_batch_size 128 \
    --train_iters 1000 \
    --recompute_granularity full \
    --recompute_method "${RECOMPUTE_METHOD:-block}" \
    --recompute_num_layers "${RECOMPUTE_NUM_LAYERS:-16}" \
    --lr 5e-6 \
    --min_lr 1e-6 \
    --lr_decay_style cosine \
    --lr_warmup_fraction 0.03 \
    --adam_beta1 0.9 \
    --adam_beta2 0.95 \
    --adam_eps 1e-8 \
    --clip_grad 1.0 \
    --weight_decay 0.033 \
    --use_distributed_optimizer true \
    --use_precision_aware_optimizer true \
    --main_grads_dtype bf16 \
    --mtp_num_layers 0 \
    --cross_entropy_loss_fusion true \
    --attention_backend flash \
    --finetune true \
    --eval_steps 100 \
    --save_steps 100 \
    --save_safetensors true \
    --no_save_optim false \
    --no_save_rng true \
    --logging_steps 1 \
    --report_to tensorboard \
    --seed 1234 \
    --dataloader_num_workers 8 \
    --dataset_num_proc 8 \
    --external_plugins "$HERE/plugins/loss_only_logits.py" \
    --output_dir "${OUT:-output/turingspace-9b}"
