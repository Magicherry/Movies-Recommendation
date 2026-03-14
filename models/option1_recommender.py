from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd


@dataclass
class Recommendation:
    item_id: int
    score: float


class Option1MatrixFactorizationSGD:
    """
    Matrix Factorization recommender trained with explicit SGD updates.
    """

    def __init__(
        self,
        n_factors: int = 48,
        epochs: int = 25,
        lr: float = 0.01,
        reg: float = 0.05,
        lr_decay: float = 0.98,
        validation_split: float = 0.1,
        early_stopping_patience: int = 3,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = n_factors
        self.epochs = epochs
        self.lr = lr
        self.reg = reg
        self.lr_decay = lr_decay
        self.validation_split = validation_split
        self.early_stopping_patience = early_stopping_patience
        self.seed = seed
        self.min_rating = min_rating
        self.max_rating = max_rating
        self.global_mean: float = 0.0

        self.user_to_idx: Dict[int, int] = {}
        self.idx_to_user: Dict[int, int] = {}
        self.item_to_idx: Dict[int, int] = {}
        self.idx_to_item: Dict[int, int] = {}
        self.user_seen_items: Dict[int, set[int]] = {}

        self.user_bias: np.ndarray | None = None
        self.item_bias: np.ndarray | None = None
        self.user_factors: np.ndarray | None = None
        self.item_factors: np.ndarray | None = None
        self.normalized_item_factors: np.ndarray | None = None
        self.item_popularity_score: np.ndarray | None = None
        self.training_history: Dict[str, List[float]] = {}

    def fit(self, train_ratings: pd.DataFrame) -> "Option1MatrixFactorizationSGD":
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}
        self.global_mean = float(train_ratings["rating"].mean())
        n_users, n_items = len(users), len(items)

        self.user_bias = np.zeros(n_users, dtype=np.float32)
        self.item_bias = np.zeros(n_items, dtype=np.float32)
        self.training_history = {"train_mae": [], "train_rmse": [], "learning_rate": []}

        rng = np.random.default_rng(self.seed)
        self.user_factors = rng.normal(0.0, 0.1, size=(n_users, self.n_factors)).astype(np.float32)
        self.item_factors = rng.normal(0.0, 0.1, size=(n_items, self.n_factors)).astype(np.float32)

        user_ids = train_ratings["user_id"].astype(int).map(self.user_to_idx).to_numpy(dtype=np.int32)
        item_ids = train_ratings["item_id"].astype(int).map(self.item_to_idx).to_numpy(dtype=np.int32)
        values = train_ratings["rating"].astype(float).to_numpy(dtype=np.float32)

        self.user_seen_items = {}
        for row in train_ratings.itertuples(index=False):
            user_id = int(row.user_id)
            item_id = int(row.item_id)
            if user_id not in self.user_seen_items:
                self.user_seen_items[user_id] = set()
            self.user_seen_items[user_id].add(item_id)

        item_sum = np.zeros(n_items, dtype=np.float32)
        item_cnt = np.zeros(n_items, dtype=np.float32)
        for i_idx, rating in zip(item_ids, values):
            item_sum[i_idx] += rating
            item_cnt[i_idx] += 1.0
        self.item_popularity_score = np.divide(
            item_sum,
            np.maximum(item_cnt, 1.0),
            out=np.full_like(item_sum, self.global_mean, dtype=np.float32),
        )

        indices = np.arange(len(values), dtype=np.int32)
        rng.shuffle(indices)

        val_size = 0
        if self.validation_split > 0 and len(indices) >= 20:
            val_size = int(round(len(indices) * self.validation_split))
            val_size = min(max(val_size, 1), len(indices) - 1)

        val_indices = indices[:val_size]
        train_indices = indices[val_size:] if val_size > 0 else indices
        if val_size > 0:
            self.training_history["val_mae"] = []
            self.training_history["val_rmse"] = []

        current_lr = self.lr
        best_val_rmse = np.inf
        best_state: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None = None
        stale_epochs = 0

        for _ in range(self.epochs):
            rng.shuffle(train_indices)
            for idx in train_indices:
                u = user_ids[idx]
                i = item_ids[idx]
                r_ui = values[idx]

                pred = self.global_mean + self.user_bias[u] + self.item_bias[i] + float(
                    np.dot(self.user_factors[u], self.item_factors[i])
                )
                err = r_ui - pred

                self.user_bias[u] += current_lr * (err - self.reg * self.user_bias[u])
                self.item_bias[i] += current_lr * (err - self.reg * self.item_bias[i])

                pu = self.user_factors[u].copy()
                qi = self.item_factors[i].copy()
                self.user_factors[u] += current_lr * (err * qi - self.reg * pu)
                self.item_factors[i] += current_lr * (err * pu - self.reg * qi)

            train_preds = (
                self.global_mean
                + self.user_bias[user_ids[train_indices]]
                + self.item_bias[item_ids[train_indices]]
                + np.sum(
                    self.user_factors[user_ids[train_indices]] * self.item_factors[item_ids[train_indices]],
                    axis=1,
                )
            )
            train_errors = train_preds - values[train_indices]
            self.training_history["train_mae"].append(float(np.mean(np.abs(train_errors))))
            self.training_history["train_rmse"].append(float(np.sqrt(np.mean(np.square(train_errors)))))
            self.training_history["learning_rate"].append(float(current_lr))

            if val_size > 0:
                val_preds = (
                    self.global_mean
                    + self.user_bias[user_ids[val_indices]]
                    + self.item_bias[item_ids[val_indices]]
                    + np.sum(
                        self.user_factors[user_ids[val_indices]] * self.item_factors[item_ids[val_indices]],
                        axis=1,
                    )
                )
                val_errors = val_preds - values[val_indices]
                val_mae = float(np.mean(np.abs(val_errors)))
                val_rmse = float(np.sqrt(np.mean(np.square(val_errors))))
                self.training_history["val_mae"].append(val_mae)
                self.training_history["val_rmse"].append(val_rmse)

                if val_rmse < best_val_rmse - 1e-6:
                    best_val_rmse = val_rmse
                    stale_epochs = 0
                    best_state = (
                        self.user_bias.copy(),
                        self.item_bias.copy(),
                        self.user_factors.copy(),
                        self.item_factors.copy(),
                    )
                else:
                    stale_epochs += 1
                    if self.early_stopping_patience > 0 and stale_epochs >= self.early_stopping_patience:
                        break

            current_lr *= self.lr_decay

        if best_state is not None:
            self.user_bias, self.item_bias, self.user_factors, self.item_factors = best_state

        item_norms = np.linalg.norm(self.item_factors, axis=1, keepdims=True)
        self.normalized_item_factors = np.divide(
            self.item_factors,
            np.maximum(item_norms, 1e-12),
            out=np.zeros_like(self.item_factors),
            where=item_norms > 1e-12,
        )
        return self

    def predict(self, user_id: int, item_id: int) -> float:
        if (
            self.user_bias is None
            or self.item_bias is None
            or self.user_factors is None
            or self.item_factors is None
        ):
            raise RuntimeError("Model is not fitted.")

        pred = self.global_mean
        u_idx = self.user_to_idx.get(user_id)
        i_idx = self.item_to_idx.get(item_id)

        if u_idx is not None:
            pred += float(self.user_bias[u_idx])
        if i_idx is not None:
            pred += float(self.item_bias[i_idx])
        if u_idx is not None and i_idx is not None:
            pred += float(np.dot(self.user_factors[u_idx], self.item_factors[i_idx]))
        return float(np.clip(pred, self.min_rating, self.max_rating))

    def recommend_top_n(self, user_id: int, n: int = 10, exclude_seen: bool = True) -> List[Recommendation]:
        if (
            self.user_bias is None
            or self.item_bias is None
            or self.user_factors is None
            or self.item_factors is None
            or self.item_popularity_score is None
        ):
            raise RuntimeError("Model is not fitted.")

        if user_id not in self.user_to_idx:
            item_scores = self.item_popularity_score.copy()
            order = np.argsort(-item_scores)[:n]
            return [Recommendation(item_id=self.idx_to_item[i], score=float(item_scores[i])) for i in order]

        u_idx = self.user_to_idx[user_id]
        user_vector = self.user_factors[u_idx]  # (k,)
        preds = self.global_mean + self.user_bias[u_idx] + self.item_bias + self.item_factors @ user_vector
        preds = np.clip(preds, self.min_rating, self.max_rating).astype(np.float32)

        if exclude_seen:
            seen_item_ids = self.user_seen_items.get(user_id, set())
            preds = preds.copy()
            for item_id in seen_item_ids:
                i_idx = self.item_to_idx.get(item_id)
                if i_idx is not None:
                    preds[i_idx] = -np.inf

        if n <= 0:
            return []
        n = min(n, len(preds))
        candidate_idx = np.argpartition(-preds, n - 1)[:n]
        top_idx = candidate_idx[np.argsort(-preds[candidate_idx])]

        recs: List[Recommendation] = []
        for idx in top_idx:
            if np.isfinite(preds[idx]):
                recs.append(Recommendation(item_id=self.idx_to_item[int(idx)], score=float(preds[idx])))
        return recs

    def similar_items(self, item_id: int, n: int = 10) -> List[Recommendation]:
        if self.normalized_item_factors is None:
            raise RuntimeError("Model is not fitted.")
        if item_id not in self.item_to_idx:
            return []

        idx = self.item_to_idx[item_id]
        target = self.normalized_item_factors[idx]
        sims = self.normalized_item_factors @ target
        sims[idx] = -np.inf

        if n <= 0:
            return []
        n = min(n, len(sims) - 1)
        candidate_idx = np.argpartition(-sims, n - 1)[:n]
        top_idx = candidate_idx[np.argsort(-sims[candidate_idx])]
        return [
            Recommendation(item_id=self.idx_to_item[int(i)], score=float(sims[i]))
            for i in top_idx
            if np.isfinite(sims[i]) and sims[i] > 0
        ]


# Backward-compatible alias for previous imports.
Option1UserBasedCF = Option1MatrixFactorizationSGD
