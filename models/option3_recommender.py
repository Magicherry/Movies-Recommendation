from __future__ import annotations

import pickle
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

import numba
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import svds

RegressorType = Literal["svd", "ridge", "lasso", "knn"]


@dataclass
class Recommendation:
    item_id: int
    score: float


@numba.njit(nopython=True)
def _fit_lasso_numba(
    x_std: np.ndarray,
    y_centered: np.ndarray,
    alpha_scaled: float,
    lasso_max_iter: int,
    lasso_tol: float
) -> np.ndarray:
    n_samples, n_features = x_std.shape
    weights = np.zeros(n_features, dtype=np.float64)
    residual = y_centered.copy()
    
    denom = np.zeros(n_features, dtype=np.float64)
    for j in range(n_features):
        sum_sq = 0.0
        for i in range(n_samples):
            sum_sq += x_std[i, j] * x_std[i, j]
        denom[j] = sum_sq + 1e-12

    for _ in range(max(1, lasso_max_iter)):
        max_delta = 0.0
        for j in range(n_features):
            old_weight = weights[j]
            
            for i in range(n_samples):
                residual[i] += x_std[i, j] * old_weight
                
            rho = 0.0
            for i in range(n_samples):
                rho += x_std[i, j] * residual[i]
                
            if rho > alpha_scaled:
                new_weight = (rho - alpha_scaled) / denom[j]
            elif rho < -alpha_scaled:
                new_weight = (rho + alpha_scaled) / denom[j]
            else:
                new_weight = 0.0
                
            weights[j] = new_weight
            
            for i in range(n_samples):
                residual[i] -= x_std[i, j] * new_weight
                
            delta = abs(new_weight - old_weight)
            if delta > max_delta:
                max_delta = delta
                
        if max_delta < lasso_tol:
            break
            
    return weights


class Option3SVDHybridRecommender:
    """
    Matrix-based recommender using SVD latent factors with optional
    Ridge/Lasso calibration on user-item latent interactions.
    """

    def __init__(
        self,
        n_factors: int = 48,
        regressor: RegressorType = "ridge",
        reg_alpha: float = 0.1,
        lasso_max_iter: int = 200,
        lasso_tol: float = 1e-4,
        bias_reg: float = 10.0,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = n_factors
        self.regressor: RegressorType = str(regressor).lower()  # type: ignore[assignment]
        if self.regressor not in {"svd", "ridge", "lasso", "knn"}:
            self.regressor = "ridge"
        self.reg_alpha = reg_alpha
        self.lasso_max_iter = lasso_max_iter
        self.lasso_tol = lasso_tol
        self.bias_reg = bias_reg
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

        self.feature_mean: np.ndarray | None = None
        self.feature_scale: np.ndarray | None = None
        self.regression_coef: np.ndarray | None = None
        self.regression_intercept: float = 0.0
        self._reg_factor_coef: np.ndarray | None = None
        self._reg_user_bias_coef: float = 1.0
        self._reg_item_bias_coef: float = 1.0
        self._reg_intercept: float = 0.0

        self.training_history: Dict[str, List[float]] = {}

    def _fit_lasso(self, x_std: np.ndarray, y_centered: np.ndarray) -> np.ndarray:
        n_samples = x_std.shape[0]
        alpha_scaled = float(self.reg_alpha) * float(n_samples)
        print("Running Numba-accelerated Lasso...")
        return _fit_lasso_numba(
            x_std=x_std.astype(np.float64),
            y_centered=y_centered.astype(np.float64),
            alpha_scaled=alpha_scaled,
            lasso_max_iter=int(self.lasso_max_iter),
            lasso_tol=float(self.lasso_tol)
        )

    def _build_feature_matrix(self, user_idx: np.ndarray, item_idx: np.ndarray) -> np.ndarray:
        if (
            self.user_factors is None
            or self.item_factors is None
            or self.user_bias is None
            or self.item_bias is None
        ):
            raise RuntimeError("Model is not fitted.")

        latent_products = self.user_factors[user_idx] * self.item_factors[item_idx]
        user_bias_col = self.user_bias[user_idx][:, np.newaxis]
        item_bias_col = self.item_bias[item_idx][:, np.newaxis]
        return np.concatenate([latent_products, user_bias_col, item_bias_col], axis=1).astype(np.float64)

    def _fit_regressor(self, x_raw: np.ndarray, y_true: np.ndarray) -> None:
        x_mean = x_raw.mean(axis=0)
        x_scale = x_raw.std(axis=0)
        x_scale = np.where(x_scale < 1e-8, 1.0, x_scale)
        x_std = (x_raw - x_mean) / x_scale

        y_mean = float(y_true.mean())
        y_centered = y_true - y_mean

        if self.regressor == "ridge":
            n_features = x_std.shape[1]
            eye = np.eye(n_features, dtype=np.float64)
            system = x_std.T @ x_std + float(self.reg_alpha) * eye
            rhs = x_std.T @ y_centered
            weights = np.linalg.solve(system, rhs)
        else:
            weights = self._fit_lasso(x_std, y_centered)

        w_unnorm = weights / x_scale
        intercept_unnorm = y_mean - float(np.dot(x_mean, w_unnorm))

        k = self.user_factors.shape[1]
        self._reg_factor_coef = w_unnorm[:k].astype(np.float32, copy=False)
        self._reg_user_bias_coef = float(w_unnorm[k])
        self._reg_item_bias_coef = float(w_unnorm[k + 1])
        self._reg_intercept = float(intercept_unnorm)

        self.feature_mean = x_mean.astype(np.float32, copy=False)
        self.feature_scale = x_scale.astype(np.float32, copy=False)
        self.regression_coef = w_unnorm.astype(np.float32, copy=False)
        self.regression_intercept = float(intercept_unnorm)

    def _has_regression_calibration(self) -> bool:
        reg_coef = getattr(self, "_reg_factor_coef", None)
        return isinstance(reg_coef, np.ndarray) and reg_coef.ndim == 1 and self.regressor in {"ridge", "lasso"}

    def _predict_known_pairs(self, user_idx: np.ndarray, item_idx: np.ndarray) -> np.ndarray:
        if (
            self.user_factors is None
            or self.item_factors is None
            or self.user_bias is None
            or self.item_bias is None
        ):
            raise RuntimeError("Model is not fitted.")

        if self._has_regression_calibration():
            reg_coef = self._reg_factor_coef
            assert reg_coef is not None
            weighted_user_factors = self.user_factors[user_idx] * reg_coef[np.newaxis, :]
            dot_scores = np.sum(weighted_user_factors * self.item_factors[item_idx], axis=1)
            baseline = (
                self._reg_intercept
                + self._reg_user_bias_coef * self.user_bias[user_idx]
                + self._reg_item_bias_coef * self.item_bias[item_idx]
                + dot_scores
            )
        else:
            dot_scores = np.sum(self.user_factors[user_idx] * self.item_factors[item_idx], axis=1)
            baseline = self.global_mean + self.user_bias[user_idx] + self.item_bias[item_idx] + dot_scores

        return baseline.astype(np.float32)

    def fit(self, train_ratings: pd.DataFrame) -> "Option3SVDHybridRecommender":
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}

        self.global_mean = float(train_ratings["rating"].mean()) if len(train_ratings) > 0 else 0.0

        n_users = len(users)
        n_items = len(items)
        self.user_bias = np.zeros(n_users, dtype=np.float32)
        self.item_bias = np.zeros(n_items, dtype=np.float32)

        if n_users == 0 or n_items == 0:
            self.user_factors = np.zeros((n_users, 0), dtype=np.float32)
            self.item_factors = np.zeros((n_items, 0), dtype=np.float32)
            self.normalized_item_factors = np.zeros((n_items, 0), dtype=np.float32)
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
            if uid not in self.user_seen_items:
                self.user_seen_items[uid] = set()
            self.user_seen_items[uid].add(iid)

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

        # 1. Calculate baselines (global_mean, user_bias, item_bias) before SVD
        bias_reg = max(float(self.bias_reg), 1e-6)
        
        residual_after_mean = ratings - self.global_mean
        
        user_sum = np.zeros(n_users, dtype=np.float64)
        user_cnt = np.zeros(n_users, dtype=np.float64)
        np.add.at(user_sum, user_idx, residual_after_mean)
        np.add.at(user_cnt, user_idx, 1.0)
        self.user_bias = (user_sum / (user_cnt + bias_reg)).astype(np.float32)

        residual_after_user = residual_after_mean - self.user_bias[user_idx]
        item_sum_bias = np.zeros(n_items, dtype=np.float64)
        item_cnt_bias = np.zeros(n_items, dtype=np.float64)
        np.add.at(item_sum_bias, item_idx, residual_after_user)
        np.add.at(item_cnt_bias, item_idx, 1.0)
        self.item_bias = (item_sum_bias / (item_cnt_bias + bias_reg)).astype(np.float32)

        # 2. Isolate the pure residual containing mainly personalized variation
        pure_residuals = residual_after_user - self.item_bias[item_idx]
        
        # 3. Use sparse matrix zero-imputation with the much safer baseline assumption
        interaction_matrix = coo_matrix(
            (pure_residuals, (user_idx, item_idx)),
            shape=(n_users, n_items),
            dtype=np.float32
        )

        effective_rank = max(1, min(int(self.n_factors), min(n_users, n_items) - 1))
        if effective_rank > 0 and interaction_matrix.nnz > 0:
            u_mat, singular_vals, vt_mat = svds(interaction_matrix.tocsr(), k=effective_rank)
            
            # svds returns them sorted in ascending order, we reverse it
            order = np.argsort(singular_vals)[::-1]
            u_mat = u_mat[:, order]
            singular_vals = singular_vals[order]
            vt_mat = vt_mat[order, :]
            
            sqrt_s = np.sqrt(np.maximum(singular_vals, 0.0))
            self.user_factors = (u_mat * sqrt_s).astype(np.float32)
            self.item_factors = (vt_mat.T * sqrt_s).astype(np.float32)
        else:
            self.user_factors = np.zeros((n_users, effective_rank), dtype=np.float32)
            self.item_factors = np.zeros((n_items, effective_rank), dtype=np.float32)

        if self.regressor in {"ridge", "lasso"} and self.user_factors.shape[1] > 0:
            x_raw = self._build_feature_matrix(user_idx, item_idx)
            self._fit_regressor(x_raw=x_raw, y_true=ratings.astype(np.float64))
        else:
            self.feature_mean = None
            self.feature_scale = None
            self.regression_coef = None
            self.regression_intercept = 0.0
            self._reg_factor_coef = None
            self._reg_user_bias_coef = 1.0
            self._reg_item_bias_coef = 1.0
            self._reg_intercept = float(self.global_mean)

        item_norms = np.linalg.norm(self.item_factors, axis=1, keepdims=True)
        self.normalized_item_factors = np.divide(
            self.item_factors,
            np.maximum(item_norms, 1e-12),
            out=np.zeros_like(self.item_factors),
            where=item_norms > 1e-12,
        )

        if self.regressor == "knn":
            new_user_factors = np.zeros_like(self.user_factors)
            for uid, iids in self.user_seen_items.items():
                u_idx = self.user_to_idx[uid]
                indices = [self.item_to_idx[i] for i in iids if i in self.item_to_idx]
                if len(indices) > 0:
                    new_user_factors[u_idx] = self.normalized_item_factors[indices].mean(axis=0)
            
            # Transform latent space to Item-KNN Space (Average of Similarities)
            # The * 2.0 acts as a temperature/spread scale for KNN Cosine sim to match CF rating distributions
            self.user_factors = (new_user_factors * 2.0).astype(np.float32)
            self.item_factors = self.normalized_item_factors.astype(np.float32)

        train_preds = self._predict_known_pairs(user_idx, item_idx)
        train_preds = np.clip(train_preds, self.min_rating, self.max_rating)
        train_errors = train_preds - ratings
        self.training_history = {
            "train_mae": [float(np.mean(np.abs(train_errors)))],
            "train_rmse": [float(np.sqrt(np.mean(np.square(train_errors))))],
        }
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

        if self._has_regression_calibration():
            if np.any(user_known):
                preds[user_known] = self._reg_intercept + self._reg_user_bias_coef * self.user_bias[u_idx[user_known]]
            if np.any(item_known):
                preds[item_known] += self._reg_item_bias_coef * self.item_bias[i_idx[item_known]]
        else:
            if np.any(user_known):
                preds[user_known] += self.user_bias[u_idx[user_known]]
            if np.any(item_known):
                preds[item_known] += self.item_bias[i_idx[item_known]]
        if np.any(both_known):
            known_u = u_idx[both_known]
            known_i = i_idx[both_known]
            full_preds = self._predict_known_pairs(known_u, known_i)
            preds[both_known] = full_preds

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
            pred = float(self._predict_known_pairs(np.array([u_idx]), np.array([i_idx]))[0])
            return float(np.clip(pred, self.min_rating, self.max_rating))

        if self._has_regression_calibration():
            pred = float(self._reg_intercept)
            if user_known:
                pred += float(self._reg_user_bias_coef * self.user_bias[self.user_to_idx[user_id]])
            if item_known:
                pred += float(self._reg_item_bias_coef * self.item_bias[self.item_to_idx[item_id]])
        else:
            pred = self.global_mean
            if user_known:
                pred += float(self.user_bias[self.user_to_idx[user_id]])
            if item_known:
                pred += float(self.item_bias[self.item_to_idx[item_id]])
        return float(np.clip(pred, self.min_rating, self.max_rating))

    def recommend_top_n(self, user_id: int, n: int = 10, exclude_seen: bool = True, seen_items: set[int] | None = None) -> List[Recommendation]:
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
        if self._has_regression_calibration():
            reg_coef = self._reg_factor_coef
            assert reg_coef is not None
            weighted_user_vector = user_vector * reg_coef
            ranking_scores = (
                self._reg_intercept
                + self._reg_user_bias_coef * self.user_bias[u_idx]
                + self._reg_item_bias_coef * self.item_bias
                + (self.item_factors @ weighted_user_vector)
            ).astype(np.float32)
        else:
            ranking_scores = (
                self.global_mean
                + self.user_bias[u_idx]
                + self.item_bias
                + (self.item_factors @ user_vector)
            ).astype(np.float32)

        display_scores = np.clip(ranking_scores, self.min_rating, self.max_rating).astype(np.float32)

        if exclude_seen:
            ranking_scores = ranking_scores.copy()
            if seen_items is None:
                seen_items = self.user_seen_items.get(user_id, set())
            for seen_item in seen_items:
                seen_idx = self.item_to_idx.get(seen_item)
                if seen_idx is not None:
                    ranking_scores[seen_idx] = -np.inf

        if n <= 0:
            return []
        top_count = min(n, len(ranking_scores))
        candidate_idx = np.argpartition(-ranking_scores, top_count - 1)[:top_count]
        top_idx = candidate_idx[np.argsort(-ranking_scores[candidate_idx])]

        recs: List[Recommendation] = []
        for idx in top_idx:
            if np.isfinite(ranking_scores[idx]):
                recs.append(Recommendation(item_id=self.idx_to_item[int(idx)], score=float(display_scores[idx])))
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

