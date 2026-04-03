from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List

import numpy as np
import pandas as pd
from tqdm import tqdm

@dataclass
class Recommendation:
    item_id: int
    score: float

class Option1MatrixFactorizationSGD:
    """
    Matrix Factorization recommender trained with PyTorch mini-batch updates.
    """

    def __init__(
        self,
        n_factors: int = 48,
        epochs: int = 25,
        lr: float = 0.01,
        reg: float = 0.05,
        lr_decay: float = 0.98,
        batch_size: int = 16384,
        validation_split: float = 0.1,
        early_stopping_patience: int = 6,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
    ) -> None:
        self.n_factors = n_factors
        self.epochs = epochs
        self.lr = lr
        self.reg = reg
        self.lr_decay = lr_decay
        self.batch_size = batch_size
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

    @staticmethod
    def _iter_slices(size: int, batch_size: int):
        for start in range(0, size, batch_size):
            yield slice(start, min(start + batch_size, size))

    @staticmethod
    def _select_device():
        import torch  # pyright: ignore[reportMissingImports]

        if torch.cuda.is_available():
            return torch.device("cuda")
        if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            return torch.device("mps")
        return torch.device("cpu")

    def fit(self, train_ratings: pd.DataFrame) -> "Option1MatrixFactorizationSGD":
        import torch  # pyright: ignore[reportMissingImports]
        import torch.nn as nn  # pyright: ignore[reportMissingImports]
        import torch.nn.functional as F  # pyright: ignore[reportMissingImports]

        print("[Option1] Initializing MF-SGD training pipeline...")
        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}
        self.global_mean = float(train_ratings["rating"].mean())
        n_users, n_items = len(users), len(items)
        print(
            f"[Option1] Loaded {len(train_ratings):,} ratings "
            f"({n_users:,} users, {n_items:,} items)."
        )

        self.training_history = {"train_mae": [], "train_rmse": [], "learning_rate": []}

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

        rng = np.random.default_rng(self.seed)
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

        torch.manual_seed(self.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(self.seed)
        device = self._select_device()

        class _MFModule(nn.Module):
            def __init__(self, user_count: int, item_count: int, factors: int) -> None:
                super().__init__()
                self.user_embedding = nn.Embedding(user_count, factors)
                self.item_embedding = nn.Embedding(item_count, factors)
                self.user_bias = nn.Embedding(user_count, 1)
                self.item_bias = nn.Embedding(item_count, 1)

                nn.init.normal_(self.user_embedding.weight, mean=0.0, std=0.1)
                nn.init.normal_(self.item_embedding.weight, mean=0.0, std=0.1)
                nn.init.zeros_(self.user_bias.weight)
                nn.init.zeros_(self.item_bias.weight)

            def forward(self, user_idx_t: torch.Tensor, item_idx_t: torch.Tensor) -> torch.Tensor:
                u_vec = self.user_embedding(user_idx_t)
                i_vec = self.item_embedding(item_idx_t)
                dot = (u_vec * i_vec).sum(dim=1)
                return dot + self.user_bias(user_idx_t).squeeze(1) + self.item_bias(item_idx_t).squeeze(1)

        model = _MFModule(n_users, n_items, self.n_factors).to(device)
        optimizer = torch.optim.AdamW(
            model.parameters(),
            lr=self.lr,
            weight_decay=max(float(self.reg), 0.0),
        )

        train_user_t = torch.from_numpy(user_ids[train_indices].astype(np.int64)).to(device)
        train_item_t = torch.from_numpy(item_ids[train_indices].astype(np.int64)).to(device)
        train_y_t = torch.from_numpy((values[train_indices] - self.global_mean).astype(np.float32)).to(device)

        if val_size > 0:
            val_user_t = torch.from_numpy(user_ids[val_indices].astype(np.int64)).to(device)
            val_item_t = torch.from_numpy(item_ids[val_indices].astype(np.int64)).to(device)
            val_y_t = torch.from_numpy((values[val_indices] - self.global_mean).astype(np.float32)).to(device)
        else:
            val_user_t = None
            val_item_t = None
            val_y_t = None

        best_val_rmse = np.inf
        best_state: Dict[str, torch.Tensor] | None = None
        stale_epochs = 0

        epoch_progress = tqdm(range(self.epochs), desc="Option1 MF-SGD", unit="epoch")
        for epoch_idx in epoch_progress:
            model.train()
            permutation = torch.randperm(train_user_t.shape[0], device=device)
            train_abs_error = 0.0
            train_sq_error = 0.0
            train_samples = 0

            for batch_slice in self._iter_slices(train_user_t.shape[0], max(1, int(self.batch_size))):
                batch_idx = permutation[batch_slice]
                batch_user = train_user_t[batch_idx]
                batch_item = train_item_t[batch_idx]
                batch_y = train_y_t[batch_idx]

                preds = model(batch_user, batch_item)
                loss = F.smooth_l1_loss(preds, batch_y)

                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()

                with torch.no_grad():
                    err = preds - batch_y
                    train_abs_error += float(torch.abs(err).sum().item())
                    train_sq_error += float(torch.square(err).sum().item())
                    train_samples += int(batch_y.shape[0])

            train_mae = train_abs_error / max(train_samples, 1)
            train_rmse = float(np.sqrt(train_sq_error / max(train_samples, 1)))
            self.training_history["train_mae"].append(train_mae)
            self.training_history["train_rmse"].append(train_rmse)
            current_lr = float(optimizer.param_groups[0]["lr"])
            self.training_history["learning_rate"].append(current_lr)
            progress_stats: Dict[str, float] = {
                "train_rmse": train_rmse,
                "train_mae": train_mae,
                "lr": current_lr,
            }

            if val_size > 0:
                model.eval()
                with torch.no_grad():
                    val_preds = model(val_user_t, val_item_t)
                    val_err = val_preds - val_y_t
                    val_mae = float(torch.abs(val_err).mean().item())
                    val_rmse = float(torch.sqrt(torch.square(val_err).mean()).item())
                self.training_history["val_mae"].append(val_mae)
                self.training_history["val_rmse"].append(val_rmse)
                progress_stats["val_rmse"] = val_rmse
                progress_stats["val_mae"] = val_mae

                if val_rmse < best_val_rmse - 1e-6:
                    best_val_rmse = val_rmse
                    stale_epochs = 0
                    best_state = {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
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

            for group in optimizer.param_groups:
                group["lr"] = float(group["lr"]) * float(self.lr_decay)
        epoch_progress.close()

        if best_state is not None:
            model.load_state_dict(best_state)

        model.eval()
        with torch.no_grad():
            self.user_factors = model.user_embedding.weight.detach().cpu().numpy().astype(np.float32)
            self.item_factors = model.item_embedding.weight.detach().cpu().numpy().astype(np.float32)
            self.user_bias = model.user_bias.weight.detach().cpu().numpy().reshape(-1).astype(np.float32)
            self.item_bias = model.item_bias.weight.detach().cpu().numpy().reshape(-1).astype(np.float32)

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
