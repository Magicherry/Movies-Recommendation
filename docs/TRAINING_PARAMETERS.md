# Training Parameter Guide

This guide provides practical training presets for `scripts.train_and_evaluate`.
All commands below use a multi-line PowerShell format for readability.

## General Notes

- Dataset path: `dataset/ml-latest`
- Artifacts output: `models/artifacts/<model-type>/`
- Shared split cache: `models/artifacts/splits/`
- Use `--force-resplit` only when you intentionally want a new split
- Install dependencies from `requirements.txt` before training

## Accelerator Compatibility (CUDA / MPS / CPU)

This project uses PyTorch CUDA wheels (`cu128`) for GPU acceleration.

Compatible NVIDIA GPU series (common examples):

- GeForce RTX 50 series: `RTX 5090`, `RTX 5080`, `RTX 5070`
- GeForce RTX 40 series: `RTX 4090`, `RTX 4080`, `RTX 4070`, `RTX 4060`
- GeForce RTX 30 series: `RTX 3090`, `RTX 3080`, `RTX 3070`, `RTX 3060`
- Data center GPUs: `A100`, `A40`, `L40`, `L4`, `H100`, `H200`

Suggested Option 2 batch size by VRAM:

- `>= 20GB`: `--batch-size 32768`
- `12GB-19GB`: `--batch-size 16384`
- `< 12GB`: `--batch-size 8192`

Notes:

- Option 2 benefits the most from GPU.
- Option 1 and Option 3 now have PyTorch/CUDA paths, but their speedup is usually smaller than Option 2.
- If CUDA is unavailable, training falls back to CPU automatically.

### Apple Silicon (MPS) Support

MPS support is available when running on macOS with Apple Silicon and a PyTorch build that includes MPS.

Per-model compatibility:

- `option1`: Full MPS training support (`cuda -> mps -> cpu` device selection).
- `option2`: Full MPS training support (`cuda -> mps -> cpu` device selection).
- `option3_ridge` / `option3_lasso`: Partial MPS support. Some tensor-based steps can use MPS, but sparse SVD acceleration is CUDA-only and falls back to SciPy/CPU when CUDA is unavailable.
- `option4`: CPU path (NumPy/Numba ALS), no MPS acceleration.

Important behavior in the training driver:

- Auto batch-size tuning is CUDA-memory-aware only.
- On MPS machines, set batch sizes manually for stable throughput:
  - Option 2: start with `--batch-size 8192` or `--batch-size 16384`
  - Option 1: start with `--option1-batch-size 16384` or `--option1-batch-size 32768`

## Optimized Training Presets

These presets are tuned for the current codebase after evaluation reliability fixes.

Priority recommendation:

1. Train Option 2 first (main candidate for deployment)
2. Train Option 1 as a robust backup
3. Train Option 3 variants for additional comparison
4. Treat Option 4 as experimental

### Option 2 (Deep Neural CF) - Primary Preset

Quality-focused preset:

```powershell
python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --n-factors 128 `
  --epochs 45 `
  --batch-size 32768 `
  --option2-lr 0.0005 `
  --title-embedding-dim 64 `
  --title-num-filters 128 `
  --option2-dropout-rate 0.12 `
  --option2-l2-reg 0.000004 `
  --option2-validation-split 0.12 `
  --option2-lr-plateau-patience 3 `
  --option2-lr-plateau-factor 0.5 `
  --option2-min-lr 0.00001 `
  --option2-rating-weight-power 1.25 `
  --option2-popularity-prior-count 20
```

### Option 1 (MF-SGD, PyTorch) - Overfitting-Controlled Preset

This setting lowers learning rate and increases regularization because Option 1 tended to overfit early.

```powershell
python -m scripts.train_and_evaluate `
  --model-type option1 `
  --dataset-dir dataset/ml-latest `
  --n-factors 128 `
  --epochs 40 `
  --option1-batch-size 65536 `
  --lr 0.0035 `
  --reg 0.04 `
  --lr-decay 0.995 `
  --option1-validation-split 0.10 `
  --option1-early-stopping-patience 4
```

### Option 3 Ridge (SVD + Ridge) - Rating-Error Focused

```powershell
python -m scripts.train_and_evaluate `
  --model-type option3_ridge `
  --dataset-dir dataset/ml-latest `
  --n-factors 128 `
  --option3-reg-alpha 0.02 `
  --option3-bias-reg 10.0
```

### Option 3 Lasso (SVD + Lasso) - Sparse Calibration Preset

```powershell
python -m scripts.train_and_evaluate `
  --model-type option3_lasso `
  --dataset-dir dataset/ml-latest `
  --n-factors 96 `
  --option3-reg-alpha 0.01 `
  --option3-lasso-max-iter 1200 `
  --option3-lasso-tol 0.00002 `
  --option3-bias-reg 10.0
```

### Option 4 (ALS) - Experimental Conservative Preset

Option 4 currently trails in Top-K quality, so keep this as a controlled baseline run.

```powershell
python -m scripts.train_and_evaluate `
  --model-type option4 `
  --dataset-dir dataset/ml-latest `
  --n-factors 64 `
  --epochs 20 `
  --reg 0.08 `
  --option4-bias-reg 8.0 `
  --option4-validation-split 0.10 `
  --option4-early-stopping-patience 4
```

## Fast Sanity Presets

Use these for quick health checks before launching long runs:

```powershell
python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --n-factors 64 `
  --epochs 12 `
  --batch-size 16384 `
  --option2-lr 0.0006

python -m scripts.train_and_evaluate `
  --model-type option1 `
  --dataset-dir dataset/ml-latest `
  --n-factors 64 `
  --epochs 15 `
  --lr 0.004 `
  --reg 0.035
```

## Latest Metrics Snapshot

The table below is collected from current `models/artifacts/*/metrics.json` files (`top_k=10`, `topn_relevance=all_test`).

| Model | MAE | RMSE | Precision@10 | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| option1 | 0.603478 | 0.807442 | 0.035498 | 0.030880 | 0.050153 |
| option2 | 0.594780 | 0.807467 | 0.041796 | 0.036765 | 0.056875 |
| option3_ridge | 0.666929 | 0.867087 | 0.026537 | 0.005375 | 0.030856 |
| option3_lasso | 0.671335 | 0.873965 | 0.030205 | 0.006903 | 0.035234 |
| option4 | 0.695754 | 0.943842 | 0.000305 | 0.000233 | 0.000388 |

## Evaluation Mode

Default Top-K relevance follows CS550 holdout style:

```powershell
python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --top-k 10 `
  --topn-relevance all_test
```

Threshold-based relevance:

```powershell
python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --top-k 10 `
  --topn-relevance rating_threshold `
  --min-relevant-rating 4.0
```

## Troubleshooting

- If your command appears to hang on Option 3, it may still be computing sparse SVD.
- If PowerShell reports format errors, make sure each continued line ends with a backtick `` ` ``.
- If a newly trained model is not reflected in API responses, restart the backend process.
