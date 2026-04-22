# Training Parameter Guide

Optimized for **RTX 5090 Laptop GPU (24 GB VRAM)** on the **ml-latest** dataset
(33.8M ratings, 331K users, 83K items, sparsity 99.88%, avg ~102 ratings/user).

All commands use multi-line PowerShell format.

## General Notes

- Dataset path: `dataset/ml-latest`
- Artifacts output: `models/artifacts/<model-type>/`
- Shared split cache: `models/artifacts/splits/`
- Use `--force-resplit` only when you intentionally want a new train/test split
- Install dependencies from `requirements.txt` before training

## Design Rationale

Key constraints that drive hyperparameter choices on this dataset:

1. **Overfitting risk**: avg ~82 training ratings per user (after 80/20 split + 10% val).
   A latent dimension of `k` means `k+1` free parameters per user, so `k` should stay
   well below the observation count. `k=64–96` is the practical sweet spot.
2. **GPU utilization**: 24 GB VRAM is far more than any model needs; the bottleneck is
   convergence quality, not memory. Larger batch sizes reduce wall-clock time without
   hurting gradient quality for shallow models (Option 1/4).
3. **Ranking vs. rating accuracy**: CS550 evaluates both MAE/RMSE and
   Precision/Recall/NDCG@10. Good RMSE alone does not guarantee good ranking — the
   model must separate items a user *will* enjoy from those they *won't*.

## Optimized Training Presets

### Option 1 — MF-SGD (PyTorch AdamW)

```powershell
python -m scripts.train_and_evaluate `
  --model-type option1 `
  --dataset-dir dataset/ml-latest `
  --n-factors 64 `
  --epochs 150 `
  --option1-batch-size 131072 `
  --lr 0.005 `
  --reg 0.05 `
  --lr-decay 0.99 `
  --option1-validation-split 0.10 `
  --option1-early-stopping-patience 6
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 64 | 65 params/user vs ~82 obs/user — balanced capacity without overfitting |
| `lr` | 0.005 | AdamW adaptive rates keep effective step size stable |
| `reg` | 0.05 | Stronger weight-decay helps reduce overfitting under longer training budgets |
| `lr_decay` | 0.99 | Smooth annealing over a long schedule (to ~0.001 by epoch 150) |
| `batch_size` | 131072 | ~184 steps/epoch; MF model is tiny, fully utilizes 24 GB |
| `epochs` | 150 | High upper bound with early stopping to terminate near the best validation point |
| `early_stopping_patience` | 6 | Stable default that avoids premature stopping on short plateaus |

### Option 2 — Deep Hybrid NCF (Title + Genre CNN)

```powershell
python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --n-factors 96 `
  --epochs 50 `
  --batch-size 65536 `
  --option2-lr 0.0008 `
  --title-embedding-dim 48 `
  --title-num-filters 96 `
  --option2-dropout-rate 0.18 `
  --option2-l2-reg 0.00001 `
  --option2-validation-split 0.10 `
  --option2-lr-plateau-patience 4 `
  --option2-lr-plateau-factor 0.5 `
  --option2-min-lr 0.000005 `
  --option2-early-stopping-patience 5 `
  --option2-rating-weight-power 1.25 `
  --option2-popularity-prior-count 20
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 96 | Two-tower embedding dim; nonlinear layers add capacity beyond raw dim |
| `lr` | 0.0008 | Near Adam default; plateau scheduler handles decay |
| `batch_size` | 65536 | ~370 steps/epoch; 24 GB handles CNN activations at this size |
| `dropout` | 0.18 | Stronger regularization for a deeper model |
| `l2_reg` | 1e-5 | Complements dropout; avoids large weight magnitudes |
| `title_num_filters` | 96 | 3 kernel sizes × 96 = 288 title features; rich but not excessive |
| `lr_plateau_patience` | 4 | Gives the scheduler room to reduce LR before early-stop triggers |
| `early_stopping_patience` | 5 | Ends training after sustained validation stagnation |
| `rating_weight_power` | 1.25 | Mild up-weighting of high ratings improves ranking metrics |
| `epochs` | 50 | Upper bound with validation-driven early termination |

### Option 3 Ridge — SVD + Ridge Calibration

```powershell
python -m scripts.train_and_evaluate `
  --model-type option3_ridge `
  --dataset-dir dataset/ml-latest `
  --n-factors 48 `
  --option3-reg-alpha 0.1 `
  --option3-bias-reg 10.0
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 48 | Lower rank keeps the calibration layer well-conditioned vs. user observation counts |
| `reg_alpha` | 0.1 | Ridge penalty on the calibration layer; prevents overfitting to SVD noise |
| `bias_reg` | 10.0 | Shrinkage for user/item biases: bias = Σresid / (count + 10) |

### Option 3 Lasso — SVD + Lasso Calibration

```powershell
python -m scripts.train_and_evaluate `
  --model-type option3_lasso `
  --dataset-dir dataset/ml-latest `
  --n-factors 48 `
  --option3-reg-alpha 0.1 `
  --option3-lasso-max-iter 2000 `
  --option3-lasso-tol 0.00001 `
  --option3-bias-reg 10.0
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 48 | Same SVD rank as Ridge; Lasso can zero out uninformative dimensions |
| `reg_alpha` | 0.1 | L1 penalty on the calibration head (coordinate descent) |
| `max_iter` | 2000 | Coordinate descent needs more iterations at tight tolerance |
| `tol` | 1e-5 | Tighter convergence for stable feature selection |
| `bias_reg` | 10.0 | Same as Ridge |

### Option 3 KNN — SVD + KNN-style latent scoring

```powershell
python -m scripts.train_and_evaluate `
  --model-type option3_knn `
  --dataset-dir dataset/ml-latest `
  --n-factors 48 `
  --option3-bias-reg 12.0
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 48 | Same truncated-SVD basis as other Option 3 heads |
| `bias_reg` | 12.0 | Bias shrinkage for the hybrid scorer (KNN head does not use `reg_alpha`) |

### Option 4 — MF-ALS (Numba)

```powershell
python -m scripts.train_and_evaluate `
  --model-type option4 `
  --dataset-dir dataset/ml-latest `
  --n-factors 96 `
  --epochs 40 `
  --reg 0.16 `
  --option4-bias-reg 6.0 `
  --option4-validation-split 0.10 `
  --option4-early-stopping-patience 6
```

| Parameter | Value | Reason |
|---|---|---|
| `n_factors` | 96 | MF-ALS closed-form solve is stable at this rank with float64 |
| `reg` | 0.16 | Stronger latent-factor shrinkage helps reduce train/validation divergence |
| `bias_reg` | 6.0 | Moderately stronger bias shrinkage for better generalization |
| `epochs` | 40 | Generous MF-ALS budget with early stopping as a safety valve |
| `early_stopping_patience` | 6 | Handles non-monotonic MF-ALS validation curves without stopping too early |

## Quick Sanity Presets

Fast runs (~2–5 min) for health checks before launching full training:

```powershell
python -m scripts.train_and_evaluate `
  --model-type option1 `
  --dataset-dir dataset/ml-latest `
  --n-factors 32 `
  --epochs 8 `
  --option1-batch-size 131072 `
  --lr 0.006 `
  --reg 0.02

python -m scripts.train_and_evaluate `
  --model-type option2 `
  --dataset-dir dataset/ml-latest `
  --n-factors 48 `
  --epochs 8 `
  --batch-size 65536 `
  --option2-lr 0.001

python -m scripts.train_and_evaluate `
  --model-type option4 `
  --dataset-dir dataset/ml-latest `
  --n-factors 48 `
  --epochs 10 `
  --reg 0.10 `
  --option4-bias-reg 6.0
```

## Latest Test Results

Held-out test set on **ml-latest** with the cached split (`seed` 42, `test_ratio` 0.2, `split_hash` `953d2ab2ad4a80f3396cb9261a27f38219f5532614704e44539fad6535be63aa`). Top-N metrics use **K = 10** and `--topn-relevance all_test` (same as below). Values are read from `models/artifacts/<model>/metrics.json` after the last full training run.

Active API model (see `models/artifacts/active_model.txt`): **option2**.

| Model | MAE | RMSE | P@10 | R@10 | F1 | NDCG@10 | Best epoch |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Option 1 (MF-SGD) | 0.6020 | 0.8061 | 0.0349 | 0.0284 | 0.0208 | 0.0480 | 3 |
| Option 2 (Deep Hybrid NCF) | 0.5994 | 0.8130 | 0.0545 | 0.0491 | 0.0339 | 0.0761 | 50 |
| Option 3 Ridge | 0.6286 | 0.8312 | 0.0516 | 0.0237 | 0.0209 | 0.0662 | 1 |
| Option 3 Lasso | 0.6714 | 0.8747 | 0.0152 | 0.0099 | 0.0063 | 0.0176 | 1 |
| Option 3 KNN | 0.6810 | 0.9058 | 0.0141 | 0.0190 | 0.0115 | 0.0200 | 1 |
| Option 4 (MF-ALS) | 0.7303 | 0.9786 | 0.0003 | 0.0012 | 0.0003 | 0.0008 | 6 |

## Evaluation Mode

Default Top-K relevance follows CS550 holdout protocol (all test items are relevant):

```powershell
--top-k 10 --topn-relevance all_test
```

Threshold-based relevance (only test items with rating >= 4.0 count as relevant):

```powershell
--top-k 10 --topn-relevance rating_threshold --min-relevant-rating 4.0
```

## Troubleshooting

- Option 3 may appear to hang during the sparse SVD step — this is normal at higher ranks; 48 factors is relatively fast.
- Option 4's first epoch may be slow due to Numba JIT compilation.
- If PowerShell reports format errors, ensure each continued line ends with a backtick `` ` ``.
- If a newly trained model is not reflected in API responses, restart the backend process.
