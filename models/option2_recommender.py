from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from typing import Dict, Iterator, List

import numpy as np
import pandas as pd


@dataclass
class Recommendation:
    item_id: int
    score: float


class Option2DeepRecommender:
    """
    Hybrid deep recommender with title and genre features.
    """

    def __init__(
        self,
        embedding_dim: int = 32,
        epochs: int = 5,
        batch_size: int = 256,
        lr: float = 0.001,
        seed: int = 42,
        min_rating: float = 0.5,
        max_rating: float = 5.0,
        title_max_len: int = 15,
        title_vocab_size: int = 20000,
        title_embedding_dim: int = 32,
        title_num_filters: int = 32,
        genre_max_len: int = 4,
        genre_embedding_dim: int = 8,
        dropout_rate: float = 0.15,
        l2_reg: float = 1e-6,
        validation_split: float = 0.1,
        lr_plateau_patience: int = 2,
        lr_plateau_factor: float = 0.5,
        min_lr: float = 1e-5,
        rating_weight_power: float = 1.25,
        popularity_prior_count: float = 20.0,
    ) -> None:
        self.embedding_dim = embedding_dim
        self.epochs = epochs
        self.batch_size = batch_size
        self.lr = lr
        self.seed = seed
        self.min_rating = min_rating
        self.max_rating = max_rating
        self.title_max_len = title_max_len
        self.title_vocab_size = title_vocab_size
        self.title_embedding_dim = title_embedding_dim
        self.title_num_filters = title_num_filters
        self.genre_max_len = genre_max_len
        self.genre_embedding_dim = genre_embedding_dim
        self.dropout_rate = dropout_rate
        self.l2_reg = l2_reg
        self.validation_split = validation_split
        self.lr_plateau_patience = lr_plateau_patience
        self.lr_plateau_factor = lr_plateau_factor
        self.min_lr = min_lr
        self.rating_weight_power = rating_weight_power
        self.popularity_prior_count = popularity_prior_count

        self.user_to_idx: Dict[int, int] = {}
        self.idx_to_user: Dict[int, int] = {}
        self.item_to_idx: Dict[int, int] = {}
        self.idx_to_item: Dict[int, int] = {}
        self.user_seen_items: Dict[int, set[int]] = {}

        self.user_vectors: np.ndarray | None = None
        self.item_vectors: np.ndarray | None = None
        self.user_bias: np.ndarray | None = None
        self.item_bias: np.ndarray | None = None
        self.normalized_item_vectors: np.ndarray | None = None
        self.item_popularity_score: np.ndarray | None = None
        self.global_mean: float = 0.0

        self.title_word_to_idx: Dict[str, int] = {}
        self.genre_to_idx: Dict[str, int] = {}
        self.training_history: Dict[str, List[float]] = {}

    def _tokenize_title(self, title: str) -> List[str]:
        clean = re.sub(r"\(\d{4}\)\s*$", "", str(title)).lower()
        return re.findall(r"[a-z0-9]+", clean)

    def _build_title_vocab(self, titles: List[str]) -> None:
        counts: Dict[str, int] = {}
        for title in titles:
            for token in self._tokenize_title(title):
                counts[token] = counts.get(token, 0) + 1

        sorted_tokens = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        kept_tokens = sorted_tokens[: max(1, self.title_vocab_size - 1)]
        self.title_word_to_idx = {token: i + 1 for i, (token, _) in enumerate(kept_tokens)}

    def _encode_title(self, title: str) -> np.ndarray:
        tokens = self._tokenize_title(title)[: self.title_max_len]
        arr = np.zeros(self.title_max_len, dtype=np.int32)
        for i, token in enumerate(tokens):
            arr[i] = self.title_word_to_idx.get(token, 0)
        return arr

    def _build_item_title_matrix(self, items: List[int], movies: pd.DataFrame) -> np.ndarray:
        movie_title_map = (
            movies[["item_id", "title"]]
            .dropna(subset=["item_id"])
            .drop_duplicates(subset=["item_id"], keep="first")
            .set_index("item_id")["title"]
            .to_dict()
        )

        item_titles = [str(movie_title_map.get(item_id, "")) for item_id in items]
        self._build_title_vocab(item_titles)

        title_matrix = np.zeros((len(items), self.title_max_len), dtype=np.int32)
        for idx, title in enumerate(item_titles):
            title_matrix[idx] = self._encode_title(title)
        return title_matrix

    def _tokenize_genres(self, genres: str) -> List[str]:
        raw = str(genres or "")
        parts = [p.strip().lower() for p in raw.split("|")]
        return [p for p in parts if p and p != "(no genres listed)"]

    def _build_genre_vocab(self, genres_list: List[str]) -> None:
        counts: Dict[str, int] = {}
        for genres in genres_list:
            for token in self._tokenize_genres(genres):
                counts[token] = counts.get(token, 0) + 1
        sorted_tokens = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
        self.genre_to_idx = {token: i + 1 for i, (token, _) in enumerate(sorted_tokens)}

    def _encode_genres(self, genres: str) -> np.ndarray:
        tokens = self._tokenize_genres(genres)[: self.genre_max_len]
        arr = np.zeros(self.genre_max_len, dtype=np.int32)
        for i, token in enumerate(tokens):
            arr[i] = self.genre_to_idx.get(token, 0)
        return arr

    def _build_item_genre_matrix(self, items: List[int], movies: pd.DataFrame) -> np.ndarray:
        if "genres" not in movies.columns:
            self.genre_to_idx = {}
            return np.zeros((len(items), self.genre_max_len), dtype=np.int32)

        movie_genre_map = (
            movies[["item_id", "genres"]]
            .dropna(subset=["item_id"])
            .drop_duplicates(subset=["item_id"], keep="first")
            .set_index("item_id")["genres"]
            .to_dict()
        )
        item_genres = [str(movie_genre_map.get(item_id, "")) for item_id in items]
        self._build_genre_vocab(item_genres)

        genre_matrix = np.zeros((len(items), self.genre_max_len), dtype=np.int32)
        for idx, genres in enumerate(item_genres):
            genre_matrix[idx] = self._encode_genres(genres)
        return genre_matrix

    def _set_torch_seed(self) -> None:
        import torch  # pyright: ignore[reportMissingImports]

        torch.manual_seed(self.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(self.seed)

    def _build_model(
        self,
        num_users: int,
        num_items: int,
        vocab_size: int,
        genre_vocab_size: int,
    ):
        import torch  # pyright: ignore[reportMissingImports]
        import torch.nn as nn  # pyright: ignore[reportMissingImports]

        class _HybridNCFModule(nn.Module):
            def __init__(
                self,
                embedding_dim: int,
                title_embedding_dim: int,
                title_num_filters: int,
                genre_embedding_dim: int,
                dropout_rate: float,
            ) -> None:
                super().__init__()
                self.user_embedding = nn.Embedding(num_users, embedding_dim)
                self.item_id_embedding = nn.Embedding(num_items, embedding_dim)
                self.title_embedding = nn.Embedding(vocab_size + 1, title_embedding_dim)
                self.genre_embedding = nn.Embedding(genre_vocab_size + 1, genre_embedding_dim)

                self.user_dropout = nn.Dropout(dropout_rate)
                self.title_dropout = nn.Dropout(dropout_rate)
                self.item_hidden_dropout = nn.Dropout(dropout_rate)
                self.item_dropout = nn.Dropout(dropout_rate)

                self.title_conv_2 = nn.Conv1d(
                    in_channels=title_embedding_dim,
                    out_channels=title_num_filters,
                    kernel_size=2,
                )
                self.title_conv_3 = nn.Conv1d(
                    in_channels=title_embedding_dim,
                    out_channels=title_num_filters,
                    kernel_size=3,
                )
                self.title_conv_4 = nn.Conv1d(
                    in_channels=title_embedding_dim,
                    out_channels=title_num_filters,
                    kernel_size=4,
                )

                self.title_dense = nn.Linear(title_num_filters * 3, embedding_dim)
                self.item_hidden = nn.Linear(embedding_dim * 2 + genre_embedding_dim, embedding_dim * 2)
                self.item_tower_vec = nn.Linear(embedding_dim * 2, embedding_dim)

                self.user_bias = nn.Embedding(num_users, 1)
                self.item_bias = nn.Embedding(num_items, 1)
                self.relu = nn.ReLU()

            def _encode_title(self, title_tokens: torch.Tensor) -> torch.Tensor:
                title_embed = self.title_embedding(title_tokens)
                title_embed = self.title_dropout(title_embed)
                title_embed = title_embed.transpose(1, 2)

                conv_2 = self.relu(self.title_conv_2(title_embed))
                conv_3 = self.relu(self.title_conv_3(title_embed))
                conv_4 = self.relu(self.title_conv_4(title_embed))
                pool_2 = conv_2.max(dim=2).values
                pool_3 = conv_3.max(dim=2).values
                pool_4 = conv_4.max(dim=2).values

                title_features = torch.cat([pool_2, pool_3, pool_4], dim=1)
                title_vec = self.relu(self.title_dense(title_features))
                return self.title_dropout(title_vec)

            def encode_user(self, user_ids: torch.Tensor) -> torch.Tensor:
                user_vec = self.user_embedding(user_ids)
                return self.user_dropout(user_vec)

            def encode_item(
                self,
                item_ids: torch.Tensor,
                title_tokens: torch.Tensor,
                genre_tokens: torch.Tensor,
            ) -> torch.Tensor:
                item_id_vec = self.item_id_embedding(item_ids)
                title_vec = self._encode_title(title_tokens)
                genre_embed = self.genre_embedding(genre_tokens)
                genre_vec = genre_embed.mean(dim=1)

                item_features = torch.cat([item_id_vec, title_vec, genre_vec], dim=1)
                item_features = self.relu(self.item_hidden(item_features))
                item_features = self.item_hidden_dropout(item_features)
                item_vec = self.relu(self.item_tower_vec(item_features))
                return self.item_dropout(item_vec)

            def forward(
                self,
                user_ids: torch.Tensor,
                item_ids: torch.Tensor,
                title_tokens: torch.Tensor,
                genre_tokens: torch.Tensor,
            ) -> torch.Tensor:
                user_vec = self.encode_user(user_ids)
                item_vec = self.encode_item(item_ids, title_tokens, genre_tokens)
                dot = (user_vec * item_vec).sum(dim=1)
                pred = dot + self.user_bias(user_ids).squeeze(1) + self.item_bias(item_ids).squeeze(1)
                return pred

        return _HybridNCFModule(
            embedding_dim=self.embedding_dim,
            title_embedding_dim=self.title_embedding_dim,
            title_num_filters=self.title_num_filters,
            genre_embedding_dim=self.genre_embedding_dim,
            dropout_rate=self.dropout_rate,
        )

    @staticmethod
    def _iter_slices(size: int, batch_size: int) -> Iterator[slice]:
        for start in range(0, size, batch_size):
            yield slice(start, min(start + batch_size, size))

    def fit(self, train_ratings: pd.DataFrame, movies: pd.DataFrame | None = None) -> "Option2DeepRecommender":
        import torch  # pyright: ignore[reportMissingImports]
        import torch.nn.functional as F  # pyright: ignore[reportMissingImports]

        users = sorted(train_ratings["user_id"].astype(int).unique().tolist())
        items = sorted(train_ratings["item_id"].astype(int).unique().tolist())
        self.user_to_idx = {u: i for i, u in enumerate(users)}
        self.idx_to_user = {i: u for u, i in self.user_to_idx.items()}
        self.item_to_idx = {m: i for i, m in enumerate(items)}
        self.idx_to_item = {i: m for m, i in self.item_to_idx.items()}
        self.global_mean = float(train_ratings["rating"].mean())

        if movies is None:
            movies = pd.DataFrame({"item_id": items, "title": [""] * len(items)})

        n_users, n_items = len(users), len(items)
        user_ids = train_ratings["user_id"].astype(int).map(self.user_to_idx).to_numpy(dtype=np.int32)
        item_ids = train_ratings["item_id"].astype(int).map(self.item_to_idx).to_numpy(dtype=np.int32)
        values = train_ratings["rating"].astype(float).to_numpy(dtype=np.float32) - self.global_mean

        self.user_seen_items = {}
        for row in train_ratings.itertuples(index=False):
            user_id = int(row.user_id)
            item_id = int(row.item_id)
            if user_id not in self.user_seen_items:
                self.user_seen_items[user_id] = set()
            self.user_seen_items[user_id].add(item_id)

        item_sum = np.zeros(n_items, dtype=np.float32)
        item_cnt = np.zeros(n_items, dtype=np.float32)
        for i_idx, rating in zip(item_ids, values + self.global_mean):
            item_sum[i_idx] += rating
            item_cnt[i_idx] += 1.0
        prior = max(float(self.popularity_prior_count), 0.0)
        self.item_popularity_score = (item_sum + prior * self.global_mean) / (item_cnt + prior)

        item_title_matrix = self._build_item_title_matrix(items, movies)
        item_genre_matrix = self._build_item_genre_matrix(items, movies)
        title_tokens_for_rows = item_title_matrix[item_ids]
        genre_tokens_for_rows = item_genre_matrix[item_ids]

        rating_range = max(self.max_rating - self.min_rating, 1e-6)
        rating_scaled = np.clip((values + self.global_mean - self.min_rating) / rating_range, 0.0, 1.0)
        sample_weights = (1.0 + np.power(rating_scaled, self.rating_weight_power)).astype(np.float32)

        vocab_size = max(1, len(self.title_word_to_idx))
        genre_vocab_size = max(1, len(self.genre_to_idx))
        self._set_torch_seed()
        model = self._build_model(
            num_users=n_users,
            num_items=n_items,
            vocab_size=vocab_size,
            genre_vocab_size=genre_vocab_size,
        )
        if torch.cuda.is_available():
            device = torch.device("cuda")
        elif getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
            device = torch.device("mps")
        else:
            device = torch.device("cpu")
        model = model.to(device)

        rng = np.random.default_rng(self.seed)
        idx = np.arange(len(values), dtype=np.int32)
        rng.shuffle(idx)

        user_ids = user_ids[idx]
        item_ids = item_ids[idx]
        values = values[idx]
        title_tokens_for_rows = title_tokens_for_rows[idx]
        genre_tokens_for_rows = genre_tokens_for_rows[idx]
        sample_weights = sample_weights[idx]

        val_size = 0
        if self.validation_split > 0 and len(values) >= 20:
            val_size = int(round(len(values) * self.validation_split))
            val_size = min(max(val_size, 1), len(values) - 1)
        split_at = len(values) - val_size

        train_user_t = torch.from_numpy(user_ids[:split_at].astype(np.int64)).to(device)
        train_item_t = torch.from_numpy(item_ids[:split_at].astype(np.int64)).to(device)
        train_title_t = torch.from_numpy(title_tokens_for_rows[:split_at].astype(np.int64)).to(device)
        train_genre_t = torch.from_numpy(genre_tokens_for_rows[:split_at].astype(np.int64)).to(device)
        train_y_t = torch.from_numpy(values[:split_at].astype(np.float32)).to(device)
        train_w_t = torch.from_numpy(sample_weights[:split_at].astype(np.float32)).to(device)

        if val_size > 0:
            val_user_t = torch.from_numpy(user_ids[split_at:].astype(np.int64)).to(device)
            val_item_t = torch.from_numpy(item_ids[split_at:].astype(np.int64)).to(device)
            val_title_t = torch.from_numpy(title_tokens_for_rows[split_at:].astype(np.int64)).to(device)
            val_genre_t = torch.from_numpy(genre_tokens_for_rows[split_at:].astype(np.int64)).to(device)
            val_y_t = torch.from_numpy(values[split_at:].astype(np.float32)).to(device)
            val_w_t = torch.from_numpy(sample_weights[split_at:].astype(np.float32)).to(device)
        else:
            val_user_t = None
            val_item_t = None
            val_title_t = None
            val_genre_t = None
            val_y_t = None
            val_w_t = None

        optimizer = torch.optim.Adam(
            model.parameters(),
            lr=self.lr,
            weight_decay=max(self.l2_reg, 0.0),
        )
        scheduler = None
        if val_size > 0 and self.lr_plateau_patience > 0:
            scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
                optimizer,
                mode="min",
                factor=self.lr_plateau_factor,
                patience=self.lr_plateau_patience,
                min_lr=self.min_lr,
            )

        history: Dict[str, List[float]] = {"loss": [], "mae": [], "rmse": [], "lr": []}
        if val_size > 0:
            history["val_loss"] = []
            history["val_mae"] = []
            history["val_rmse"] = []

        best_val_loss = float("inf")
        best_val_epoch = 0
        best_state = None
        epochs_without_improvement = 0
        min_delta = 1e-4
        early_stopping_patience = max(1, self.lr_plateau_patience + 1)

        for epoch in range(1, self.epochs + 1):
            model.train()
            permutation = torch.randperm(train_user_t.shape[0], device=device)
            train_loss_weighted_sum = 0.0
            train_weight_sum = 0.0
            train_abs_error = 0.0
            train_sq_error = 0.0
            train_samples = 0

            for batch_slice in self._iter_slices(train_user_t.shape[0], self.batch_size):
                batch_idx = permutation[batch_slice]
                batch_user = train_user_t[batch_idx]
                batch_item = train_item_t[batch_idx]
                batch_title = train_title_t[batch_idx]
                batch_genre = train_genre_t[batch_idx]
                batch_y = train_y_t[batch_idx]
                batch_w = train_w_t[batch_idx]

                preds = model(batch_user, batch_item, batch_title, batch_genre)
                huber = F.smooth_l1_loss(preds, batch_y, reduction="none")
                loss = (huber * batch_w).mean()

                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()

                with torch.no_grad():
                    err = preds - batch_y
                    train_loss_weighted_sum += float((huber * batch_w).sum().item())
                    train_weight_sum += float(batch_w.sum().item())
                    train_abs_error += float(torch.abs(err).sum().item())
                    train_sq_error += float(torch.square(err).sum().item())
                    train_samples += int(batch_y.shape[0])

            train_loss = train_loss_weighted_sum / max(train_weight_sum, 1e-8)
            train_mae = train_abs_error / max(train_samples, 1)
            train_rmse = float(np.sqrt(train_sq_error / max(train_samples, 1)))
            history["loss"].append(float(train_loss))
            history["mae"].append(float(train_mae))
            history["rmse"].append(float(train_rmse))
            history["lr"].append(float(optimizer.param_groups[0]["lr"]))

            if val_size > 0:
                model.eval()
                with torch.no_grad():
                    val_loss_weighted_sum = 0.0
                    val_weight_sum = 0.0
                    val_abs_error = 0.0
                    val_sq_error = 0.0
                    val_samples = 0

                    for batch_slice in self._iter_slices(val_user_t.shape[0], self.batch_size):
                        batch_user = val_user_t[batch_slice]
                        batch_item = val_item_t[batch_slice]
                        batch_title = val_title_t[batch_slice]
                        batch_genre = val_genre_t[batch_slice]
                        batch_y = val_y_t[batch_slice]
                        batch_w = val_w_t[batch_slice]

                        preds = model(batch_user, batch_item, batch_title, batch_genre)
                        huber = F.smooth_l1_loss(preds, batch_y, reduction="none")
                        err = preds - batch_y

                        val_loss_weighted_sum += float((huber * batch_w).sum().item())
                        val_weight_sum += float(batch_w.sum().item())
                        val_abs_error += float(torch.abs(err).sum().item())
                        val_sq_error += float(torch.square(err).sum().item())
                        val_samples += int(batch_y.shape[0])

                val_loss = val_loss_weighted_sum / max(val_weight_sum, 1e-8)
                val_mae = val_abs_error / max(val_samples, 1)
                val_rmse = float(np.sqrt(val_sq_error / max(val_samples, 1)))
                history["val_loss"].append(float(val_loss))
                history["val_mae"].append(float(val_mae))
                history["val_rmse"].append(float(val_rmse))

                if scheduler is not None:
                    scheduler.step(val_loss)

                if val_loss < best_val_loss - min_delta:
                    best_val_loss = float(val_loss)
                    best_val_epoch = epoch
                    best_state = copy.deepcopy(model.state_dict())
                    epochs_without_improvement = 0
                else:
                    epochs_without_improvement += 1

                print(
                    f"Epoch {epoch}/{self.epochs} - "
                    f"loss={train_loss:.4f} mae={train_mae:.4f} rmse={train_rmse:.4f} "
                    f"val_loss={val_loss:.4f} val_mae={val_mae:.4f} val_rmse={val_rmse:.4f}"
                )

                if epochs_without_improvement >= early_stopping_patience:
                    print("Early stopping triggered.")
                    break
            else:
                print(
                    f"Epoch {epoch}/{self.epochs} - "
                    f"loss={train_loss:.4f} mae={train_mae:.4f} rmse={train_rmse:.4f}"
                )

        if best_state is not None:
            model.load_state_dict(best_state)

        self.training_history = history
        if best_state is not None:
            self.training_history["best_val_epoch"] = [float(best_val_epoch)]
            self.training_history["best_val_loss"] = [float(best_val_loss)]

        model.eval()
        with torch.no_grad():
            all_user_idx = torch.arange(n_users, dtype=torch.long, device=device)
            user_vec_chunks: List[np.ndarray] = []
            for batch_slice in self._iter_slices(n_users, 4096):
                user_vec_chunks.append(model.encode_user(all_user_idx[batch_slice]).cpu().numpy())
            self.user_vectors = np.concatenate(user_vec_chunks, axis=0).astype(np.float32)

            all_item_idx = torch.arange(n_items, dtype=torch.long, device=device)
            item_title_t = torch.from_numpy(item_title_matrix.astype(np.int64)).to(device)
            item_genre_t = torch.from_numpy(item_genre_matrix.astype(np.int64)).to(device)
            item_vec_chunks: List[np.ndarray] = []
            for batch_slice in self._iter_slices(n_items, 4096):
                item_vec_chunks.append(
                    model.encode_item(
                        all_item_idx[batch_slice],
                        item_title_t[batch_slice],
                        item_genre_t[batch_slice],
                    )
                    .cpu()
                    .numpy()
                )
            self.item_vectors = np.concatenate(item_vec_chunks, axis=0).astype(np.float32)

            self.user_bias = model.user_bias.weight.cpu().numpy().reshape(-1).astype(np.float32)
            self.item_bias = model.item_bias.weight.cpu().numpy().reshape(-1).astype(np.float32)

        item_norms = np.linalg.norm(self.item_vectors, axis=1, keepdims=True)
        self.normalized_item_vectors = np.divide(
            self.item_vectors,
            np.maximum(item_norms, 1e-12),
            out=np.zeros_like(self.item_vectors),
            where=item_norms > 1e-12,
        )
        return self

    def predict(self, user_id: int, item_id: int) -> float:
        if self.user_vectors is None or self.item_vectors is None:
            raise RuntimeError("Model is not fitted.")

        pred = self.global_mean
        u_idx = self.user_to_idx.get(user_id)
        i_idx = self.item_to_idx.get(item_id)

        if u_idx is not None and self.user_bias is not None:
            pred += float(self.user_bias[u_idx])
        if i_idx is not None and self.item_bias is not None:
            pred += float(self.item_bias[i_idx])
        if u_idx is not None and i_idx is not None:
            pred += float(np.dot(self.user_vectors[u_idx], self.item_vectors[i_idx]))
        return float(np.clip(pred, self.min_rating, self.max_rating))

    def recommend_top_n(
        self,
        user_id: int,
        n: int = 10,
        exclude_seen: bool = True,
        seen_items: set[int] | None = None,
    ) -> List[Recommendation]:
        if (
            self.user_vectors is None
            or self.item_vectors is None
            or self.item_popularity_score is None
            or self.item_bias is None
            or self.user_bias is None
        ):
            raise RuntimeError("Model is not fitted.")

        if user_id not in self.user_to_idx:
            item_scores = self.item_popularity_score.copy()
            order = np.argsort(-item_scores)[:n]
            return [
                Recommendation(item_id=self.idx_to_item[i], score=float(item_scores[i]))
                for i in order
            ]

        u_idx = self.user_to_idx[user_id]
        user_vector = self.user_vectors[u_idx]
        preds = self.global_mean + self.user_bias[u_idx] + self.item_bias + self.item_vectors @ user_vector
        preds = np.clip(preds, self.min_rating, self.max_rating).astype(np.float32)

        if exclude_seen:
            preds = preds.copy()
            for seen_item_id in self.user_seen_items.get(user_id, set()):
                i_idx = self.item_to_idx.get(seen_item_id)
                if i_idx is not None:
                    preds[i_idx] = -np.inf

        if n <= 0:
            return []
        n = min(n, len(preds))
        candidate_idx = np.argpartition(-preds, n - 1)[:n]
        top_idx = candidate_idx[np.argsort(-preds[candidate_idx])]
        return [
            Recommendation(item_id=self.idx_to_item[int(idx)], score=float(preds[idx]))
            for idx in top_idx
            if np.isfinite(preds[idx])
        ]

    def similar_items(self, item_id: int, n: int = 10) -> List[Recommendation]:
        if self.normalized_item_vectors is None:
            raise RuntimeError("Model is not fitted.")
        if item_id not in self.item_to_idx:
            return []

        idx = self.item_to_idx[item_id]
        target = self.normalized_item_vectors[idx]
        sims = self.normalized_item_vectors @ target
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
