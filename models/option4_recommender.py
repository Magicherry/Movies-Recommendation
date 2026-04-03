from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numba
import numpy as np
import pandas as pd
from tqdm import tqdm


@dataclass
class Recommendation:
    item_id: int
    score: float


@numba.njit(cache=True)
def _als_update_numba(
    n_entities: int,
    indptr: np.ndarray,
    indices: np.ndarray,
    data: np.ndarray,
    global_mean: float,
    context_factors: np.ndarray,
    context_bias: np.ndarray,
    target_factors: np.ndarray,
    target_bias: np.ndarray,
    reg: float,
    bias_reg: float,
    n_factors: int,
) -> None:
    for e in range(n_entities):
        start = indptr[e]
        end = indptr[e + 1]
        if start >= end:
            continue

        n_obs = end - start
        obs_idx = indices[start:end]

        if n_factors <= 0:
            residual_sum = 0.0
            for i in range(n_obs):
                ctx = obs_idx[i]
                residual_sum += float(data[start + i]) - global_mean - float(context_bias[ctx])
            target_bias[e] = np.float32(residual_sum / (float(n_obs) + bias_reg))
            continue

        design = np.empty((n_obs, n_factors + 1), dtype=np.float64)
        target = np.empty(n_obs, dtype=np.float64)
        for i in range(n_obs):
            ctx = obs_idx[i]
            target[i] = float(data[start + i]) - global_mean - float(context_bias[ctx])
            for k in range(n_factors):
                design[i, k] = float(context_factors[ctx, k])
            design[i, n_factors] = 1.0

        system = np.dot(design.T, design)
        for k in range(n_factors):
            system[k, k] += reg
        system[n_factors, n_factors] += bias_reg
        rhs = np.dot(design.T, target)
        solution = np.linalg.solve(system, rhs)

        for k in range(n_factors):
            target_factors[e, k] = np.float32(solution[k])
        target_bias[e] = np.float32(solution[n_factors])


def _build_csr_from_pairs(
    n_rows: int,
    row_idx: np.ndarray,
    col_idx: np.ndarray,
    values: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if n_rows <= 0 or row_idx.size == 0:
        return (
            np.zeros(n_rows + 1, dtype=np.int32),
            np.zeros(0, dtype=np.int32),
            np.zeros(0, dtype=np.float32),
        )

    counts = np.bincount(row_idx, minlength=n_rows).astype(np.int32, copy=False)
    indptr = np.empty(n_rows + 1, dtype=np.int32)
    indptr[0] = 0
    np.cumsum(counts, out=indptr[1:])

    order = np.argsort(row_idx, kind="stable")
    return (
        indptr,
        col_idx[order].astype(np.int32, copy=True),
        values[order].astype(np.float32, copy=True),
    )


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
        validation_split: float = 0.1,
        early_stopping_patience: int = 6,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = max(0, int(n_factors))
        self.epochs = max(1, int(epochs))
        self.reg = max(float(reg), 1e-8)
        self.bias_reg = max(float(bias_reg), 1e-8)
        self.validation_split = float(validation_split)
        self.early_stopping_patience = int(early_stopping_patience)
        self.seed = int(seed)
        self.min_rating = float(min_rating)
        self.max_rating = float(max_rating)

        self.global_mean: float = 0.0
        self.user_to_idx: Dict[int, int] = {}
        self.idx_to_user: Dict[int, int] = {}
        self.item_to_idx: Dict[int, int] = {}
        self.idx_to_item: Dict[int, int] = {}
        self.user_seen_items: Dict[int, set[int]] = {}
        self.user_seen_item_indices: Dict[int, np.ndarray] = {}

        self.user_bias: np.ndarray | None = None
        self.item_bias: np.ndarray | None = None
        self.user_factors: np.ndarray | None = None
        self.item_factors: np.ndarray | None = None
        self.normalized_item_factors: np.ndarray | None = None
        self.item_popularity_score: np.ndarray | None = None
        self.item_base_scores: np.ndarray | None = None
        self.popular_item_order: np.ndarray | None = None
        self.training_history: Dict[str, List[float]] = {}

    def _refresh_inference_caches(self) -> None:
        if self.item_bias is None:
            self.item_base_scores = None
            return
        self.item_base_scores = (self.global_mean + self.item_bias).astype(np.float32, copy=False)

    def fit(self, train_ratings: pd.DataFrame) -> "Option4ALSRecommender":
        print("[Option4] Initializing MF-ALS training pipeline...")
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}

        n_users = len(users)
        n_items = len(items)
        self.global_mean = float(train_ratings["rating"].mean()) if len(train_ratings) > 0 else 0.0
        print(
            f"[Option4] Loaded {len(train_ratings):,} ratings "
            f"({n_users:,} users, {n_items:,} items)."
        )

        self.user_bias = np.zeros(n_users, dtype=np.float32)
        self.item_bias = np.zeros(n_items, dtype=np.float32)
        self.training_history = {"train_mae": [], "train_rmse": []}

        if n_users == 0 or n_items == 0:
            self.user_factors = np.zeros((n_users, self.n_factors), dtype=np.float32)
            self.item_factors = np.zeros((n_items, self.n_factors), dtype=np.float32)
            self.normalized_item_factors = np.zeros((n_items, self.n_factors), dtype=np.float32)
            self.item_popularity_score = np.zeros(n_items, dtype=np.float32)
            self.item_base_scores = np.full(n_items, self.global_mean, dtype=np.float32)
            self.popular_item_order = np.arange(n_items, dtype=np.int32)
            self.user_seen_item_indices = {}
            self.training_history = {"train_mae": [0.0], "train_rmse": [0.0]}
            return self

        all_user_idx = train_ratings["user_id"].astype(int).map(self.user_to_idx).to_numpy(dtype=np.int32)
        all_item_idx = train_ratings["item_id"].astype(int).map(self.item_to_idx).to_numpy(dtype=np.int32)
        all_ratings = train_ratings["rating"].astype(float).to_numpy(dtype=np.float32)

        seen_idx_per_user: List[set[int]] = [set() for _ in range(n_users)]
        for u_idx_val, i_idx_val in zip(all_user_idx, all_item_idx):
            seen_idx_per_user[int(u_idx_val)].add(int(i_idx_val))
        self.user_seen_items = {}
        self.user_seen_item_indices = {}
        for u_idx_val, item_idx_set in enumerate(seen_idx_per_user):
            if not item_idx_set:
                continue
            user_id = users[u_idx_val]
            seen_item_indices = np.fromiter(item_idx_set, dtype=np.int32, count=len(item_idx_set))
            self.user_seen_item_indices[user_id] = seen_item_indices
            self.user_seen_items[user_id] = {items[int(i)] for i in seen_item_indices}

        item_sum = np.bincount(all_item_idx, weights=all_ratings, minlength=n_items).astype(np.float32)
        item_cnt = np.bincount(all_item_idx, minlength=n_items).astype(np.float32)
        self.item_popularity_score = np.divide(
            item_sum,
            np.maximum(item_cnt, 1.0),
            out=np.full_like(item_sum, self.global_mean, dtype=np.float32),
        )
        self.popular_item_order = np.argsort(-self.item_popularity_score)

        rng = np.random.default_rng(self.seed)
        indices = np.arange(len(all_ratings), dtype=np.int32)
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

        user_idx = all_user_idx[train_indices]
        item_idx = all_item_idx[train_indices]
        ratings = all_ratings[train_indices]
        print("[Option4] Building sparse interaction indices...")
        user_indptr, user_indices, user_data = _build_csr_from_pairs(
            n_rows=n_users,
            row_idx=user_idx,
            col_idx=item_idx,
            values=ratings,
        )
        item_indptr, item_indices, item_data = _build_csr_from_pairs(
            n_rows=n_items,
            row_idx=item_idx,
            col_idx=user_idx,
            values=ratings,
        )

        self.user_factors = rng.normal(0.0, 0.1, size=(n_users, self.n_factors)).astype(np.float32)
        self.item_factors = rng.normal(0.0, 0.1, size=(n_items, self.n_factors)).astype(np.float32)

        best_val_rmse = np.inf
        best_state: tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None = None
        stale_epochs = 0
        v_u = all_user_idx[val_indices] if val_size > 0 else None
        v_i = all_item_idx[val_indices] if val_size > 0 else None
        v_r = all_ratings[val_indices] if val_size > 0 else None

        print("[Option4] Running JIT-accelerated MF-ALS updates (first epoch may compile kernels)...")
        epoch_progress = tqdm(range(self.epochs), desc="Option4 MF-ALS", unit="epoch")
        for epoch_idx in epoch_progress:
            _als_update_numba(
                n_entities=n_users,
                indptr=user_indptr,
                indices=user_indices,
                data=user_data,
                global_mean=float(self.global_mean),
                context_factors=self.item_factors,
                context_bias=self.item_bias,
                target_factors=self.user_factors,
                target_bias=self.user_bias,
                reg=float(self.reg),
                bias_reg=float(self.bias_reg),
                n_factors=int(self.n_factors),
            )
            _als_update_numba(
                n_entities=n_items,
                indptr=item_indptr,
                indices=item_indices,
                data=item_data,
                global_mean=float(self.global_mean),
                context_factors=self.user_factors,
                context_bias=self.user_bias,
                target_factors=self.item_factors,
                target_bias=self.item_bias,
                reg=float(self.reg),
                bias_reg=float(self.bias_reg),
                n_factors=int(self.n_factors),
            )

            dot_scores = np.sum(self.user_factors[user_idx] * self.item_factors[item_idx], axis=1)
            preds = self.global_mean + self.user_bias[user_idx] + self.item_bias[item_idx] + dot_scores
            preds = np.clip(preds, self.min_rating, self.max_rating)
            errors = preds - ratings
            train_mae = float(np.mean(np.abs(errors)))
            train_rmse = float(np.sqrt(np.mean(np.square(errors))))
            self.training_history["train_mae"].append(train_mae)
            self.training_history["train_rmse"].append(train_rmse)
            progress_stats: Dict[str, float] = {"train_rmse": train_rmse, "train_mae": train_mae}

            if val_size > 0:
                assert v_u is not None and v_i is not None and v_r is not None
                v_dot = np.sum(self.user_factors[v_u] * self.item_factors[v_i], axis=1)
                v_preds = self.global_mean + self.user_bias[v_u] + self.item_bias[v_i] + v_dot
                v_preds = np.clip(v_preds, self.min_rating, self.max_rating)
                v_errors = v_preds - v_r
                val_mae = float(np.mean(np.abs(v_errors)))
                val_rmse = float(np.sqrt(np.mean(np.square(v_errors))))
                self.training_history["val_mae"].append(val_mae)
                self.training_history["val_rmse"].append(val_rmse)
                progress_stats["val_rmse"] = val_rmse
                progress_stats["val_mae"] = val_mae

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
                        epoch_progress.set_postfix(progress_stats, refresh=False)
                        epoch_progress.write(
                            f"Early stopping triggered at epoch {epoch_idx + 1} "
                            f"(best val_rmse={best_val_rmse:.4f})."
                        )
                        break

            epoch_progress.set_postfix(progress_stats, refresh=False)
        epoch_progress.close()

        if best_state is not None:
            self.user_bias, self.item_bias, self.user_factors, self.item_factors = best_state
        self._refresh_inference_caches()

        item_norms = np.linalg.norm(self.item_factors, axis=1, keepdims=True)
        self.normalized_item_factors = np.divide(
            self.item_factors,
            np.maximum(item_norms, 1e-12),
            out=np.zeros_like(self.item_factors),
            where=item_norms > 1e-12,
        )
        return self

    def predict_batch(self, user_ids: np.ndarray, item_ids: np.ndarray) -> np.ndarray:
        if (
            self.user_bias is None
            or self.item_bias is None
            or self.user_factors is None
            or self.item_factors is None
        ):
            raise RuntimeError("Model is not fitted.")

        n = len(user_ids)
        preds = np.full(n, self.global_mean, dtype=np.float32)
        u_idx = np.fromiter((self.user_to_idx.get(int(u), -1) for u in user_ids), dtype=np.int64, count=n)
        i_idx = np.fromiter((self.item_to_idx.get(int(i), -1) for i in item_ids), dtype=np.int64, count=n)

        user_known = u_idx >= 0
        item_known = i_idx >= 0
        both_known = user_known & item_known

        if np.any(user_known):
            preds[user_known] += self.user_bias[u_idx[user_known]]
        if np.any(item_known):
            preds[item_known] += self.item_bias[i_idx[item_known]]
        if np.any(both_known):
            dots = np.sum(
                self.user_factors[u_idx[both_known]] * self.item_factors[i_idx[both_known]],
                axis=1,
            )
            preds[both_known] += dots.astype(np.float32)

        return np.clip(preds, self.min_rating, self.max_rating)

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
            item_base = (
                float(self.item_base_scores[i_idx])
                if self.item_base_scores is not None
                else self.global_mean + float(self.item_bias[i_idx])
            )
            pred = (
                item_base
                + float(self.user_bias[u_idx])
                + float(np.dot(self.user_factors[u_idx], self.item_factors[i_idx]))
            )
            return float(np.clip(pred, self.min_rating, self.max_rating))

        pred = self.global_mean
        if user_known:
            pred += float(self.user_bias[self.user_to_idx[user_id]])
        if item_known:
            pred += float(self.item_bias[self.item_to_idx[item_id]])
        return float(np.clip(pred, self.min_rating, self.max_rating))

    def recommend_top_n(
        self,
        user_id: int,
        n: int = 10,
        exclude_seen: bool = True,
        seen_items: set[int] | None = None,
    ) -> List[Recommendation]:
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
            if self.popular_item_order is not None:
                order = self.popular_item_order[:top_count]
            else:
                order = np.argsort(-item_scores)[:top_count]
            return [Recommendation(item_id=self.idx_to_item[i], score=float(item_scores[i])) for i in order]

        u_idx = self.user_to_idx[user_id]
        user_vector = self.user_factors[u_idx]
        item_base_scores = (
            self.item_base_scores
            if self.item_base_scores is not None
            else (self.global_mean + self.item_bias).astype(np.float32)
        )
        preds = (
            item_base_scores
            + self.user_bias[u_idx]
            + (self.item_factors @ user_vector)
        ).astype(np.float32)
        preds = np.clip(preds, self.min_rating, self.max_rating)

        if exclude_seen:
            preds = preds.copy()
            if seen_items is not None:
                seen_item_indices = np.fromiter(
                    (self.item_to_idx.get(int(seen_item), -1) for seen_item in seen_items),
                    dtype=np.int32,
                    count=len(seen_items),
                )
                seen_item_indices = seen_item_indices[seen_item_indices >= 0]
            else:
                seen_item_indices = self.user_seen_item_indices.get(user_id)
            if seen_item_indices is not None and seen_item_indices.size > 0:
                preds[seen_item_indices] = -np.inf

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
