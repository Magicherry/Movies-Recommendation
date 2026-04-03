from __future__ import annotations

import pickle
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

import numba
import numpy as np
import pandas as pd
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import svds
from tqdm import tqdm

RegressorType = Literal["svd", "ridge", "lasso"]


@dataclass
class Recommendation:
    item_id: int
    score: float


@numba.njit
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
        svd_power_iters: int = 2,
        regression_batch_size: int = 65536,
        ridge_epochs: int = 8,
        lasso_epochs: int = 14,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = n_factors
        self.regressor: RegressorType = str(regressor).lower()  # type: ignore[assignment]
        if self.regressor not in {"svd", "ridge", "lasso"}:
            self.regressor = "ridge"
        self.reg_alpha = reg_alpha
        self.lasso_max_iter = lasso_max_iter
        self.lasso_tol = lasso_tol
        self.bias_reg = bias_reg
        self.svd_power_iters = svd_power_iters
        self.regression_batch_size = regression_batch_size
        self.ridge_epochs = ridge_epochs
        self.lasso_epochs = lasso_epochs
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
        self.regression_uses_standardization: bool = True

        self.training_history: Dict[str, List[float]] = {}

        self._reg_factor_coef: np.ndarray | None = None
        self._reg_user_bias_coef: float = 0.0
        self._reg_item_bias_coef: float = 0.0
        self._reg_intercept: float = 0.0

    @staticmethod
    def _select_torch_device():
        import torch  # pyright: ignore[reportMissingImports]

        if torch.cuda.is_available():
            return torch.device("cuda")
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def _fit_factors_scipy(
        self,
        centered_ratings: np.ndarray,
        user_idx: np.ndarray,
        item_idx: np.ndarray,
        n_users: int,
        n_items: int,
        effective_rank: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        interaction_matrix = coo_matrix(
            (centered_ratings, (user_idx, item_idx)),
            shape=(n_users, n_items),
            dtype=np.float32,
        )
        if effective_rank > 0 and interaction_matrix.nnz > 0:
            u_mat, singular_vals, vt_mat = svds(interaction_matrix.tocsr(), k=effective_rank)
            order = np.argsort(singular_vals)[::-1]
            u_mat = u_mat[:, order]
            singular_vals = singular_vals[order]
            vt_mat = vt_mat[order, :]
            sqrt_s = np.sqrt(np.maximum(singular_vals, 0.0))
            return (u_mat * sqrt_s).astype(np.float32), (vt_mat.T * sqrt_s).astype(np.float32)
        return (
            np.zeros((n_users, effective_rank), dtype=np.float32),
            np.zeros((n_items, effective_rank), dtype=np.float32),
        )

    def _fit_factors_torch(
        self,
        centered_ratings: np.ndarray,
        user_idx: np.ndarray,
        item_idx: np.ndarray,
        n_users: int,
        n_items: int,
        effective_rank: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        import torch  # pyright: ignore[reportMissingImports]

        if effective_rank <= 0 or centered_ratings.size == 0:
            return (
                np.zeros((n_users, effective_rank), dtype=np.float32),
                np.zeros((n_items, effective_rank), dtype=np.float32),
            )

        device = self._select_torch_device()
        # Sparse CUDA path is the main acceleration target; other devices use SciPy fallback.
        if device.type != "cuda":
            return self._fit_factors_scipy(
                centered_ratings=centered_ratings,
                user_idx=user_idx,
                item_idx=item_idx,
                n_users=n_users,
                n_items=n_items,
                effective_rank=effective_rank,
            )

        torch.manual_seed(self.seed)
        torch.cuda.manual_seed_all(self.seed)

        row = torch.from_numpy(user_idx.astype(np.int64)).to(device)
        col = torch.from_numpy(item_idx.astype(np.int64)).to(device)
        val = torch.from_numpy(centered_ratings.astype(np.float32)).to(device)
        indices = torch.stack([row, col], dim=0)
        interaction = torch.sparse_coo_tensor(
            indices,
            val,
            size=(n_users, n_items),
            device=device,
            dtype=torch.float32,
        ).coalesce()
        interaction_t = interaction.transpose(0, 1).coalesce()

        q = torch.randn((n_items, effective_rank), device=device, dtype=torch.float32)
        q = torch.linalg.qr(q, mode="reduced").Q

        n_power_iters = max(1, int(self.svd_power_iters))
        for _ in tqdm(range(n_power_iters), desc="Option3 SVD power", unit="iter", leave=False):
            z = torch.sparse.mm(interaction, q)
            z = torch.linalg.qr(z, mode="reduced").Q
            q = torch.sparse.mm(interaction_t, z)
            q = torch.linalg.qr(q, mode="reduced").Q

        b = torch.sparse.mm(interaction, q)
        u_hat, singular_vals, vh = torch.linalg.svd(b, full_matrices=False)
        k = min(effective_rank, singular_vals.shape[0], vh.shape[0])
        u = u_hat[:, :k]
        s = singular_vals[:k]
        v = q @ vh[:k, :].transpose(0, 1)

        sqrt_s = torch.sqrt(torch.clamp(s, min=0.0))
        user_factors = (u * sqrt_s).detach().cpu().numpy().astype(np.float32)
        item_factors = (v * sqrt_s).detach().cpu().numpy().astype(np.float32)
        return user_factors, item_factors

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

        intercept = y_mean - float(np.dot(x_mean / x_scale, weights))
        self.feature_mean = x_mean.astype(np.float32)
        self.feature_scale = x_scale.astype(np.float32)
        self.regression_coef = weights.astype(np.float32)
        self.regression_intercept = float(intercept)
        self.regression_uses_standardization = True

    def _fit_regressor_torch(
        self,
        user_idx: np.ndarray,
        item_idx: np.ndarray,
        y_true: np.ndarray,
    ) -> None:
        import torch  # pyright: ignore[reportMissingImports]

        if (
            self.user_factors is None
            or self.item_factors is None
            or self.user_bias is None
            or self.item_bias is None
        ):
            raise RuntimeError("Model is not fitted.")

        if self.regressor not in {"ridge", "lasso"}:
            self.feature_mean = None
            self.feature_scale = None
            self.regression_coef = None
            self.regression_intercept = 0.0
            self.regression_uses_standardization = True
            return

        device = self._select_torch_device()
        torch.manual_seed(self.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(self.seed)

        user_f = torch.from_numpy(self.user_factors.astype(np.float32)).to(device)
        item_f = torch.from_numpy(self.item_factors.astype(np.float32)).to(device)
        user_b = torch.from_numpy(self.user_bias.astype(np.float32)).to(device)
        item_b = torch.from_numpy(self.item_bias.astype(np.float32)).to(device)

        user_idx_t = torch.from_numpy(user_idx.astype(np.int64)).to(device)
        item_idx_t = torch.from_numpy(item_idx.astype(np.int64)).to(device)
        y_t = torch.from_numpy(y_true.astype(np.float32)).to(device)

        feat_dim = user_f.shape[1] + 2
        coef = torch.zeros(feat_dim, device=device, dtype=torch.float32, requires_grad=True)
        intercept = torch.tensor(float(y_t.mean().item()), device=device, dtype=torch.float32, requires_grad=True)
        optimizer = torch.optim.Adam([coef, intercept], lr=0.05)

        epochs = int(self.ridge_epochs if self.regressor == "ridge" else self.lasso_epochs)
        alpha = max(float(self.reg_alpha), 0.0)

        reg_progress = tqdm(range(max(1, epochs)), desc=f"Option3 {self.regressor} head", unit="epoch", leave=False)
        for _ in reg_progress:
            perm = torch.randperm(user_idx_t.shape[0], device=device)
            epoch_loss = 0.0
            epoch_batches = 0
            for start in range(0, perm.shape[0], max(1, int(self.regression_batch_size))):
                batch_idx = perm[start : start + max(1, int(self.regression_batch_size))]
                u = user_idx_t[batch_idx]
                i = item_idx_t[batch_idx]
                y = y_t[batch_idx]

                x_latent = user_f[u] * item_f[i]
                x = torch.cat([x_latent, user_b[u].unsqueeze(1), item_b[i].unsqueeze(1)], dim=1)
                preds = x @ coef + intercept
                mse = torch.mean(torch.square(preds - y))
                if self.regressor == "ridge":
                    penalty = alpha * torch.mean(torch.square(coef))
                else:
                    penalty = alpha * torch.mean(torch.abs(coef))
                loss = mse + penalty

                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()
                epoch_loss += float(loss.detach().item())
                epoch_batches += 1
            if epoch_batches > 0:
                reg_progress.set_postfix({"loss": epoch_loss / epoch_batches}, refresh=False)
        reg_progress.close()

        self.feature_mean = None
        self.feature_scale = None
        self.regression_coef = coef.detach().cpu().numpy().astype(np.float32)
        self.regression_intercept = float(intercept.detach().cpu().item())
        self.regression_uses_standardization = False

    def _predict_known_pairs(self, user_idx: np.ndarray, item_idx: np.ndarray) -> np.ndarray:
        if (
            self.user_factors is None
            or self.item_factors is None
            or self.user_bias is None
            or self.item_bias is None
        ):
            raise RuntimeError("Model is not fitted.")

        dot_scores = np.sum(self.user_factors[user_idx] * self.item_factors[item_idx], axis=1)
        baseline = self.global_mean + self.user_bias[user_idx] + self.item_bias[item_idx] + dot_scores

        if self.regression_coef is None or self.regressor == "svd":
            return baseline.astype(np.float32)

        x_raw = self._build_feature_matrix(user_idx, item_idx)
        if self.regression_uses_standardization and self.feature_mean is not None and self.feature_scale is not None:
            x_features = (x_raw - self.feature_mean) / self.feature_scale
        else:
            x_features = x_raw
        preds = self.regression_intercept + x_features @ self.regression_coef
        return preds.astype(np.float32)

    def fit(self, train_ratings: pd.DataFrame) -> "Option3SVDHybridRecommender":
        print("[Option3] Initializing SVD-hybrid training pipeline...")
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}

        self.global_mean = float(train_ratings["rating"].mean()) if len(train_ratings) > 0 else 0.0

        n_users = len(users)
        n_items = len(items)
        print(
            f"[Option3] Loaded {len(train_ratings):,} ratings "
            f"({n_users:,} users, {n_items:,} items)."
        )
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

        centered_ratings = ratings - self.global_mean
        effective_rank = max(1, min(int(self.n_factors), min(n_users, n_items) - 1))
        self.user_factors, self.item_factors = self._fit_factors_torch(
            centered_ratings=centered_ratings,
            user_idx=user_idx,
            item_idx=item_idx,
            n_users=n_users,
            n_items=n_items,
            effective_rank=effective_rank,
        )

        dot_scores = np.sum(self.user_factors[user_idx] * self.item_factors[item_idx], axis=1)
        residual_after_dot = ratings - self.global_mean - dot_scores
        bias_reg = max(float(self.bias_reg), 1e-6)

        user_sum = np.zeros(n_users, dtype=np.float64)
        user_cnt = np.zeros(n_users, dtype=np.float64)
        np.add.at(user_sum, user_idx, residual_after_dot)
        np.add.at(user_cnt, user_idx, 1.0)
        self.user_bias = (user_sum / (user_cnt + bias_reg)).astype(np.float32)

        residual_after_user = residual_after_dot - self.user_bias[user_idx]
        item_sum_bias = np.zeros(n_items, dtype=np.float64)
        item_cnt_bias = np.zeros(n_items, dtype=np.float64)
        np.add.at(item_sum_bias, item_idx, residual_after_user)
        np.add.at(item_cnt_bias, item_idx, 1.0)
        self.item_bias = (item_sum_bias / (item_cnt_bias + bias_reg)).astype(np.float32)

        if self.regressor in {"ridge", "lasso"} and self.user_factors.shape[1] > 0:
            self._fit_regressor_torch(
                user_idx=user_idx,
                item_idx=item_idx,
                y_true=ratings.astype(np.float32),
            )
        else:
            self.feature_mean = None
            self.feature_scale = None
            self.regression_coef = None
            self.regression_intercept = 0.0
            self.regression_uses_standardization = True

        self._precompute_regression_scoring()

        item_norms = np.linalg.norm(self.item_factors, axis=1, keepdims=True)
        self.normalized_item_factors = np.divide(
            self.item_factors,
            np.maximum(item_norms, 1e-12),
            out=np.zeros_like(self.item_factors),
            where=item_norms > 1e-12,
        )

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

        # For pairs where only one side is known, add the known bias.
        only_user = user_known & ~item_known
        only_item = item_known & ~user_known
        if np.any(only_user):
            preds[only_user] += self.user_bias[u_idx[only_user]]
        if np.any(only_item):
            preds[only_item] += self.item_bias[i_idx[only_item]]

        # For fully known pairs, use the regression-aware prediction path.
        if np.any(both_known):
            bk_u = u_idx[both_known].astype(np.int32)
            bk_i = i_idx[both_known].astype(np.int32)
            preds[both_known] = self._predict_known_pairs(bk_u, bk_i)

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

        pred = self.global_mean
        if user_known:
            pred += float(self.user_bias[self.user_to_idx[user_id]])
        if item_known:
            pred += float(self.item_bias[self.item_to_idx[item_id]])
        return float(np.clip(pred, self.min_rating, self.max_rating))

    def _precompute_regression_scoring(self) -> None:
        """Pre-derive vectorized regression coefficients for fast all-item scoring.

        Rewrites: pred[i] = _reg_user_offset(u) + _reg_item_coef * item_bias[i]
                           + item_factors[i] @ _reg_scaled_user(u)
        so recommend_top_n avoids building an (n_items, n_factors+2) matrix per user.
        """
        if self.regression_coef is None:
            self._reg_factor_coef: np.ndarray | None = None
            return

        coef = self.regression_coef.astype(np.float64)
        intercept = float(self.regression_intercept)
        k = len(coef) - 2  # number of latent dimensions

        if self.regression_uses_standardization and self.feature_mean is not None and self.feature_scale is not None:
            scale = self.feature_scale.astype(np.float64)
            mean = self.feature_mean.astype(np.float64)
            eff_coef = coef / scale
            eff_intercept = intercept - float(np.dot(mean / scale, coef))
        else:
            eff_coef = coef
            eff_intercept = intercept

        self._reg_factor_coef = eff_coef[:k].astype(np.float32)
        self._reg_user_bias_coef = float(eff_coef[k])
        self._reg_item_bias_coef = float(eff_coef[k + 1])
        self._reg_intercept = float(eff_intercept)

    def _score_all_items_for_user(self, u_idx: int) -> np.ndarray:
        """Compute regression-aware scores for one user against all items in O(n_items*k)."""
        if self._reg_factor_coef is not None and self.user_factors is not None and self.item_factors is not None and self.user_bias is not None and self.item_bias is not None:
            scaled_user = self._reg_factor_coef * self.user_factors[u_idx]
            user_offset = self._reg_intercept + self._reg_user_bias_coef * float(self.user_bias[u_idx])
            preds = (
                user_offset
                + self._reg_item_bias_coef * self.item_bias
                + self.item_factors @ scaled_user
            ).astype(np.float32)
        else:
            user_vector = self.user_factors[u_idx]
            preds = (
                self.global_mean
                + self.user_bias[u_idx]
                + self.item_bias
                + (self.item_factors @ user_vector)
            ).astype(np.float32)
        return preds

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
        preds = self._score_all_items_for_user(u_idx)
        preds = np.clip(preds, self.min_rating, self.max_rating)

        if exclude_seen:
            preds = preds.copy()
            if seen_items is None:
                seen_items = self.user_seen_items.get(user_id, set())
            for seen_item in seen_items:
                seen_idx = self.item_to_idx.get(seen_item)
                if seen_idx is not None:
                    preds[seen_idx] = -np.inf

        if n <= 0:
            return []
        top_count = min(n, len(preds))
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

