from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd


@dataclass
class Recommendation:
    item_id: int
    score: float


class Option4ALSRecommender:
    """
    Explicit-feedback matrix factorization trained with Alternating Least Squares.
    """

    def __init__(
        self,
        n_factors: int = 48,
        epochs: int = 20,
        reg: float = 0.1,
        bias_reg: float = 5.0,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = max(0, int(n_factors))
        self.epochs = max(1, int(epochs))
        self.reg = max(float(reg), 1e-8)
        self.bias_reg = max(float(bias_reg), 1e-8)
        self.seed = int(seed)
        self.min_rating = float(min_rating)
        self.max_rating = float(max_rating)

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

    def _solve_latent_with_bias(self, design: np.ndarray, target: np.ndarray) -> np.ndarray:
        if design.shape[0] == 0:
            return np.zeros(design.shape[1] + 1, dtype=np.float64)

        n_rows = design.shape[0]
        ones_col = np.ones((n_rows, 1), dtype=np.float64)
        augmented = np.concatenate([design.astype(np.float64, copy=False), ones_col], axis=1)

        n_features = augmented.shape[1]
        reg_diag = np.full(n_features, self.reg, dtype=np.float64)
        reg_diag[-1] = self.bias_reg
        system = augmented.T @ augmented + np.diag(reg_diag)
        rhs = augmented.T @ target.astype(np.float64, copy=False)

        try:
            return np.linalg.solve(system, rhs)
        except np.linalg.LinAlgError:
            return np.linalg.lstsq(system, rhs, rcond=None)[0]

    def fit(self, train_ratings: pd.DataFrame) -> "Option4ALSRecommender":
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}

        n_users = len(users)
        n_items = len(items)
        self.global_mean = float(train_ratings["rating"].mean()) if len(train_ratings) > 0 else 0.0

        self.user_bias = np.zeros(n_users, dtype=np.float32)
        self.item_bias = np.zeros(n_items, dtype=np.float32)
        self.training_history = {"train_mae": [], "train_rmse": []}

        if n_users == 0 or n_items == 0:
            self.user_factors = np.zeros((n_users, self.n_factors), dtype=np.float32)
            self.item_factors = np.zeros((n_items, self.n_factors), dtype=np.float32)
            self.normalized_item_factors = np.zeros((n_items, self.n_factors), dtype=np.float32)
            self.item_popularity_score = np.zeros(n_items, dtype=np.float32)
            self.training_history = {"train_mae": [0.0], "train_rmse": [0.0]}
            return self

        user_idx = train_ratings["user_id"].astype(int).map(self.user_to_idx).to_numpy(dtype=np.int32)
        item_idx = train_ratings["item_id"].astype(int).map(self.item_to_idx).to_numpy(dtype=np.int32)
        ratings = train_ratings["rating"].astype(float).to_numpy(dtype=np.float32)

        self.user_seen_items = {}
        for row in train_ratings.itertuples(index=False):
            uid = int(row.user_id)
            iid = int(row.item_id)
            self.user_seen_items.setdefault(uid, set()).add(iid)

        item_sum = np.zeros(n_items, dtype=np.float32)
        item_cnt = np.zeros(n_items, dtype=np.float32)
        for i_idx, rating in zip(item_idx, ratings):
            item_sum[i_idx] += rating
            item_cnt[i_idx] += 1.0
        self.item_popularity_score = np.divide(
            item_sum,
            np.maximum(item_cnt, 1.0),
            out=np.full_like(item_sum, self.global_mean, dtype=np.float32),
        )

        user_item_indices: List[List[int]] = [[] for _ in range(n_users)]
        user_item_ratings: List[List[float]] = [[] for _ in range(n_users)]
        item_user_indices: List[List[int]] = [[] for _ in range(n_items)]
        item_user_ratings: List[List[float]] = [[] for _ in range(n_items)]
        for u_idx, i_idx, rating in zip(user_idx, item_idx, ratings):
            user_item_indices[int(u_idx)].append(int(i_idx))
            user_item_ratings[int(u_idx)].append(float(rating))
            item_user_indices[int(i_idx)].append(int(u_idx))
            item_user_ratings[int(i_idx)].append(float(rating))

        user_item_indices_np = [np.asarray(v, dtype=np.int32) for v in user_item_indices]
        user_item_ratings_np = [np.asarray(v, dtype=np.float64) for v in user_item_ratings]
        item_user_indices_np = [np.asarray(v, dtype=np.int32) for v in item_user_indices]
        item_user_ratings_np = [np.asarray(v, dtype=np.float64) for v in item_user_ratings]

        rng = np.random.default_rng(self.seed)
        self.user_factors = rng.normal(0.0, 0.1, size=(n_users, self.n_factors)).astype(np.float32)
        self.item_factors = rng.normal(0.0, 0.1, size=(n_items, self.n_factors)).astype(np.float32)

        for _ in range(self.epochs):
            for u in range(n_users):
                obs_items = user_item_indices_np[u]
                if obs_items.size == 0:
                    continue
                q = self.item_factors[obs_items]
                y = user_item_ratings_np[u] - self.global_mean - self.item_bias[obs_items].astype(np.float64)
                solution = self._solve_latent_with_bias(design=q, target=y)
                if self.n_factors > 0:
                    self.user_factors[u] = solution[:-1].astype(np.float32)
                self.user_bias[u] = np.float32(solution[-1])

            for i in range(n_items):
                obs_users = item_user_indices_np[i]
                if obs_users.size == 0:
                    continue
                p = self.user_factors[obs_users]
                y = item_user_ratings_np[i] - self.global_mean - self.user_bias[obs_users].astype(np.float64)
                solution = self._solve_latent_with_bias(design=p, target=y)
                if self.n_factors > 0:
                    self.item_factors[i] = solution[:-1].astype(np.float32)
                self.item_bias[i] = np.float32(solution[-1])

            dot_scores = np.sum(self.user_factors[user_idx] * self.item_factors[item_idx], axis=1)
            preds = self.global_mean + self.user_bias[user_idx] + self.item_bias[item_idx] + dot_scores
            preds = np.clip(preds, self.min_rating, self.max_rating)
            errors = preds - ratings
            self.training_history["train_mae"].append(float(np.mean(np.abs(errors))))
            self.training_history["train_rmse"].append(float(np.sqrt(np.mean(np.square(errors)))))

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

        user_known = user_id in self.user_to_idx
        item_known = item_id in self.item_to_idx

        if user_known and item_known:
            u_idx = self.user_to_idx[user_id]
            i_idx = self.item_to_idx[item_id]
            pred = (
                self.global_mean
                + float(self.user_bias[u_idx])
                + float(self.item_bias[i_idx])
                + float(np.dot(self.user_factors[u_idx], self.item_factors[i_idx]))
            )
            return float(np.clip(pred, self.min_rating, self.max_rating))

        pred = self.global_mean
        if user_known:
            pred += float(self.user_bias[self.user_to_idx[user_id]])
        if item_known:
            pred += float(self.item_bias[self.item_to_idx[item_id]])
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
            top_count = min(max(n, 0), len(item_scores))
            if top_count <= 0:
                return []
            order = np.argsort(-item_scores)[:top_count]
            return [Recommendation(item_id=self.idx_to_item[i], score=float(item_scores[i])) for i in order]

        u_idx = self.user_to_idx[user_id]
        user_vector = self.user_factors[u_idx]
        preds = (
            self.global_mean
            + self.user_bias[u_idx]
            + self.item_bias
            + (self.item_factors @ user_vector)
        ).astype(np.float32)
        preds = np.clip(preds, self.min_rating, self.max_rating)

        if exclude_seen:
            preds = preds.copy()
            seen_items = self.user_seen_items.get(user_id, set())
            for seen_item in seen_items:
                seen_idx = self.item_to_idx.get(seen_item)
                if seen_idx is not None:
                    preds[seen_idx] = -np.inf

        if n <= 0:
            return []
        top_count = min(n, len(preds))
        if top_count <= 0:
            return []
        candidate_idx = np.argpartition(-preds, top_count - 1)[:top_count]
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
        sims = self.normalized_item_factors @ self.normalized_item_factors[idx]
        sims[idx] = -np.inf

        if n <= 0 or len(sims) <= 1:
            return []
        n = min(n, len(sims) - 1)
        candidate_idx = np.argpartition(-sims, n - 1)[:n]
        top_idx = candidate_idx[np.argsort(-sims[candidate_idx])]
        return [
            Recommendation(item_id=self.idx_to_item[int(i)], score=float(sims[i]))
            for i in top_idx
            if np.isfinite(sims[i]) and sims[i] > 0
        ]
