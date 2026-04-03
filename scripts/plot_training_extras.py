"""
Extra training / evaluation plots from existing artifacts:
  - Per model: PNGs under models/artifacts/<option>/figures/ (from training_history.csv and test predictions).
  - Summary (from metrics.json): radar + MAE vs NDCG scatter in FinalReport/figures/ (cross-model).

Usage:
  python scripts/plot_training_extras.py
  python scripts/plot_training_extras.py --no-test
  python scripts/plot_training_extras.py --test-sample 10000
"""

from __future__ import annotations

import argparse
import json
import math
import pickle
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS = BASE_DIR / "models" / "artifacts"
FIGURES = BASE_DIR / "FinalReport" / "figures"

plt.rcParams.update(
    {
        "font.family": "serif",
        "font.size": 9,
        "axes.titlesize": 10,
        "axes.labelsize": 9,
        "figure.dpi": 300,
    }
)
COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed"]


def _epochs(df: pd.DataFrame) -> np.ndarray:
    if "epoch" in df.columns:
        return df["epoch"].to_numpy()
    return np.arange(1, len(df) + 1)


def _resolve_train_mae_rmse(df: pd.DataFrame) -> tuple[np.ndarray | None, np.ndarray | None]:
    if "train_mae" in df.columns and "train_rmse" in df.columns:
        return df["train_mae"].to_numpy(float), df["train_rmse"].to_numpy(float)
    if "mae" in df.columns and "rmse" in df.columns:
        return df["mae"].to_numpy(float), df["rmse"].to_numpy(float)
    return None, None


def plot_lr_schedule(option_name: str, df: pd.DataFrame, out_dir: Path) -> None:
    col = None
    if "learning_rate" in df.columns:
        col = "learning_rate"
    elif "lr" in df.columns:
        col = "lr"
    if col is None:
        return
    y = pd.to_numeric(df[col], errors="coerce")
    if y.notna().sum() < 2:
        return
    epochs = _epochs(df)
    fig, ax = plt.subplots(figsize=(5, 2.8))
    ax.plot(epochs, y, color=COLORS[0], marker="o", linewidth=1.2, markersize=3)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Learning rate")
    ax.set_title(f"{option_name}: learning rate schedule")
    ax.grid(True, linestyle=":", alpha=0.6)
    fig.tight_layout()
    fig.savefig(out_dir / "training_lr_schedule.png", bbox_inches="tight")
    plt.close(fig)


def plot_loss_curves(option_name: str, df: pd.DataFrame, out_dir: Path) -> None:
    if "loss" not in df.columns or "val_loss" not in df.columns:
        return
    loss = pd.to_numeric(df["loss"], errors="coerce")
    val_loss = pd.to_numeric(df["val_loss"], errors="coerce")
    if loss.notna().sum() < 1:
        return
    epochs = _epochs(df)
    fig, ax = plt.subplots(figsize=(5, 2.8))
    ax.plot(epochs, loss, color=COLORS[0], label="Train loss", linewidth=1.2, marker="o", markersize=3)
    ax.plot(epochs, val_loss, color=COLORS[1], label="Val loss", linewidth=1.2, linestyle="--", marker="o", markersize=3)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Loss")
    ax.set_title(f"{option_name}: training vs validation loss")
    ax.legend()
    ax.grid(True, linestyle=":", alpha=0.6)
    fig.tight_layout()
    fig.savefig(out_dir / "training_loss_curves.png", bbox_inches="tight")
    plt.close(fig)


def plot_generalization_gap(option_name: str, df: pd.DataFrame, out_dir: Path) -> None:
    t_mae, t_rmse = _resolve_train_mae_rmse(df)
    if t_mae is None or "val_mae" not in df.columns:
        return
    v_mae = pd.to_numeric(df["val_mae"], errors="coerce").to_numpy(float)
    epochs = _epochs(df)
    fig, axes = plt.subplots(1, 2, figsize=(7.5, 2.8))
    gap_mae = v_mae - t_mae[: len(v_mae)]
    axes[0].plot(epochs[: len(gap_mae)], gap_mae, color=COLORS[2], marker="o", linewidth=1.2, markersize=3)
    axes[0].axhline(0, color="#64748b", linewidth=0.8, linestyle="--")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("Val MAE − Train MAE")
    axes[0].set_title("Generalization gap (MAE)")
    axes[0].grid(True, linestyle=":", alpha=0.6)

    if t_rmse is not None and "val_rmse" in df.columns:
        v_rmse = pd.to_numeric(df["val_rmse"], errors="coerce").to_numpy(float)
        gap_rmse = v_rmse - t_rmse[: len(v_rmse)]
        axes[1].plot(epochs[: len(gap_rmse)], gap_rmse, color=COLORS[3], marker="o", linewidth=1.2, markersize=3)
        axes[1].axhline(0, color="#64748b", linewidth=0.8, linestyle="--")
        axes[1].set_xlabel("Epoch")
        axes[1].set_ylabel("Val RMSE − Train RMSE")
        axes[1].set_title("Generalization gap (RMSE)")
        axes[1].grid(True, linestyle=":", alpha=0.6)
    else:
        axes[1].set_visible(False)

    fig.suptitle(f"{option_name}: train–validation error gap (>0 → validation worse)", y=1.02, fontsize=9)
    fig.tight_layout()
    fig.savefig(out_dir / "training_generalization_gap.png", bbox_inches="tight")
    plt.close(fig)


def plot_rmse_mae_ratio(option_name: str, df: pd.DataFrame, out_dir: Path) -> None:
    t_mae, t_rmse = _resolve_train_mae_rmse(df)
    if t_mae is None or t_rmse is None:
        return
    eps = 1e-9
    ratio_t = t_rmse / np.maximum(t_mae, eps)
    epochs = _epochs(df)
    fig, ax = plt.subplots(figsize=(5, 2.8))
    ax.plot(epochs, ratio_t, color=COLORS[0], label="Train RMSE / MAE", linewidth=1.2, marker="o", markersize=3)
    if "val_mae" in df.columns and "val_rmse" in df.columns:
        v_mae = pd.to_numeric(df["val_mae"], errors="coerce").to_numpy(float)
        v_rmse = pd.to_numeric(df["val_rmse"], errors="coerce").to_numpy(float)
        n = min(len(v_mae), len(v_rmse), len(epochs))
        ratio_v = v_rmse[:n] / np.maximum(v_mae[:n], eps)
        ax.plot(epochs[:n], ratio_v, color=COLORS[1], label="Val RMSE / MAE", linewidth=1.2, linestyle="--", marker="o", markersize=3)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("RMSE / MAE")
    ax.set_title(f"{option_name}: RMSE–MAE ratio (shape of error distribution)")
    ax.legend()
    ax.grid(True, linestyle=":", alpha=0.6)
    fig.tight_layout()
    fig.savefig(out_dir / "training_rmse_mae_ratio.png", bbox_inches="tight")
    plt.close(fig)


def option_figures_dir(option_name: str) -> Path:
    d = ARTIFACTS / option_name / "figures"
    d.mkdir(parents=True, exist_ok=True)
    return d


def plot_extras_for_option(option_name: str) -> None:
    csv_path = ARTIFACTS / option_name / "training_history.csv"
    if not csv_path.exists():
        return
    df = pd.read_csv(csv_path)
    out_dir = option_figures_dir(option_name)
    plot_lr_schedule(option_name, df, out_dir)
    plot_loss_curves(option_name, df, out_dir)
    plot_generalization_gap(option_name, df, out_dir)
    plot_rmse_mae_ratio(option_name, df, out_dir)


def plot_all_history_extras() -> None:
    for p in sorted(ARTIFACTS.iterdir()):
        if p.is_dir() and (p / "training_history.csv").exists():
            plot_extras_for_option(p.name)


def plot_metrics_summary() -> None:
    model_keys = ["option1", "option2", "option3_ridge", "option3_lasso", "option4"]
    labels = ["MF-SGD", "Deep Hybrid", "SVD-Ridge", "SVD-Lasso", "MF-ALS"]
    loaded: list[dict | None] = []
    for k in model_keys:
        path = ARTIFACTS / k / "metrics.json"
        if path.exists():
            with open(path, encoding="utf-8") as f:
                loaded.append(json.load(f))
        else:
            loaded.append(None)
    if not any(loaded):
        print("No metrics.json found; skip summary plots.")
        return

    FIGURES.mkdir(parents=True, exist_ok=True)

    xs, ys, names = [], [], []
    for label, m in zip(labels, loaded):
        if m is None:
            continue
        xs.append(m["mae"])
        ys.append(m["ndcg"])
        names.append(label)

    if len(xs) >= 2:
        fig, ax = plt.subplots(figsize=(4.2, 3.2))
        ax.scatter(xs, ys, c=COLORS[: len(xs)], s=42, edgecolors="white", linewidths=0.6, zorder=3)
        for x, y, n in zip(xs, ys, names):
            ax.annotate(n, (x, y), textcoords="offset points", xytext=(4, 4), fontsize=7)
        ax.set_xlabel("Test MAE (lower is better)")
        ax.set_ylabel("NDCG@10 (higher is better)")
        ax.set_title("Rating error vs ranking quality")
        ax.grid(True, linestyle=":", alpha=0.6)
        fig.tight_layout()
        fig.savefig(FIGURES / "metrics_scatter_mae_ndcg.pdf", bbox_inches="tight")
        plt.close(fig)
        print(f"  {FIGURES / 'metrics_scatter_mae_ndcg.pdf'}")

    axis_keys = [
        ("MAE", "mae", "lower"),
        ("RMSE", "rmse", "lower"),
        ("Precision@10", "precision", "higher"),
        ("Recall@10", "recall", "higher"),
        ("NDCG@10", "ndcg", "higher"),
    ]
    series: list[tuple[str, list[float]]] = []
    for label, m in zip(labels, loaded):
        if m is None:
            continue
        vals = [float(m[k]) for _, k, _ in axis_keys]
        series.append((label, vals))

    if len(series) < 2:
        return

    fig, ax = plt.subplots(figsize=(4.8, 4.8), subplot_kw={"projection": "polar"})
    n_axes = len(axis_keys)
    angles = np.linspace(0, 2 * math.pi, n_axes, endpoint=False).tolist()
    angles_closed = angles + angles[:1]

    for si, (name, vals) in enumerate(series):
        scores = []
        for j, (_, _key, direction) in enumerate(axis_keys):
            col = [float(s[1][j]) for s in series]
            lo, hi = min(col), max(col)
            span = hi - lo if hi - lo > 1e-12 else 1.0
            if direction == "lower":
                scores.append((hi - vals[j]) / span)
            else:
                scores.append((vals[j] - lo) / span)
        scores_closed = scores + scores[:1]
        ax.plot(angles_closed, scores_closed, "o-", linewidth=1.0, label=name, color=COLORS[si % len(COLORS)])
        ax.fill(angles_closed, scores_closed, alpha=0.08, color=COLORS[si % len(COLORS)])

    ax.set_xticks(angles)
    ax.set_xticklabels([a[0] for a in axis_keys], fontsize=7)
    ax.set_ylim(0, 1)
    ax.set_title("Model comparison (normalized per metric)", y=1.08, fontsize=10)
    ax.legend(loc="upper right", bbox_to_anchor=(1.25, 1.05), fontsize=7)
    fig.tight_layout()
    fig.savefig(FIGURES / "metrics_radar.pdf", bbox_inches="tight")
    plt.close(fig)
    print(f"  {FIGURES / 'metrics_radar.pdf'}")


def _mf_like_batch_predict(model, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
    """Matches MF-style predict() with cold-start fallbacks (option1 / option4)."""
    u_idx = np.array([model.user_to_idx.get(int(u), -1) for u in user_ids], dtype=np.int32)
    i_idx = np.array([model.item_to_idx.get(int(i), -1) for i in item_ids], dtype=np.int32)
    n = len(user_ids)
    pred = np.full(n, model.global_mean, dtype=np.float64)
    mu = u_idx >= 0
    mi = i_idx >= 0
    pred[mu] += model.user_bias[u_idx[mu]]
    pred[mi] += model.item_bias[i_idx[mi]]
    both = mu & mi
    pred[both] += np.sum(model.user_factors[u_idx[both]] * model.item_factors[i_idx[both]], axis=1)
    return np.clip(pred, model.min_rating, model.max_rating)


def _option2_batch_predict(model, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
    u_idx = np.array([model.user_to_idx.get(int(u), -1) for u in user_ids], dtype=np.int32)
    i_idx = np.array([model.item_to_idx.get(int(i), -1) for i in item_ids], dtype=np.int32)
    n = len(user_ids)
    pred = np.full(n, model.global_mean, dtype=np.float64)
    mu = u_idx >= 0
    mi = i_idx >= 0
    pred[mu] += model.user_bias[u_idx[mu]]
    pred[mi] += model.item_bias[i_idx[mi]]
    both = mu & mi
    pred[both] += np.sum(model.user_vectors[u_idx[both]] * model.item_vectors[i_idx[both]], axis=1)
    return np.clip(pred, model.min_rating, model.max_rating)


def _option3_batch_predict(model, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
    u_idx = np.array([model.user_to_idx.get(int(u), -1) for u in user_ids], dtype=np.int32)
    i_idx = np.array([model.item_to_idx.get(int(i), -1) for i in item_ids], dtype=np.int32)
    n = len(user_ids)
    pred = np.full(n, model.global_mean, dtype=np.float64)
    both = (u_idx >= 0) & (i_idx >= 0)
    if both.any():
        pred[both] = model._predict_known_pairs(u_idx[both], i_idx[both]).astype(np.float64)
    only_u = (u_idx >= 0) & (i_idx < 0)
    pred[only_u] = model.global_mean + model.user_bias[u_idx[only_u]]
    only_i = (u_idx < 0) & (i_idx >= 0)
    pred[only_i] = model.global_mean + model.item_bias[i_idx[only_i]]
    return np.clip(pred, model.min_rating, model.max_rating)


def batch_predict(model, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
    cn = model.__class__.__name__
    if cn == "Option2DeepRecommender":
        return _option2_batch_predict(model, user_ids, item_ids)
    if cn == "Option3SVDHybridRecommender":
        return _option3_batch_predict(model, user_ids, item_ids)
    return _mf_like_batch_predict(model, user_ids, item_ids)


def plot_test_diagnostics(option_name: str, sample_size: int, seed: int = 42) -> None:
    pkl_path = ARTIFACTS / option_name / "model.pkl"
    test_path = ARTIFACTS / option_name / "test_ratings.csv"
    if not pkl_path.exists() or not test_path.exists():
        return
    out_dir = option_figures_dir(option_name)
    test_df = pd.read_csv(test_path)
    if len(test_df) == 0:
        return
    n = min(sample_size, len(test_df))
    sample = test_df.sample(n=n, random_state=seed)
    rng = np.random.default_rng(seed)

    try:
        with open(pkl_path, "rb") as f:
            model = pickle.load(f)
    except ModuleNotFoundError as e:
        print(f"  skip {option_name} test plots (missing dependency: {e.name})")
        return

    u = sample["user_id"].to_numpy(dtype=np.int64)
    i = sample["item_id"].to_numpy(dtype=np.int64)
    y = sample["rating"].to_numpy(dtype=np.float64)
    try:
        pred = batch_predict(model, u, i)
    except Exception as e:
        print(f"  skip {option_name} test plots (prediction failed: {e})")
        return
    resid = pred - y

    fig, ax = plt.subplots(figsize=(4.5, 2.8))
    ax.hist(resid, bins=40, color=COLORS[0], edgecolor="white", alpha=0.85)
    ax.axvline(0, color=COLORS[1], linewidth=1)
    ax.set_xlabel("Prediction error (pred − true)")
    ax.set_ylabel("Count")
    ax.set_title(f"{option_name}: residual distribution (n={n})")
    fig.tight_layout()
    fig.savefig(out_dir / "test_residual_hist.png", bbox_inches="tight")
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(3.8, 3.8))
    idx = rng.choice(n, size=min(2500, n), replace=False)
    ax.scatter(y[idx], pred[idx], s=4, alpha=0.25, c=COLORS[0], edgecolors="none")
    lo = float(min(y.min(), pred.min()))
    hi = float(max(y.max(), pred.max()))
    ax.plot([lo, hi], [lo, hi], color=COLORS[1], linewidth=1, linestyle="--", label="Ideal")
    ax.set_xlabel("True rating")
    ax.set_ylabel("Predicted rating")
    ax.set_title(f"{option_name}: predicted vs actual")
    ax.legend(loc="upper left", fontsize=7)
    ax.set_aspect("equal", adjustable="box")
    fig.tight_layout()
    fig.savefig(out_dir / "test_pred_vs_actual.png", bbox_inches="tight")
    plt.close(fig)

    bins = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5]
    labels_r = ["1", "2", "3", "4", "5"]
    bucket = pd.cut(y, bins=bins, labels=labels_r)
    mae_by = sample.assign(_b=bucket, _e=np.abs(resid)).groupby("_b", observed=False)["_e"].mean()

    fig, ax = plt.subplots(figsize=(4.5, 2.8))
    x = np.arange(len(mae_by))
    ax.bar(x, mae_by.values, color=COLORS[2], edgecolor="white")
    ax.set_xticks(x)
    ax.set_xticklabels(list(mae_by.index))
    ax.set_xlabel("True rating (bucket)")
    ax.set_ylabel("Mean absolute error")
    ax.set_title(f"{option_name}: MAE by true rating")
    fig.tight_layout()
    fig.savefig(out_dir / "test_mae_by_rating.png", bbox_inches="tight")
    plt.close(fig)

    print(f"  test diagnostics → {out_dir}")


def plot_all_test_diagnostics(sample_size: int) -> None:
    for p in sorted(ARTIFACTS.iterdir()):
        if p.is_dir() and (p / "model.pkl").exists() and (p / "test_ratings.csv").exists():
            plot_test_diagnostics(p.name, sample_size=sample_size)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extra plots from training metrics and test predictions.")
    parser.add_argument("--no-test", action="store_true", help="Skip model.pkl test-set figures.")
    parser.add_argument("--test-sample", type=int, default=25000, help="Rows sampled from test_ratings.csv per model.")
    args = parser.parse_args()

    if str(BASE_DIR) not in sys.path:
        sys.path.insert(0, str(BASE_DIR))

    print("History extras (per model)…")
    plot_all_history_extras()
    for p in sorted(ARTIFACTS.iterdir()):
        if p.is_dir() and (p / "training_history.csv").exists():
            print(f"  {p.name}/figures: lr / loss / gap / ratio (where applicable)")

    print("Metrics summary…")
    plot_metrics_summary()

    if not args.no_test:
        print(f"Test-set diagnostics (sample {args.test_sample})…")
        plot_all_test_diagnostics(sample_size=args.test_sample)

    print("Done.")


if __name__ == "__main__":
    main()
