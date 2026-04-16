"""Generate all figures for the CS550 final report from real project data."""

import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)
ARTIFACTS = os.path.join(PROJECT, "models", "artifacts")
FIGURES = os.path.join(BASE, "figures")
os.makedirs(FIGURES, exist_ok=True)

plt.rcParams.update({
    "font.family": "serif",
    "font.size": 9,
    "axes.titlesize": 10,
    "axes.labelsize": 9,
    "xtick.labelsize": 8,
    "ytick.labelsize": 8,
    "legend.fontsize": 8,
    "figure.dpi": 300,
})

COLORS = ["#2563eb", "#dc2626", "#16a34a", "#ea580c", "#7c3aed", "#0891b2"]


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Load all metrics ───────────────────────────────────────────────────
metrics = {}
for variant in ["option1", "option2", "option3_ridge", "option3_lasso", "option3_knn", "option4"]:
    p = os.path.join(ARTIFACTS, variant, "metrics.json")
    if os.path.exists(p):
        metrics[variant] = load_json(p)

hist1 = load_json(os.path.join(ARTIFACTS, "option1", "training_history.json"))
hist2 = load_json(os.path.join(ARTIFACTS, "option2", "training_history.json"))
hist4 = load_json(os.path.join(ARTIFACTS, "option4", "training_history.json"))

ratings_path = os.path.join(PROJECT, "dataset", "ml-latest", "ratings.csv")
movies_path = os.path.join(PROJECT, "dataset", "ml-latest", "movies.csv")
ratings_df = pd.read_csv(ratings_path)
movies_df = pd.read_csv(movies_path)

# ═══════════════════════════════════════════════════════════════════════
# Figure 1: Rating distribution
# ═══════════════════════════════════════════════════════════════════════
fig, ax = plt.subplots(figsize=(3.8, 2.4))
bins = sorted(ratings_df["rating"].unique())
counts = ratings_df["rating"].value_counts().sort_index()
ax.bar(counts.index, counts.values, width=0.4, color=COLORS[0], edgecolor="white", linewidth=0.5)
ax.set_xlabel("Rating")
ax.set_ylabel("Count")
ax.set_xticks([0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0])
ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}k"))
ax.set_title("Rating Distribution")
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "rating_dist.pdf"), bbox_inches="tight")
plt.close(fig)
print("  rating_dist.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 2: User activity & item popularity (log-log histograms)
# ═══════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(6.2, 2.4))
user_counts = ratings_df.groupby("userId").size()
axes[0].hist(user_counts, bins=50, color=COLORS[0], edgecolor="white", linewidth=0.3)
axes[0].set_xlabel("Ratings per User")
axes[0].set_ylabel("Number of Users")
axes[0].set_title("User Activity Distribution")
axes[0].set_yscale("log")

item_counts = ratings_df.groupby("movieId").size()
axes[1].hist(item_counts, bins=50, color=COLORS[1], edgecolor="white", linewidth=0.3)
axes[1].set_xlabel("Ratings per Movie")
axes[1].set_ylabel("Number of Movies")
axes[1].set_title("Item Popularity Distribution")
axes[1].set_yscale("log")
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "user_item_dist.pdf"), bbox_inches="tight")
plt.close(fig)
print("  user_item_dist.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 3: MF-SGD training curves (train vs validation)
# ═══════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(6.2, 2.5))
epochs_1 = list(range(1, len(hist1["train_mae"]) + 1))

axes[0].plot(epochs_1, hist1["train_mae"], color=COLORS[0], label="Train", linewidth=1.2)
axes[0].plot(epochs_1, hist1["val_mae"], color=COLORS[1], label="Validation", linewidth=1.2, linestyle="--")
axes[0].set_xlabel("Epoch")
axes[0].set_ylabel("MAE")
axes[0].set_title("MF-SGD: MAE Convergence")
axes[0].legend()

axes[1].plot(epochs_1, hist1["train_rmse"], color=COLORS[0], label="Train", linewidth=1.2)
axes[1].plot(epochs_1, hist1["val_rmse"], color=COLORS[1], label="Validation", linewidth=1.2, linestyle="--")
axes[1].set_xlabel("Epoch")
axes[1].set_ylabel("RMSE")
axes[1].set_title("MF-SGD: RMSE Convergence")
axes[1].legend()
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "training_mf_sgd.pdf"), bbox_inches="tight")
plt.close(fig)
print("  training_mf_sgd.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 4: Deep Hybrid training curves
# ═══════════════════════════════════════════════════════════════════════
fig, axes = plt.subplots(1, 2, figsize=(6.2, 2.5))
epochs_2 = list(range(1, len(hist2["train_loss"]) + 1))

axes[0].plot(epochs_2, hist2["train_loss"], color=COLORS[0], label="Train Loss", linewidth=1.2)
axes[0].plot(epochs_2, hist2["val_loss"], color=COLORS[1], label="Val Loss", linewidth=1.2, linestyle="--")
axes[0].set_xlabel("Epoch")
axes[0].set_ylabel("Huber Loss")
axes[0].set_title("Deep Hybrid: Loss Convergence")
axes[0].legend()

axes[1].plot(epochs_2, hist2["val_mae"], color=COLORS[1], label="Val MAE", linewidth=1.2)
axes[1].plot(epochs_2, hist2["val_rmse"], color=COLORS[3], label="Val RMSE", linewidth=1.2)
axes[1].set_xlabel("Epoch")
axes[1].set_ylabel("Error")
axes[1].set_title("Deep Hybrid: Validation Error")
axes[1].legend()
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "training_deep.pdf"), bbox_inches="tight")
plt.close(fig)
print("  training_deep.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 5: MF-ALS training curves (with optional validation)
# ═══════════════════════════════════════════════════════════════════════
has_val_als = "val_mae" in hist4 and len(hist4["val_mae"]) > 0
if has_val_als:
    fig, axes = plt.subplots(1, 2, figsize=(6.2, 2.5))
    epochs_4 = list(range(1, len(hist4["train_mae"]) + 1))
    axes[0].plot(epochs_4, hist4["train_mae"], color=COLORS[0], label="Train", linewidth=1.2)
    axes[0].plot(epochs_4, hist4["val_mae"], color=COLORS[1], label="Validation", linewidth=1.2, linestyle="--")
    axes[0].set_xlabel("Epoch")
    axes[0].set_ylabel("MAE")
    axes[0].set_title("MF-ALS: MAE Convergence")
    axes[0].legend()
    axes[1].plot(epochs_4, hist4["train_rmse"], color=COLORS[0], label="Train", linewidth=1.2)
    axes[1].plot(epochs_4, hist4["val_rmse"], color=COLORS[1], label="Validation", linewidth=1.2, linestyle="--")
    axes[1].set_xlabel("Epoch")
    axes[1].set_ylabel("RMSE")
    axes[1].set_title("MF-ALS: RMSE Convergence")
    axes[1].legend()
    fig.tight_layout()
else:
    fig, ax = plt.subplots(figsize=(3.8, 2.4))
    epochs_4 = list(range(1, len(hist4["train_mae"]) + 1))
    ax.plot(epochs_4, hist4["train_mae"], color=COLORS[0], label="Train MAE", linewidth=1.2)
    ax.plot(epochs_4, hist4["train_rmse"], color=COLORS[1], label="Train RMSE", linewidth=1.2)
    ax.set_xlabel("Epoch")
    ax.set_ylabel("Error")
    ax.set_title("MF-ALS: Training Convergence")
    ax.legend()
    fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "training_als.pdf"), bbox_inches="tight")
plt.close(fig)
print("  training_als.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 6: Model comparison – Rating Prediction (MAE + RMSE)
# ═══════════════════════════════════════════════════════════════════════
all_model_names = ["MF-SGD", "Deep Hybrid", "SVD-Ridge", "SVD-Lasso", "SVD-KNN", "MF-ALS"]
all_model_keys  = ["option1", "option2", "option3_ridge", "option3_lasso", "option3_knn", "option4"]
# Keep only models for which metrics.json was loaded
model_names = [n for n, k in zip(all_model_names, all_model_keys) if k in metrics]
model_keys  = [k for k in all_model_keys if k in metrics]

mae_vals = [metrics[k]["mae"] for k in model_keys]
rmse_vals = [metrics[k]["rmse"] for k in model_keys]

x = np.arange(len(model_names))
width = 0.35
fig, ax = plt.subplots(figsize=(5.8, 2.8))
bars1 = ax.bar(x - width/2, mae_vals, width, label="MAE", color=COLORS[0], edgecolor="white")
bars2 = ax.bar(x + width/2, rmse_vals, width, label="RMSE", color=COLORS[1], edgecolor="white")
ax.set_ylabel("Error")
ax.set_title("Rating Prediction Performance")
ax.set_xticks(x)
ax.set_xticklabels(model_names, rotation=20, ha="right")
ax.legend()
ax.set_ylim(0, 1.4)
for bars in [bars1, bars2]:
    for bar in bars:
        h = bar.get_height()
        ax.annotate(f"{h:.3f}", xy=(bar.get_x() + bar.get_width()/2, h),
                    xytext=(0, 2), textcoords="offset points", ha="center", va="bottom", fontsize=6.0)
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "model_comparison_rating.pdf"), bbox_inches="tight")
plt.close(fig)
print("  model_comparison_rating.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 7: Model comparison – Top-N Recommendation
# ═══════════════════════════════════════════════════════════════════════
prec_vals = [metrics[k]["precision"] for k in model_keys]
rec_vals = [metrics[k]["recall"] for k in model_keys]
f1_vals = [metrics[k]["f_measure"] for k in model_keys]
ndcg_vals = [metrics[k]["ndcg"] for k in model_keys]

fig, axes = plt.subplots(1, 2, figsize=(6.8, 2.8))
width = 0.35
axes[0].bar(x - width/2, prec_vals, width, label="Precision@10", color=COLORS[2])
axes[0].bar(x + width/2, rec_vals, width, label="Recall@10", color=COLORS[3])
axes[0].set_ylabel("Score")
axes[0].set_title("Precision & Recall @10")
axes[0].set_xticks(x)
axes[0].set_xticklabels(model_names, rotation=25, ha="right", fontsize=7)
axes[0].legend(fontsize=7)

axes[1].bar(x - width/2, f1_vals, width, label="F1@10", color=COLORS[4])
axes[1].bar(x + width/2, ndcg_vals, width, label="NDCG@10", color=COLORS[5])
axes[1].set_ylabel("Score")
axes[1].set_title("F1 & NDCG @10")
axes[1].set_xticks(x)
axes[1].set_xticklabels(model_names, rotation=25, ha="right", fontsize=7)
axes[1].legend(fontsize=7)
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "model_comparison_topn.pdf"), bbox_inches="tight")
plt.close(fig)
print("  model_comparison_topn.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Figure 8: Genre distribution (top 10)
# ═══════════════════════════════════════════════════════════════════════
genre_counts = {}
for genres in movies_df["genres"].dropna():
    for g in str(genres).split("|"):
        g = g.strip()
        if g and g != "(no genres listed)":
            genre_counts[g] = genre_counts.get(g, 0) + 1
sorted_genres = sorted(genre_counts.items(), key=lambda kv: -kv[1])[:12]
genre_names = [g for g, _ in sorted_genres]
genre_vals = [c for _, c in sorted_genres]

fig, ax = plt.subplots(figsize=(4.5, 2.6))
ax.barh(range(len(genre_names)), genre_vals, color=COLORS[0], edgecolor="white", linewidth=0.3)
ax.set_yticks(range(len(genre_names)))
ax.set_yticklabels(genre_names, fontsize=7)
ax.invert_yaxis()
ax.set_xlabel("Number of Movies")
ax.set_title("Genre Distribution (Top 12)")
fig.tight_layout()
fig.savefig(os.path.join(FIGURES, "genre_dist.pdf"), bbox_inches="tight")
plt.close(fig)
print("  genre_dist.pdf")

# ═══════════════════════════════════════════════════════════════════════
# Print dataset statistics for LaTeX tables
# ═══════════════════════════════════════════════════════════════════════
print("\n=== Dataset Statistics ===")
n_users = ratings_df["userId"].nunique()
n_items = ratings_df["movieId"].nunique()
n_ratings = len(ratings_df)
sparsity = 1 - n_ratings / (n_users * n_items)
print(f"Users: {n_users}")
print(f"Items: {n_items}")
print(f"Ratings: {n_ratings}")
print(f"Sparsity: {sparsity:.4f}")
print(f"Mean rating: {ratings_df['rating'].mean():.4f}")
print(f"Std rating: {ratings_df['rating'].std():.4f}")
print(f"Median ratings per user: {ratings_df.groupby('userId').size().median():.1f}")
print(f"Median ratings per item: {ratings_df.groupby('movieId').size().median():.1f}")
n_genres = len(genre_counts)
print(f"Unique genres: {n_genres}")

print("\nAll figures generated successfully.")
