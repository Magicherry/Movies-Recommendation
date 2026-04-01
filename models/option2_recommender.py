from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List

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

    def _build_model(
        self,
        num_users: int,
        num_items: int,
        vocab_size: int,
        genre_vocab_size: int,
    ):
        import tensorflow as tf  # pyright: ignore[reportMissingImports]

        tf.random.set_seed(self.seed)
        regularizer = tf.keras.regularizers.l2(self.l2_reg) if self.l2_reg > 0 else None

        user_input = tf.keras.layers.Input(shape=(1,), dtype="int32", name="user_id")
        item_input = tf.keras.layers.Input(shape=(1,), dtype="int32", name="item_id")
        title_input = tf.keras.layers.Input(
            shape=(self.title_max_len,), dtype="int32", name="title_tokens"
        )
        genre_input = tf.keras.layers.Input(
            shape=(self.genre_max_len,), dtype="int32", name="genre_tokens"
        )

        user_embed = tf.keras.layers.Embedding(
            input_dim=num_users,
            output_dim=self.embedding_dim,
            name="user_embedding",
            embeddings_regularizer=regularizer,
        )(user_input)
        user_vec = tf.keras.layers.Flatten(name="user_flat")(user_embed)
        user_vec = tf.keras.layers.Dropout(self.dropout_rate, name="user_dropout")(user_vec)

        item_id_embed = tf.keras.layers.Embedding(
            input_dim=num_items,
            output_dim=self.embedding_dim,
            name="item_id_embedding",
            embeddings_regularizer=regularizer,
        )(item_input)
        item_id_vec = tf.keras.layers.Flatten(name="item_id_flat")(item_id_embed)

        title_embed = tf.keras.layers.Embedding(
            input_dim=vocab_size + 1,
            output_dim=self.title_embedding_dim,
            name="title_embedding",
            embeddings_regularizer=regularizer,
        )(title_input)
        title_embed = tf.keras.layers.SpatialDropout1D(
            self.dropout_rate, name="title_spatial_dropout"
        )(title_embed)

        conv_2 = tf.keras.layers.Conv1D(
            filters=self.title_num_filters,
            kernel_size=2,
            activation="relu",
            name="title_conv_2",
        )(title_embed)
        conv_3 = tf.keras.layers.Conv1D(
            filters=self.title_num_filters,
            kernel_size=3,
            activation="relu",
            name="title_conv_3",
        )(title_embed)
        conv_4 = tf.keras.layers.Conv1D(
            filters=self.title_num_filters,
            kernel_size=4,
            activation="relu",
            name="title_conv_4",
        )(title_embed)

        pool_2 = tf.keras.layers.GlobalMaxPooling1D(name="title_pool_2")(conv_2)
        pool_3 = tf.keras.layers.GlobalMaxPooling1D(name="title_pool_3")(conv_3)
        pool_4 = tf.keras.layers.GlobalMaxPooling1D(name="title_pool_4")(conv_4)
        title_features = tf.keras.layers.Concatenate(name="title_concat")([pool_2, pool_3, pool_4])
        title_vec = tf.keras.layers.Dense(
            self.embedding_dim,
            activation="relu",
            name="title_dense",
            kernel_regularizer=regularizer,
        )(title_features)
        title_vec = tf.keras.layers.Dropout(self.dropout_rate, name="title_dropout")(title_vec)

        genre_embed = tf.keras.layers.Embedding(
            input_dim=genre_vocab_size + 1,
            output_dim=self.genre_embedding_dim,
            name="genre_embedding",
            embeddings_regularizer=regularizer,
        )(genre_input)
        genre_vec = tf.keras.layers.GlobalAveragePooling1D(name="genre_pool")(genre_embed)

        item_features = tf.keras.layers.Concatenate(name="item_concat")(
            [item_id_vec, title_vec, genre_vec]
        )
        item_features = tf.keras.layers.Dense(
            self.embedding_dim * 2,
            activation="relu",
            name="item_hidden",
            kernel_regularizer=regularizer,
        )(item_features)
        item_features = tf.keras.layers.Dropout(self.dropout_rate, name="item_hidden_dropout")(item_features)
        item_vec = tf.keras.layers.Dense(
            self.embedding_dim,
            activation="relu",
            name="item_tower_vec",
            kernel_regularizer=regularizer,
        )(item_features)
        item_vec = tf.keras.layers.Dropout(self.dropout_rate, name="item_dropout")(item_vec)

        dot = tf.keras.layers.Dot(axes=1, name="tower_dot")([user_vec, item_vec])

        user_bias = tf.keras.layers.Embedding(num_users, 1, name="user_bias")(user_input)
        item_bias = tf.keras.layers.Embedding(num_items, 1, name="item_bias")(item_input)
        user_bias_vec = tf.keras.layers.Flatten(name="user_bias_flat")(user_bias)
        item_bias_vec = tf.keras.layers.Flatten(name="item_bias_flat")(item_bias)
        pred = tf.keras.layers.Add(name="prediction")([dot, user_bias_vec, item_bias_vec])

        model = tf.keras.Model(inputs=[user_input, item_input, title_input, genre_input], outputs=pred)
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=self.lr, clipnorm=1.0),
            loss=tf.keras.losses.Huber(delta=1.0),
            metrics=[
                tf.keras.metrics.MeanAbsoluteError(name="mae"),
                tf.keras.metrics.RootMeanSquaredError(name="rmse"),
            ],
        )

        user_tower = tf.keras.Model(inputs=user_input, outputs=user_vec)
        item_tower = tf.keras.Model(inputs=[item_input, title_input, genre_input], outputs=item_vec)
        return model, user_tower, item_tower

    def fit(self, train_ratings: pd.DataFrame, movies: pd.DataFrame | None = None) -> "Option2DeepRecommender":
        import tensorflow as tf  # pyright: ignore[reportMissingImports]

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
        user_ids = (
            train_ratings["user_id"].astype(int).map(self.user_to_idx).to_numpy(dtype=np.int32)
        )
        item_ids = (
            train_ratings["item_id"].astype(int).map(self.item_to_idx).to_numpy(dtype=np.int32)
        )
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
        model, user_tower, item_tower = self._build_model(
            num_users=n_users,
            num_items=n_items,
            vocab_size=vocab_size,
            genre_vocab_size=genre_vocab_size,
        )

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

        train_x = [
            user_ids[:split_at].reshape(-1, 1),
            item_ids[:split_at].reshape(-1, 1),
            title_tokens_for_rows[:split_at],
            genre_tokens_for_rows[:split_at],
        ]
        train_y = values[:split_at]
        train_w = sample_weights[:split_at]

        callbacks: List[tf.keras.callbacks.Callback] = []
        best_val_loss = np.inf
        best_val_epoch = 0
        best_weights: list[np.ndarray] | None = None

        class _BestModelSaver(tf.keras.callbacks.Callback):
            def on_epoch_end(self, epoch, logs=None):
                nonlocal best_val_loss, best_val_epoch, best_weights
                if not logs or "val_loss" not in logs:
                    return
                current_val_loss = float(logs["val_loss"])
                if current_val_loss < best_val_loss - 1e-8:
                    best_val_loss = current_val_loss
                    best_val_epoch = int(epoch) + 1
                    best_weights = self.model.get_weights()

        if val_size > 0:
            # Keep full training schedule, but always restore the best validation checkpoint.
            callbacks.append(_BestModelSaver())
            if self.lr_plateau_patience > 0:
                callbacks.append(
                    tf.keras.callbacks.ReduceLROnPlateau(
                        monitor="val_loss",
                        factor=self.lr_plateau_factor,
                        patience=self.lr_plateau_patience,
                        min_delta=1e-4,
                        min_lr=self.min_lr,
                        verbose=0,
                    )
                )
            callbacks.append(
                tf.keras.callbacks.EarlyStopping(
                    monitor="val_loss",
                    patience=max(1, self.lr_plateau_patience + 1),
                    verbose=1,
                    min_delta=1e-4,
                    restore_best_weights=False,
                )
            )

        fit_kwargs = {
            "x": train_x,
            "y": train_y,
            "sample_weight": train_w,
            "batch_size": self.batch_size,
            "epochs": self.epochs,
            "verbose": 1,
            "shuffle": True,
            "callbacks": callbacks,
        }
        if val_size > 0:
            val_x = [
                user_ids[split_at:].reshape(-1, 1),
                item_ids[split_at:].reshape(-1, 1),
                title_tokens_for_rows[split_at:],
                genre_tokens_for_rows[split_at:],
            ]
            val_y = values[split_at:]
            val_w = sample_weights[split_at:]
            fit_kwargs["validation_data"] = (val_x, val_y, val_w)

        history = model.fit(
            **fit_kwargs,
        )

        if best_weights is not None:
            model.set_weights(best_weights)

        self.training_history = {
            key: [float(v) for v in value]
            for key, value in history.history.items()
        }
        if best_weights is not None:
            self.training_history["best_val_epoch"] = [float(best_val_epoch)]
            self.training_history["best_val_loss"] = [float(best_val_loss)]

        user_idx_arr = np.arange(n_users, dtype=np.int32).reshape(-1, 1)
        item_idx_arr = np.arange(n_items, dtype=np.int32).reshape(-1, 1)

        self.user_vectors = user_tower.predict(user_idx_arr, batch_size=4096, verbose=0).astype(np.float32)
        self.item_vectors = item_tower.predict(
            [item_idx_arr, item_title_matrix, item_genre_matrix],
            batch_size=4096,
            verbose=0,
        ).astype(np.float32)
        self.user_bias = model.get_layer("user_bias").get_weights()[0].reshape(-1).astype(np.float32)
        self.item_bias = model.get_layer("item_bias").get_weights()[0].reshape(-1).astype(np.float32)

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

    def recommend_top_n(self, user_id: int, n: int = 10, exclude_seen: bool = True) -> List[Recommendation]:
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
