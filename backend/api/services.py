from __future__ import annotations

import os
import pickle
import json
import re
from pathlib import Path
from threading import Lock
import numbers
from typing import Any, Dict, List

import numpy as np
import pandas as pd


class RecommenderService:
    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parents[2]
        data_dir_env = os.environ.get("STREAMX_DATA_DIR", "").strip()
        self.artifacts_dir = Path(data_dir_env) if data_dir_env else (self.project_root / "models" / "artifacts")
        self._loaded = False
        self._lock = Lock()
        self._movies_loaded_path: Path | None = None
        self._movies_write_path: Path | None = None
        self._movies_mtime_ns: int | None = None
        self._active_model_state_path = self.artifacts_dir / "active_model.txt"
        self._active_model_mtime_ns: int | None = None

        self.models = {}
        self.active_model_name = "option1"
        self._active_model_data_loaded_for_name: str | None = None
        self.movies: pd.DataFrame | None = None
        self.movie_lookup: Dict[int, Dict[str, Any]] = {}
        self.movie_behavior_stats: pd.DataFrame = pd.DataFrame()
        self._movie_behavior_index: pd.DataFrame = pd.DataFrame()
        self.behavior_sorted_item_ids: List[int] = []
        self.users: List[int] = []
        self.user_history: Dict[int, List[Dict[str, Any]]] = {}
        self.user_ratings_by_user: Dict[int, List[tuple[int, float]]] = {}
        self.reference_ratings_path: Path | None = None
        self.ratings_df: pd.DataFrame | None = None
        self._model_train_user_ids: set[int] = set()
        self._model_train_item_ids: set[int] = set()
        self._active_reference_source_key: str | None = None
        self._ratings_cache_by_source_key: Dict[str, Dict[str, Any]] = {}
        self._movies_cache_by_source_key: Dict[str, Dict[str, Any]] = {}
        self._runtime_cache_artifact_by_model: Dict[str, Dict[str, Any] | None] = {}

    def _select_default_active_model(self) -> str:
        available = getattr(self, "_available_model_names", set())
        for candidate in ("option1", "option2", "option3_ridge", "option3_lasso", "option3_knn", "option4"):
            if candidate in available:
                return candidate
        return sorted(available)[0]

    def _resolve_reference_ratings_path(self, train_ratings_path: Path) -> Path:
        external_ratings_env = os.environ.get("STREAMX_RATINGS_PATH", "").strip()
        candidates: List[Path] = []
        if external_ratings_env:
            candidates.append(Path(external_ratings_env))
        for dataset_dir in self._resolve_dataset_dir_candidates():
            candidates.append(dataset_dir / "ratings.csv")
        candidates.append(train_ratings_path)

        for path in candidates:
            if path.exists():
                return path
        return train_ratings_path

    @staticmethod
    def _dedupe_paths(candidates: List[Path]) -> List[Path]:
        unique: List[Path] = []
        seen: set[str] = set()
        for path in candidates:
            key = str(path)
            if key in seen:
                continue
            seen.add(key)
            unique.append(path)
        return unique

    def _resolve_dataset_dir_candidates(self) -> List[Path]:
        candidates: List[Path] = []
        dataset_dir_env = os.environ.get("STREAMX_DATASET_DIR", "").strip()
        if dataset_dir_env:
            candidates.append(Path(dataset_dir_env))

        split_meta_path = self.artifacts_dir / "splits" / "split_meta.json"
        if split_meta_path.exists():
            try:
                with open(split_meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                dataset_dir = str(meta.get("dataset_dir", "")).strip()
                if dataset_dir:
                    candidates.append(Path(dataset_dir))
            except (OSError, ValueError, json.JSONDecodeError):
                pass

        candidates.append(self.project_root / "dataset" / "ml-latest")
        return self._dedupe_paths(candidates)

    def _resolve_dataset_movies_path(self) -> Path | None:
        for dataset_dir in self._resolve_dataset_dir_candidates():
            movies_path = dataset_dir / "movies.csv"
            if movies_path.exists():
                return movies_path
        return None

    @staticmethod
    def _read_ratings_any_format(path: Path) -> pd.DataFrame:
        columns = pd.read_csv(path, nrows=0).columns.tolist()

        if {"userId", "movieId", "rating"}.issubset(columns):
            ratings = pd.read_csv(
                path,
                usecols=["userId", "movieId", "rating"],
                dtype={"userId": "int32", "movieId": "int32", "rating": "float32"},
            ).rename(columns={"userId": "user_id", "movieId": "item_id"})
            return ratings[["user_id", "item_id", "rating"]]

        if {"user_id", "item_id", "rating"}.issubset(columns):
            ratings = pd.read_csv(
                path,
                usecols=["user_id", "item_id", "rating"],
                dtype={"user_id": "int32", "item_id": "int32", "rating": "float32"},
            )
            return ratings[["user_id", "item_id", "rating"]]

        raise ValueError(f"Unsupported ratings schema in {path}")

    @staticmethod
    def _build_source_fingerprint(path: Path) -> Dict[str, Any]:
        resolved = path.resolve()
        stat = resolved.stat()
        return {
            "path": str(resolved),
            "size_bytes": int(stat.st_size),
            "mtime_ns": int(stat.st_mtime_ns),
        }

    @staticmethod
    def _fingerprint_to_key(fingerprint: Dict[str, Any]) -> str:
        return "|".join(
            [
                str(fingerprint.get("path", "")),
                str(fingerprint.get("size_bytes", "")),
                str(fingerprint.get("mtime_ns", "")),
            ]
        )

    def _source_key_for_path(self, path: Path) -> str | None:
        try:
            return self._fingerprint_to_key(self._build_source_fingerprint(path))
        except OSError:
            return None

    def _resolve_runtime_cache_path(self, model_name: str) -> Path:
        return self.artifacts_dir / model_name / "runtime_cache.pkl"

    def _resolve_shared_runtime_cache_path(self) -> Path:
        return self.artifacts_dir / "runtime_cache_dataset.pkl"

    def _load_shared_runtime_cache_artifact(self) -> Dict[str, Any] | None:
        cache_key = "__shared_dataset__"
        if cache_key in self._runtime_cache_artifact_by_model:
            return self._runtime_cache_artifact_by_model[cache_key]

        cache_path = self._resolve_shared_runtime_cache_path()
        payload: Dict[str, Any] | None = None
        if cache_path.exists():
            try:
                with open(cache_path, "rb") as f:
                    loaded = pickle.load(f)
                if isinstance(loaded, dict):
                    payload = loaded
            except (OSError, pickle.PickleError, ValueError):
                payload = None

        self._runtime_cache_artifact_by_model[cache_key] = payload
        return payload

    def _load_runtime_cache_artifact(self, model_name: str) -> Dict[str, Any] | None:
        if model_name in self._runtime_cache_artifact_by_model:
            return self._runtime_cache_artifact_by_model[model_name]

        cache_path = self._resolve_runtime_cache_path(model_name)
        payload: Dict[str, Any] | None = None
        if cache_path.exists():
            try:
                with open(cache_path, "rb") as f:
                    loaded = pickle.load(f)
                if isinstance(loaded, dict):
                    payload = loaded
            except (OSError, pickle.PickleError, ValueError):
                payload = None

        self._runtime_cache_artifact_by_model[model_name] = payload
        return payload

    @staticmethod
    def _normalize_behavior_stats_frame(frame: pd.DataFrame) -> pd.DataFrame:
        if frame.empty:
            return pd.DataFrame(columns=["item_id", "watched_count", "high_rating_count", "avg_rating", "behavior_score"])

        normalized = frame.copy()
        normalized["item_id"] = normalized["item_id"].astype(int)
        normalized["watched_count"] = normalized["watched_count"].astype(int)
        normalized["high_rating_count"] = normalized["high_rating_count"].astype(int)
        normalized["avg_rating"] = normalized["avg_rating"].astype(float)
        normalized["behavior_score"] = normalized["behavior_score"].astype(float)
        return normalized

    def _set_movie_behavior_stats(self, frame: pd.DataFrame, behavior_sorted_item_ids: List[int] | None = None) -> None:
        normalized = self._normalize_behavior_stats_frame(frame)
        self.movie_behavior_stats = normalized
        self._movie_behavior_index = (
            normalized.set_index("item_id")[["watched_count", "high_rating_count", "avg_rating", "behavior_score"]]
            if not normalized.empty
            else pd.DataFrame()
        )
        if behavior_sorted_item_ids is not None:
            self.behavior_sorted_item_ids = [int(item_id) for item_id in behavior_sorted_item_ids]
            return
        if normalized.empty:
            self.behavior_sorted_item_ids = []
            return
        self.behavior_sorted_item_ids = (
            normalized.sort_values(
                ["behavior_score", "avg_rating", "watched_count", "item_id"],
                ascending=[False, False, False, True],
                kind="mergesort",
            )["item_id"].astype(int).tolist()
        )

    @staticmethod
    def _normalize_movie_lookup_row(row: Any) -> Dict[str, Any]:
        raw_tmdb_id = getattr(row, "tmdb_id", "")
        if pd.isna(raw_tmdb_id):
            norm_tmdb_id = ""
        elif isinstance(raw_tmdb_id, float) and raw_tmdb_id.is_integer():
            norm_tmdb_id = str(int(raw_tmdb_id))
        else:
            norm_tmdb_id = str(raw_tmdb_id).strip()

        cast_str = getattr(row, "cast", "")
        directors_str = getattr(row, "directors", "")

        try:
            cast_data = json.loads(cast_str) if cast_str else []
        except json.JSONDecodeError:
            cast_data = []

        try:
            directors_data = json.loads(directors_str) if directors_str else []
        except json.JSONDecodeError:
            directors_data = []

        return {
            "item_id": int(row.item_id),
            "title": row.title,
            "scraped_title": getattr(row, "scraped_title", ""),
            "genres": row.genres,
            "poster_url": getattr(row, "poster_url", ""),
            "backdrop_url": getattr(row, "backdrop_url", ""),
            "overview": getattr(row, "overview", ""),
            "tmdb_id": norm_tmdb_id,
            "cast": cast_data,
            "directors": directors_data,
        }

    def _load_movies_from_path(self, source_path: Path) -> None:
        source_key = self._source_key_for_path(source_path)
        if source_key and source_key in self._movies_cache_by_source_key:
            cached = self._movies_cache_by_source_key[source_key]
            self.movies = cached["movies"]
            self.movie_lookup = cached["movie_lookup"]
            self._movies_loaded_path = source_path
            self._movies_mtime_ns = int(cached["mtime_ns"])
            self._sync_user_history_metadata()
            return

        frame = pd.read_csv(source_path)
        if "item_id" not in frame.columns and "movieId" in frame.columns:
            frame = frame.rename(columns={"movieId": "item_id"})
        if "item_id" not in frame.columns:
            raise ValueError(f"Unsupported movies schema in {source_path}: missing 'item_id' or 'movieId'")
        frame["item_id"] = pd.to_numeric(frame["item_id"], errors="coerce")
        frame = frame.dropna(subset=["item_id"]).copy()
        frame["item_id"] = frame["item_id"].astype(int)
        text_cols = ("poster_url", "backdrop_url", "overview", "tmdb_id", "scraped_title", "cast", "directors")
        for col in text_cols:
            if col not in frame.columns:
                frame[col] = ""
            frame[col] = frame[col].astype("string").fillna("")
        for col in frame.columns:
            if col not in text_cols and pd.api.types.is_object_dtype(frame[col]):
                frame[col] = frame[col].fillna("")

        self.movies = frame
        self.movie_lookup = {}
        for row in frame.itertuples(index=False):
            self.movie_lookup[int(row.item_id)] = self._normalize_movie_lookup_row(row)

        self._movies_loaded_path = source_path
        try:
            self._movies_mtime_ns = source_path.stat().st_mtime_ns
        except OSError:
            self._movies_mtime_ns = None

        if source_key and self._movies_mtime_ns is not None:
            self._movies_cache_by_source_key[source_key] = {
                "movies": self.movies,
                "movie_lookup": self.movie_lookup,
                "mtime_ns": int(self._movies_mtime_ns),
            }

        self._sync_user_history_metadata()

    def _sync_user_history_metadata(self) -> None:
        if not self.user_history:
            return
        for history in self.user_history.values():
            for item in history:
                iid = int(item.get("item_id", -1))
                meta = self.movie_lookup.get(iid)
                if not meta:
                    continue
                item["title"] = meta.get("title", item.get("title", "Unknown"))
                item["scraped_title"] = meta.get("scraped_title", item.get("scraped_title", ""))
                item["genres"] = meta.get("genres", item.get("genres", ""))
                item["poster_url"] = meta.get("poster_url", item.get("poster_url", ""))
                item["backdrop_url"] = meta.get("backdrop_url", item.get("backdrop_url", ""))
                item["overview"] = meta.get("overview", item.get("overview", ""))
                item["tmdb_id"] = meta.get("tmdb_id", item.get("tmdb_id", ""))

    def _sync_user_history_for_item(self, item_id: int) -> None:
        if not self.user_history:
            return
        meta = self.movie_lookup.get(item_id)
        if not meta:
            return
        for history in self.user_history.values():
            for item in history:
                if int(item.get("item_id", -1)) != item_id:
                    continue
                item["title"] = meta.get("title", item.get("title", "Unknown"))
                item["scraped_title"] = meta.get("scraped_title", item.get("scraped_title", ""))
                item["genres"] = meta.get("genres", item.get("genres", ""))
                item["poster_url"] = meta.get("poster_url", item.get("poster_url", ""))
                item["backdrop_url"] = meta.get("backdrop_url", item.get("backdrop_url", ""))
                item["overview"] = meta.get("overview", item.get("overview", ""))
                item["tmdb_id"] = meta.get("tmdb_id", item.get("tmdb_id", ""))

    @staticmethod
    def _first_existing_path(candidates: List[Path]) -> Path | None:
        for path in candidates:
            if path.exists():
                return path
        return None

    def _resolve_model_data_paths(self, model_name: str) -> Dict[str, Path | None]:
        model_dir = self.artifacts_dir / model_name
        # Metadata is shared; training split is model-specific.
        fallback_dir = self.artifacts_dir / "option1"
        dataset_movies_path = self._resolve_dataset_movies_path()

        movies_candidates = self._dedupe_paths(
            ([dataset_movies_path] if dataset_movies_path is not None else [])
            + [self.artifacts_dir / "movies.csv", model_dir / "movies.csv", fallback_dir / "movies.csv"]
        )
        train_candidates = [
            model_dir / "train_ratings.csv",
        ]
        dataset_enriched_path = (
            dataset_movies_path.parent / "movies_enriched.csv"
            if dataset_movies_path is not None
            else None
        )
        enriched_candidates = self._dedupe_paths(
            ([dataset_enriched_path] if dataset_enriched_path is not None else [])
            + [
                self.artifacts_dir / "movies_enriched.csv",
                model_dir / "movies_enriched.csv",
                fallback_dir / "movies_enriched.csv",
            ]
        )

        movies_path = self._first_existing_path(movies_candidates)
        if movies_path is None:
            raise FileNotFoundError(
                f"Data files for model '{model_name}' not found. Run: python -m scripts.train_and_evaluate --model-type {model_name}"
            )

        train_ratings_path = self._first_existing_path(train_candidates)
        if train_ratings_path is None:
            raise FileNotFoundError(
                f"train_ratings.csv for model '{model_name}' not found. Run training for this model: "
                f"python -m scripts.train_and_evaluate --model-type {model_name}"
            )
        # Keep enriched metadata beside the canonical movies.csv source when possible.
        preferred_enriched_write_path = (
            dataset_enriched_path if dataset_enriched_path is not None else (self.artifacts_dir / "movies_enriched.csv")
        )
        source_enriched_path = self._first_existing_path(enriched_candidates)

        return {
            "movies_path": movies_path,
            "train_ratings_path": train_ratings_path,
            "enriched_source_path": source_enriched_path,
            "enriched_write_path": preferred_enriched_write_path,
        }

    @staticmethod
    def _build_user_ratings_by_user(ratings: pd.DataFrame) -> Dict[int, List[tuple[int, float]]]:
        ordered = ratings.sort_values(["user_id", "rating", "item_id"], ascending=[True, False, True], kind="mergesort")
        user_ratings: Dict[int, List[tuple[int, float]]] = {}
        for row in ordered.itertuples(index=False):
            user_ratings.setdefault(int(row.user_id), []).append((int(row.item_id), float(row.rating)))
        return user_ratings

    def _build_ratings_cache_entry(
        self,
        ratings: pd.DataFrame,
        reference_path: Path,
        *,
        include_ratings_df: bool,
    ) -> Dict[str, Any]:
        normalized = ratings[["user_id", "item_id", "rating"]].copy()
        normalized["user_id"] = normalized["user_id"].astype(int)
        normalized["item_id"] = normalized["item_id"].astype(int)
        normalized["rating"] = normalized["rating"].astype(float)

        behavior_stats = normalized.groupby("item_id").agg(
            watched_count=("user_id", "nunique"),
            high_rating_count=("rating", lambda s: int((s >= 4.0).sum())),
            avg_rating=("rating", "mean"),
        )
        behavior_stats["behavior_score"] = (
            behavior_stats["high_rating_count"] * 2.0
            + behavior_stats["watched_count"]
            + behavior_stats["avg_rating"] / 5.0
        )
        behavior_stats = behavior_stats.reset_index()
        behavior_stats = self._normalize_behavior_stats_frame(behavior_stats)
        behavior_sorted_item_ids = (
            behavior_stats.sort_values(
                ["behavior_score", "avg_rating", "watched_count", "item_id"],
                ascending=[False, False, False, True],
                kind="mergesort",
            )["item_id"].astype(int).tolist()
            if not behavior_stats.empty
            else []
        )

        rating_dist: Dict[float, int] = {}
        for rating, count in normalized["rating"].value_counts().items():
            rounded = round(float(rating) * 2) / 2
            rating_dist[rounded] = rating_dist.get(rounded, 0) + int(count)

        source_key = self._source_key_for_path(reference_path)
        if source_key is None:
            raise FileNotFoundError(f"Cannot fingerprint ratings source: {reference_path}")

        return {
            "source_key": source_key,
            "users": sorted(normalized["user_id"].astype(int).unique().tolist()),
            "user_rating_counts": {int(uid): int(count) for uid, count in normalized["user_id"].value_counts().items()},
            "movie_rating_counts": {int(iid): int(count) for iid, count in normalized["item_id"].value_counts().items()},
            "rating_distribution": [{"rating": str(k), "count": int(v)} for k, v in sorted(rating_dist.items())],
            "total_ratings": int(len(normalized)),
            "average_rating": float(normalized["rating"].mean()) if len(normalized) > 0 else 0.0,
            "movie_behavior_stats": behavior_stats,
            "behavior_sorted_item_ids": behavior_sorted_item_ids,
            "user_ratings_by_user": self._build_user_ratings_by_user(normalized),
            "ratings_df": normalized if include_ratings_df else None,
        }

    def _build_ratings_cache_entry_from_variant(self, variant: Dict[str, Any], reference_path: Path) -> Dict[str, Any] | None:
        source = variant.get("source")
        if not isinstance(source, dict):
            return None

        source_key = self._fingerprint_to_key(source)
        behavior_raw = variant.get("movie_behavior_stats", [])
        behavior_stats = self._normalize_behavior_stats_frame(pd.DataFrame(behavior_raw))

        user_ratings_raw = variant.get("user_ratings_by_user", {})
        if not isinstance(user_ratings_raw, dict):
            return None

        user_ratings_by_user: Dict[int, List[tuple[int, float]]] = {}
        for raw_user_id, rows in user_ratings_raw.items():
            try:
                user_id = int(raw_user_id)
            except (TypeError, ValueError):
                continue
            if not isinstance(rows, list):
                continue
            normalized_rows: List[tuple[int, float]] = []
            for row in rows:
                if not isinstance(row, (list, tuple)) or len(row) != 2:
                    continue
                try:
                    normalized_rows.append((int(row[0]), float(row[1])))
                except (TypeError, ValueError):
                    continue
            user_ratings_by_user[user_id] = normalized_rows

        return {
            "source_key": source_key,
            "users": [int(user_id) for user_id in variant.get("users", [])],
            "user_rating_counts": {
                int(user_id): int(count)
                for user_id, count in (variant.get("user_rating_counts", {}) or {}).items()
            },
            "movie_rating_counts": {
                int(item_id): int(count)
                for item_id, count in (variant.get("movie_rating_counts", {}) or {}).items()
            },
            "rating_distribution": list(variant.get("rating_distribution", [])),
            "total_ratings": int(variant.get("total_ratings", 0) or 0),
            "average_rating": float(variant.get("average_rating", 0.0) or 0.0),
            "movie_behavior_stats": behavior_stats,
            "behavior_sorted_item_ids": [int(item_id) for item_id in variant.get("behavior_sorted_item_ids", [])],
            "user_ratings_by_user": user_ratings_by_user,
            "ratings_df": None,
        }

    def _find_matching_runtime_cache_variant(
        self,
        payload: Dict[str, Any] | None,
        source_key: str,
    ) -> Dict[str, Any] | None:
        if not payload:
            return None

        variants = payload.get("variants", [])
        if not isinstance(variants, list):
            return None

        for variant in variants:
            if not isinstance(variant, dict):
                continue
            source = variant.get("source")
            if isinstance(source, dict) and self._fingerprint_to_key(source) == source_key:
                return variant
        return None

    def _find_runtime_cache_variant(self, model_name: str, reference_path: Path) -> Dict[str, Any] | None:
        source_key = self._source_key_for_path(reference_path)
        if source_key is None:
            return None

        shared_variant = self._find_matching_runtime_cache_variant(
            self._load_shared_runtime_cache_artifact(),
            source_key,
        )
        if shared_variant is not None:
            return shared_variant

        return self._find_matching_runtime_cache_variant(
            self._load_runtime_cache_artifact(model_name),
            source_key,
        )

    def _apply_ratings_cache_entry(self, entry: Dict[str, Any], reference_path: Path) -> None:
        self.reference_ratings_path = reference_path
        self._last_reference_ratings_path = reference_path
        self._active_reference_source_key = str(entry.get("source_key") or "")
        self.users = list(entry.get("users", []))
        self.user_rating_counts = dict(entry.get("user_rating_counts", {}))
        self.movie_rating_counts = dict(entry.get("movie_rating_counts", {}))
        self.rating_distribution = list(entry.get("rating_distribution", []))
        self.total_ratings = int(entry.get("total_ratings", 0) or 0)
        self.average_rating = float(entry.get("average_rating", 0.0) or 0.0)
        self.user_ratings_by_user = dict(entry.get("user_ratings_by_user", {}))
        self.ratings_df = entry.get("ratings_df")
        self._set_movie_behavior_stats(
            entry.get("movie_behavior_stats", pd.DataFrame()),
            behavior_sorted_item_ids=entry.get("behavior_sorted_item_ids"),
        )

    def _ensure_full_reference_ratings_loaded(self) -> None:
        reference_path = self.reference_ratings_path
        if reference_path is None or not reference_path.exists():
            return

        source_key = self._active_reference_source_key or self._source_key_for_path(reference_path)
        if source_key is None:
            return

        cached = self._ratings_cache_by_source_key.get(source_key)
        if cached is not None and cached.get("ratings_df") is not None:
            self._apply_ratings_cache_entry(cached, reference_path)
            return

        ratings = self._read_ratings_any_format(reference_path)
        if cached is None:
            cached = self._build_ratings_cache_entry(ratings, reference_path, include_ratings_df=True)
        else:
            cached = dict(cached)
            cached["ratings_df"] = ratings[["user_id", "item_id", "rating"]].copy()
        self._ratings_cache_by_source_key[source_key] = cached
        self._apply_ratings_cache_entry(cached, reference_path)

    def _load_ratings_from_path(self, train_ratings_path: Path | None) -> None:
        if train_ratings_path is None or not train_ratings_path.exists():
            raise FileNotFoundError("Model-specific train_ratings.csv not found.")

        reference_path = self._resolve_reference_ratings_path(train_ratings_path)
        
        # Load model-specific train ratings
        if getattr(self, "_last_train_ratings_path", None) != train_ratings_path:
            model_ratings = pd.read_csv(
                train_ratings_path,
                usecols=["user_id", "item_id", "rating"],
                dtype={"user_id": "int32", "item_id": "int32", "rating": "float32"},
            )
            self._model_train_user_ids = set(model_ratings["user_id"].astype(int).unique().tolist())
            self._model_train_item_ids = set(model_ratings["item_id"].astype(int).unique().tolist())
            self._last_train_ratings_path = train_ratings_path

        # Optimization: Skip expensive reference csv reloading if source path is identical.
        if (
            getattr(self, "_last_reference_ratings_path", None) == reference_path
            and self._active_reference_source_key == self._source_key_for_path(reference_path)
            and self.users
        ):
            return

        source_key = self._source_key_for_path(reference_path)
        if source_key is not None:
            cached_entry = self._ratings_cache_by_source_key.get(source_key)
            if cached_entry is not None:
                self._apply_ratings_cache_entry(cached_entry, reference_path)
                return

            runtime_variant = self._find_runtime_cache_variant(self.active_model_name, reference_path)
            if runtime_variant is not None:
                runtime_entry = self._build_ratings_cache_entry_from_variant(runtime_variant, reference_path)
                if runtime_entry is not None:
                    self._ratings_cache_by_source_key[source_key] = runtime_entry
                    self._apply_ratings_cache_entry(runtime_entry, reference_path)
                    return

        ratings = self._read_ratings_any_format(reference_path)
        entry = self._build_ratings_cache_entry(ratings, reference_path, include_ratings_df=True)
        self._ratings_cache_by_source_key[entry["source_key"]] = entry
        self._apply_ratings_cache_entry(entry, reference_path)

    def _fallback_popular_items(
        self,
        n: int,
        exclude_items: set[int] | None = None,
        preferred_genres: set[str] | None = None,
        target_year: int | None = None,
        score_mode: str = "behavior",
    ) -> List[Dict[str, Any]]:
        if self.movie_behavior_stats.empty or self.movies is None or n <= 0:
            return []

        exclude = exclude_items or set()
        genre_pref = preferred_genres or set()
        behavior_map = self._movie_behavior_index

        # Build a ranked candidate table from database-wide behavior signals.
        ranked = self.movies[["item_id", "title", "genres"]].copy()
        ranked["item_id"] = ranked["item_id"].astype(int)
        ranked = ranked[~ranked["item_id"].isin(exclude)]
        if ranked.empty:
            return []

        ranked["watched_count"] = ranked["item_id"].map(behavior_map["watched_count"]).fillna(0.0)
        ranked["avg_rating"] = ranked["item_id"].map(behavior_map["avg_rating"]).fillna(0.0)
        ranked["behavior_score"] = ranked["item_id"].map(behavior_map["behavior_score"]).fillna(0.0)

        if genre_pref:
            ranked["genre_overlap"] = ranked["genres"].fillna("").map(
                lambda raw: len(genre_pref.intersection({g for g in str(raw).split("|") if g and g != "(no genres listed)"}))
            )
            genre_filtered = ranked[ranked["genre_overlap"] > 0]
            if not genre_filtered.empty:
                ranked = genre_filtered
        else:
            ranked["genre_overlap"] = 0

        if target_year is not None:
            years = ranked["title"].str.extract(r"\((\d{4})\)\s*$", expand=False).fillna("0").astype(int)
            ranked["year_distance"] = (years - int(target_year)).abs()
        else:
            ranked["year_distance"] = 9999

        ranked = ranked.sort_values(
            ["genre_overlap", "behavior_score", "avg_rating", "watched_count", "year_distance", "item_id"],
            ascending=[False, False, False, False, True, True],
            kind="mergesort",
        ).head(n)

        mode = str(score_mode).strip().lower()
        if mode == "rating":
            ranked["display_score"] = ranked["avg_rating"].clip(lower=0.5, upper=5.0)
            score_source = "fallback_rating"
        elif mode == "similarity":
            behavior_values = ranked["behavior_score"].astype(float)
            min_v = float(behavior_values.min()) if len(behavior_values) else 0.0
            max_v = float(behavior_values.max()) if len(behavior_values) else 0.0
            if max_v - min_v > 1e-9:
                ranked["display_score"] = (behavior_values - min_v) / (max_v - min_v)
            else:
                ranked["display_score"] = 1.0
            score_source = "fallback_similarity"
        else:
            ranked["display_score"] = ranked["behavior_score"]
            score_source = "fallback_behavior"

        rows: List[Dict[str, Any]] = []
        for item_id, score in zip(ranked["item_id"], ranked["display_score"]):
            meta = self.movie_lookup.get(
                int(item_id),
                {
                    "item_id": int(item_id),
                    "title": "Unknown",
                    "scraped_title": "",
                    "genres": "",
                    "poster_url": "",
                    "backdrop_url": "",
                    "overview": "",
                    "tmdb_id": "",
                },
            )
            rows.append(
                {
                    "item_id": int(item_id),
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(score),
                    "score_source": score_source,
                    "is_fallback_score": True,
                }
            )
        return rows

    def _load_active_model_data(self) -> None:
        paths = self._resolve_model_data_paths(self.active_model_name)
        movies_path = paths["movies_path"]
        train_ratings_path = paths["train_ratings_path"]
        enriched_source_path = paths["enriched_source_path"]
        enriched_write_path = paths["enriched_write_path"]

        assert movies_path is not None
        assert enriched_write_path is not None
        self._movies_write_path = enriched_write_path
        source_path = enriched_source_path if enriched_source_path is not None and enriched_source_path.exists() else movies_path
        
        # Optimization: Skip expensive movies.csv reloading if source path is identical
        if getattr(self, "_movies_loaded_path", None) != source_path or self.movies is None:
            self._load_movies_from_path(source_path)
            
        self._load_ratings_from_path(train_ratings_path)
        self._active_model_data_loaded_for_name = self.active_model_name

    def _load_active_model_from_disk(self) -> None:
        path = self._active_model_state_path
        if not path.exists():
            return
        try:
            model_name = path.read_text(encoding="utf-8").strip()
        except OSError:
            return
        if model_name in self.models:
            self.active_model_name = model_name
        try:
            self._active_model_mtime_ns = path.stat().st_mtime_ns
        except OSError:
            self._active_model_mtime_ns = None

    def _persist_active_model_to_disk(self) -> None:
        path = self._active_model_state_path
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(self.active_model_name, encoding="utf-8")
            self._active_model_mtime_ns = path.stat().st_mtime_ns
        except OSError:
            self._active_model_mtime_ns = None

    def _ensure_active_model_fresh(self, load_data: bool = True) -> None:
        self._ensure_loaded()
        path = self._active_model_state_path
        needs_check = False
        
        if path.exists():
            try:
                mtime_ns = path.stat().st_mtime_ns
                if self._active_model_mtime_ns is None or mtime_ns > self._active_model_mtime_ns:
                    needs_check = True
            except OSError:
                pass
                
        if not needs_check and (not load_data or self.active_model_name == self._active_model_data_loaded_for_name):
            return

        with self._lock:
            if path.exists():
                try:
                    mtime_ns = path.stat().st_mtime_ns
                    if self._active_model_mtime_ns is None or mtime_ns > self._active_model_mtime_ns:
                        model_name = path.read_text(encoding="utf-8").strip()
                        if model_name in self.models:
                            self.active_model_name = model_name
                        self._active_model_mtime_ns = mtime_ns
                except OSError:
                    pass
            
            if load_data and self.active_model_name != self._active_model_data_loaded_for_name:
                self._load_active_model_data()

    def _resolve_active_movies_path(self) -> Path | None:
        if self._movies_write_path and self._movies_write_path.exists():
            return self._movies_write_path
        return self._movies_loaded_path

    def _ensure_movie_data_fresh(self) -> None:
        self._ensure_active_model_fresh()
        source_path = self._resolve_active_movies_path()
        if source_path is None or not source_path.exists():
            return
        try:
            mtime_ns = source_path.stat().st_mtime_ns
        except OSError:
            return
        if (
            self._movies_loaded_path == source_path
            and self._movies_mtime_ns is not None
            and mtime_ns <= self._movies_mtime_ns
        ):
            return
        with self._lock:
            source_path = self._resolve_active_movies_path()
            if source_path is None or not source_path.exists():
                return
            try:
                mtime_ns = source_path.stat().st_mtime_ns
            except OSError:
                return
            if (
                self._movies_loaded_path == source_path
                and self._movies_mtime_ns is not None
                and mtime_ns <= self._movies_mtime_ns
            ):
                return
            self._load_movies_from_path(source_path)

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            self._available_model_names = set()
            
            # Scan available models without loading them into memory (save 30s)
            for path in [(self.artifacts_dir / "option1" / "model.pkl", "option1"),
                         (self.artifacts_dir / "option2" / "model.pkl", "option2"),
                         (self.artifacts_dir / "option3_ridge" / "model.pkl", "option3_ridge"),
                         (self.artifacts_dir / "option3_lasso" / "model.pkl", "option3_lasso"),
                         (self.artifacts_dir / "option3_knn" / "model.pkl", "option3_knn"),
                         (self.artifacts_dir / "option4" / "model.pkl", "option4"),
                         (self.artifacts_dir / "model_option1.pkl", "option1"),
                         (self.artifacts_dir / "model_option2.pkl", "option2"),
                         (self.artifacts_dir / "model_option3_ridge.pkl", "option3_ridge"),
                         (self.artifacts_dir / "model_option3_lasso.pkl", "option3_lasso"),
                         (self.artifacts_dir / "model_option3_knn.pkl", "option3_knn"),
                         (self.artifacts_dir / "model_option4.pkl", "option4"),
                         (self.artifacts_dir / "model.pkl", "option1")]:
                if path[0].exists():
                    self._available_model_names.add(path[1])
            
            if not getattr(self, '_available_model_names', None):
                raise FileNotFoundError("No models found. Run training script.")
            
            # Resolve and persist active model so it survives reloads and cross-process requests.
            self._load_active_model_from_disk()
            if self.active_model_name not in getattr(self, '_available_model_names', set()):
                self.active_model_name = self._select_default_active_model()
            self._persist_active_model_to_disk()
            # Leave movies / ratings lazy. They are loaded only when a request needs
            # active-user recommendation data, not during generic engine setup.
            self._loaded = True

    def list_movies(
        self,
        limit: int = 50,
        offset: int = 0,
        query: str | None = None,
        genre: str | None = None,
        year: str | None = None,
        sort_by: str = "year",
        sort_order: str = "desc",
    ) -> Dict[str, Any]:
        self._ensure_movie_data_fresh()
        assert self.movies is not None
        frame = self.movies

        if query:
            q = query.strip().lower()
            title_lower = frame["title"].str.lower()
            scraped_title_lower = (
                frame["scraped_title"].str.lower()
                if "scraped_title" in frame.columns
                else pd.Series([""] * len(frame), index=frame.index)
            )
            title_normalized = (
                frame["title"]
                .str.replace(r"\s*\([^)]*\)\s*", " ", regex=True)
                .str.replace(r"\s+", " ", regex=True)
                .str.strip()
                .str.lower()
            )
            mask = (
                title_lower.str.contains(q, na=False, regex=False)
                | title_normalized.str.contains(q, na=False, regex=False)
                | scraped_title_lower.str.contains(q, na=False, regex=False)
            )
            frame = frame[mask]
        
        if genre:
            for g in genre.strip().split("|"):
                if g.strip():
                    frame = frame[frame["genres"].str.contains(g.strip(), case=False, na=False, regex=False)]
            
        if year:
            frame = frame[frame["title"].str.contains(f"({year.strip()})", regex=False, na=False)]

        sort_by = sort_by if sort_by in {
            "item_id",
            "title",
            "year",
            "watched_count",
            "high_rating_count",
            "avg_rating",
            "behavior_score",
        } else "item_id"
        sort_order = sort_order.lower()
        ascending = sort_order != "desc"

        if (
            not query
            and not genre
            and not year
            and sort_by == "behavior_score"
            and not ascending
            and self.behavior_sorted_item_ids
        ):
            total = len(self.behavior_sorted_item_ids)
            page_ids = self.behavior_sorted_item_ids[offset : offset + limit]
            if not page_ids:
                return {"total": total, "items": []}

            order_map = {int(item_id): idx for idx, item_id in enumerate(page_ids)}
            page_frame = frame[frame["item_id"].isin(page_ids)].copy()
            if not self._movie_behavior_index.empty:
                for stat_col in ("watched_count", "high_rating_count", "avg_rating", "behavior_score"):
                    page_frame[stat_col] = page_frame["item_id"].map(self._movie_behavior_index[stat_col]).fillna(0.0)
            page_frame["_order"] = page_frame["item_id"].map(order_map)
            page_frame = page_frame.sort_values("_order", kind="mergesort")
            page_frame = page_frame[[c for c in page_frame.columns if c != "_order"]]
            return {"total": total, "items": page_frame.to_dict(orient="records")}

        sortable = frame.copy()
        if not self.movie_behavior_stats.empty:
            sortable = sortable.merge(self.movie_behavior_stats, on="item_id", how="left")
        for stat_col in ("watched_count", "high_rating_count", "avg_rating", "behavior_score"):
            if stat_col not in sortable.columns:
                sortable[stat_col] = 0.0
            sortable[stat_col] = sortable[stat_col].fillna(0.0)

        if sort_by == "title":
            scraped_title_clean = (
                sortable["scraped_title"].fillna("").astype("string").str.strip()
                if "scraped_title" in sortable.columns
                else pd.Series([""] * len(sortable), index=sortable.index, dtype="string")
            )
            base_sort_title = (
                scraped_title_clean.where(scraped_title_clean != "", sortable["title"])
                if "scraped_title" in sortable.columns
                else sortable["title"]
            )
            sortable["_sort_title"] = base_sort_title.astype("string").str.replace(
                r"\s*\(\d{4}\)\s*$", "", regex=True
            ).str.lower()
            sortable = sortable.sort_values(
                ["_sort_title", "item_id"], ascending=[ascending, True], kind="mergesort"
            )
        elif sort_by == "year":
            sortable["_sort_year"] = (
                sortable["title"]
                .str.extract(r"\((\d{4})\)\s*$", expand=False)
                .fillna("0")
                .astype(int)
            )
            sortable = sortable.sort_values(
                ["_sort_year", "item_id"], ascending=[ascending, True], kind="mergesort"
            )
        elif sort_by in {"watched_count", "high_rating_count", "avg_rating", "behavior_score"}:
            sortable = sortable.sort_values(
                [sort_by, "item_id"], ascending=[ascending, True], kind="mergesort"
            )
        else:
            sortable = sortable.sort_values("item_id", ascending=ascending, kind="mergesort")

        total = len(sortable)
        page_frame = sortable.iloc[offset : offset + limit].copy()
        page_frame = page_frame[[c for c in page_frame.columns if not c.startswith("_sort_")]]
        
        return {
            "total": total,
            "items": page_frame.to_dict(orient="records")
        }

    def get_movie(self, item_id: int) -> Dict[str, Any] | None:
        self._ensure_movie_data_fresh()
        return self.movie_lookup.get(item_id)

    @staticmethod
    def _parse_genres(raw: Any) -> List[str]:
        parts = [part.strip() for part in str(raw or "").split("|")]
        return [part for part in parts if part and part != "(no genres listed)"]

    @staticmethod
    def _reason_display_title(meta: Dict[str, Any] | None) -> str:
        if not meta:
            return "this title"
        raw = str(meta.get("scraped_title") or meta.get("title") or "").strip()
        if not raw:
            return "this title"
        cleaned = re.sub(r"\s*\(\d{4}\)\s*$", "", raw).strip()
        return cleaned or "this title"

    @staticmethod
    def _reason_item_reference(meta: Dict[str, Any] | None) -> Dict[str, Any] | None:
        if not meta:
            return None
        raw_item_id = meta.get("item_id")
        try:
            item_id = int(raw_item_id)
        except (TypeError, ValueError):
            return None
        title = RecommenderService._reason_display_title(meta)
        if not title or title == "this title":
            return None
        return {"item_id": item_id, "title": title}

    @staticmethod
    def _reason_mentioned_items(*metas: Dict[str, Any] | None) -> List[Dict[str, Any]]:
        mentions: List[Dict[str, Any]] = []
        seen_item_ids: set[int] = set()
        for meta in metas:
            reference = RecommenderService._reason_item_reference(meta)
            if reference is None:
                continue
            item_id = int(reference["item_id"])
            if item_id in seen_item_ids:
                continue
            seen_item_ids.add(item_id)
            mentions.append(reference)
        return mentions

    @staticmethod
    def _join_reason_labels(labels: List[str], limit: int = 2, fallback: str = "related titles") -> str:
        unique: List[str] = []
        for label in labels:
            cleaned = str(label).strip()
            if cleaned and cleaned not in unique:
                unique.append(cleaned)
            if len(unique) >= max(1, limit):
                break
        if not unique:
            return fallback
        if len(unique) == 1:
            return unique[0]
        if len(unique) == 2:
            return f"{unique[0]} and {unique[1]}"
        return f"{', '.join(unique[:-1])}, and {unique[-1]}"

    def _behavior_stats_for_item(self, item_id: int) -> Dict[str, Any] | None:
        if self._movie_behavior_index.empty:
            return None
        if item_id not in self._movie_behavior_index.index:
            return None
        stats = self._movie_behavior_index.loc[item_id]
        return {
            "watched_count": int(stats["watched_count"]),
            "high_rating_count": int(stats["high_rating_count"]),
            "avg_rating": float(stats["avg_rating"]) if pd.notna(stats["avg_rating"]) else 0.0,
            "behavior_score": float(stats["behavior_score"]) if pd.notna(stats["behavior_score"]) else 0.0,
        }

    @staticmethod
    def _minmax_scale(values: List[float], default: float = 0.0) -> List[float]:
        if not values:
            return []
        arr = np.asarray(values, dtype=np.float64)
        finite = np.isfinite(arr)
        if not np.any(finite):
            return [float(default)] * len(values)
        min_v = float(np.min(arr[finite]))
        max_v = float(np.max(arr[finite]))
        if max_v - min_v <= 1e-12:
            return [float(default)] * len(values)
        scaled = (arr - min_v) / (max_v - min_v)
        scaled = np.where(finite, scaled, float(default))
        return scaled.astype(np.float64).tolist()

    def _build_user_recommendation_profile(self, user_id: int) -> Dict[str, Any]:
        rating_rows = list(self.user_ratings_by_user.get(user_id, []))
        if not rating_rows:
            return {"genre_weights": {}, "reference_items": []}

        genre_weights: Dict[str, float] = {}
        for item_id, rating in rating_rows[:50]:
            weight = max(float(rating) - 2.5, 0.0)
            if weight <= 0.0:
                continue
            meta = self.movie_lookup.get(int(item_id))
            if meta is None:
                continue
            for genre in self._parse_genres(meta.get("genres", "")):
                genre_weights[genre] = genre_weights.get(genre, 0.0) + weight

        reference_items = [
            (int(item_id), max(float(rating) - 3.0, 0.0))
            for item_id, rating in rating_rows
            if float(rating) >= 4.0
        ][:12]
        if not reference_items:
            reference_items = [
                (int(item_id), max(float(rating) - 2.5, 0.1))
                for item_id, rating in rating_rows[:12]
            ]

        return {
            "genre_weights": genre_weights,
            "reference_items": reference_items,
        }

    def _rerank_model_recommendations(
        self,
        user_id: int,
        candidates: List[Dict[str, Any]],
        limit: int,
    ) -> List[Dict[str, Any]]:
        if limit <= 0 or not candidates:
            return []

        profile = self._build_user_recommendation_profile(user_id)
        genre_weights = profile["genre_weights"]
        reference_items = profile["reference_items"]
        if not genre_weights and not reference_items:
            return candidates[:limit]

        model_scores = [float(candidate.get("score", 0.0) or 0.0) for candidate in candidates]
        popularity_raw: List[float] = []
        genre_raw: List[float] = []
        history_similarity_raw: List[float] = []

        for candidate in candidates:
            item_id = int(candidate.get("item_id", -1))
            stats = self._behavior_stats_for_item(item_id) or {}
            watched_count = float(stats.get("watched_count", 0.0) or 0.0)
            avg_rating = float(stats.get("avg_rating", 0.0) or 0.0)
            popularity_raw.append(float(np.log1p(watched_count) + 0.25 * avg_rating))

            candidate_genres = self._parse_genres(candidate.get("genres", ""))
            genre_raw.append(sum(float(genre_weights.get(genre, 0.0)) for genre in candidate_genres))

            best_similarity = 0.0
            for reference_item_id, reference_weight in reference_items:
                if reference_item_id == item_id:
                    continue
                similarity = self._get_model_item_similarity(item_id=item_id, reference_item_id=reference_item_id)
                if similarity is None or similarity <= 0.0:
                    continue
                best_similarity = max(best_similarity, float(similarity) * float(reference_weight))
            history_similarity_raw.append(best_similarity)

        model_norm = self._minmax_scale(model_scores, default=0.5)
        popularity_norm = self._minmax_scale(popularity_raw, default=0.5)
        genre_norm = self._minmax_scale(genre_raw, default=0.0)
        history_norm = self._minmax_scale(history_similarity_raw, default=0.0)

        ranked: List[tuple[float, float, int, Dict[str, Any]]] = []
        for idx, candidate in enumerate(candidates):
            rank_score = (
                0.62 * float(model_norm[idx])
                + 0.23 * float(history_norm[idx])
                + 0.15 * float(genre_norm[idx])
                - 0.12 * float(popularity_norm[idx])
            )
            if candidate.get("is_fallback_score"):
                rank_score -= 0.10
            if history_similarity_raw[idx] > 0.0:
                rank_score += 0.03
            ranked.append((rank_score, model_scores[idx], int(candidate.get("item_id", 0)), candidate))

        ranked.sort(key=lambda row: (-row[0], -row[1], row[2]))
        return [row[3] for row in ranked[:limit]]

    def _augment_candidates_from_user_history(
        self,
        *,
        model: Any,
        user_id: int,
        seen_items: set[int],
        candidates: List[Dict[str, Any]],
        target_count: int,
    ) -> List[Dict[str, Any]]:
        if target_count <= len(candidates):
            return candidates
        if not hasattr(model, "similar_items"):
            return candidates

        rating_rows = list(self.user_ratings_by_user.get(user_id, []))
        if not rating_rows:
            return candidates

        reference_items = [int(item_id) for item_id, rating in rating_rows if float(rating) >= 4.0][:8]
        if not reference_items:
            reference_items = [int(item_id) for item_id, _ in rating_rows[:6]]
        if not reference_items:
            return candidates

        excluded_item_ids = {int(item["item_id"]) for item in candidates}
        excluded_item_ids.update(int(item_id) for item_id in seen_items)

        neighbor_item_ids: List[int] = []
        for reference_item_id in reference_items:
            try:
                neighbors = model.similar_items(item_id=reference_item_id, n=30) or []
            except RuntimeError:
                neighbors = []
            for neighbor in neighbors:
                item_id = int(getattr(neighbor, "item_id", -1))
                if item_id <= 0 or item_id in excluded_item_ids:
                    continue
                if item_id not in self.movie_lookup:
                    continue
                excluded_item_ids.add(item_id)
                neighbor_item_ids.append(item_id)
                if len(candidates) + len(neighbor_item_ids) >= target_count:
                    break
            if len(candidates) + len(neighbor_item_ids) >= target_count:
                break

        if not neighbor_item_ids:
            return candidates

        predicted_scores: List[float]
        if hasattr(model, "predict_batch"):
            try:
                user_ids = np.full(len(neighbor_item_ids), int(user_id), dtype=np.int64)
                item_ids = np.asarray(neighbor_item_ids, dtype=np.int64)
                predicted_scores = np.asarray(model.predict_batch(user_ids, item_ids), dtype=np.float64).tolist()
            except Exception:
                predicted_scores = [float(model.predict(user_id=user_id, item_id=item_id)) for item_id in neighbor_item_ids]
        else:
            predicted_scores = [float(model.predict(user_id=user_id, item_id=item_id)) for item_id in neighbor_item_ids]

        augmented = list(candidates)
        for item_id, score in zip(neighbor_item_ids, predicted_scores):
            meta = self.movie_lookup.get(int(item_id))
            if meta is None:
                continue
            augmented.append(
                {
                    "item_id": int(item_id),
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(score),
                    "score_source": "model_neighbor",
                    "is_fallback_score": False,
                }
            )
        return augmented

    @staticmethod
    def _dedupe_reason_list(reasons: List[Dict[str, Any]], limit: int = 4) -> List[Dict[str, Any]]:
        deduped: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for reason in reasons:
            reason_id = str(reason.get("id", "")).strip()
            if not reason_id or reason_id in seen_ids:
                continue
            seen_ids.add(reason_id)
            deduped.append(reason)
            if len(deduped) >= limit:
                break
        return deduped

    def _get_active_model_instance(self) -> Any | None:
        model = self.models.get(self.active_model_name)
        if model is None:
            try:
                self._lazy_load_model(self.active_model_name)
                model = self.models.get(self.active_model_name)
            except FileNotFoundError:
                model = None
        return model

    def _get_model_item_similarity(self, item_id: int, reference_item_id: int) -> float | None:
        model = self._get_active_model_instance()
        if model is None:
            return None

        item_to_idx = getattr(model, "item_to_idx", None)
        if not isinstance(item_to_idx, dict):
            return None

        normalized = getattr(model, "normalized_item_factors", None)
        if normalized is None:
            normalized = getattr(model, "normalized_item_vectors", None)
        if normalized is None or item_id not in item_to_idx or reference_item_id not in item_to_idx:
            return None

        try:
            item_idx = int(item_to_idx[item_id])
            reference_idx = int(item_to_idx[reference_item_id])
            return float(normalized[item_idx] @ normalized[reference_idx])
        except (TypeError, ValueError, IndexError):
            return None

    def _build_pair_behavior_similarity_reason(
        self,
        item_id: int,
        reference_item_id: int,
        target_title: str,
        reference_title: str,
    ) -> Dict[str, Any] | None:
        self._ensure_full_reference_ratings_loaded()
        if self.ratings_df is None:
            return None
        pair_rows = self.ratings_df[self.ratings_df["item_id"].isin([item_id, reference_item_id])]
        if pair_rows.empty:
            return None

        overlap_counts = pair_rows.groupby("user_id")["item_id"].nunique()
        overlap_user_ids = overlap_counts[overlap_counts >= 2].index
        overlap_count = int(len(overlap_user_ids))
        if overlap_count <= 0:
            return None

        overlap_rows = pair_rows[pair_rows["user_id"].isin(overlap_user_ids)]
        paired_min_ratings = overlap_rows.groupby("user_id")["rating"].min()
        high_overlap_count = int((paired_min_ratings >= 4.0).sum())

        if high_overlap_count > 0:
            explanation = (
                f"{overlap_count} users rated both {reference_title} and {target_title}, "
                f"and {high_overlap_count} of them gave both movies at least 4 stars."
            )
        else:
            explanation = (
                f"{overlap_count} users interacted with both {reference_title} and {target_title}, "
                "which reinforces their audience-behavior overlap."
            )

        return {
            "id": "shared-audience-overlap",
            "source": "behavior_signal",
            "title": "Shared audience behavior",
            "short_explanation": explanation,
            "metadata": {
                "reference_item_id": reference_item_id,
                "overlap_user_count": overlap_count,
                "high_overlap_count": high_overlap_count,
                "mentioned_items": self._reason_mentioned_items(
                    self.movie_lookup.get(reference_item_id),
                    self.movie_lookup.get(item_id),
                ),
            },
        }

    def _build_personal_match_reason(
        self,
        user_id: int,
        item_id: int,
        target: Dict[str, Any],
    ) -> Dict[str, Any] | None:
        if user_id not in self.users:
            return None

        predicted_rating = self.predict_rating(user_id=user_id, item_id=item_id).get("predicted_rating")
        if predicted_rating is None:
            return None

        prediction_value = float(predicted_rating)
        if prediction_value < 3.75:
            return None

        genre_weights: Dict[str, float] = {}
        for rated_item_id, rating in self.user_ratings_by_user.get(user_id, [])[:30]:
            meta = self.movie_lookup.get(int(rated_item_id))
            if meta is None:
                continue
            for genre in self._parse_genres(meta.get("genres", "")):
                genre_weights[genre] = genre_weights.get(genre, 0.0) + float(rating)

        matched_genres = [genre for genre in self._parse_genres(target.get("genres", "")) if genre in genre_weights]
        explanation = (
            f"The active model estimates about {prediction_value:.1f}/5 for User {user_id} "
            "based on prior rating patterns."
        )
        if matched_genres:
            explanation += (
                " It also lines up with genres this user tends to rate highly, including "
                f"{self._join_reason_labels(matched_genres, limit=2, fallback='similar themes')}."
            )

        return {
            "id": "personal-match",
            "source": "personal_match",
            "title": "Strong personal match" if prediction_value >= 4.25 else "Personal taste match",
            "short_explanation": explanation,
            "score": round(prediction_value, 3),
            "metadata": {
                "model": self.active_model_name,
                "user_id": user_id,
                "predicted_rating": round(prediction_value, 3),
            },
        }

    def get_movie_recommendation_reasons(
        self,
        item_id: int,
        user_id: int | None = None,
        similar_candidates: List[Dict[str, Any]] | None = None,
    ) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()

        target = self.movie_lookup.get(item_id)
        if target is None:
            return []

        reasons: List[Dict[str, Any]] = []

        if user_id is not None and user_id > 0:
            personal_reason = self._build_personal_match_reason(user_id=user_id, item_id=item_id, target=target)
            if personal_reason is not None:
                reasons.append(personal_reason)

        model = self._get_active_model_instance()

        model_neighbors: List[Dict[str, Any]] = []
        if model is not None and hasattr(model, "similar_items"):
            try:
                raw_neighbors = model.similar_items(item_id=item_id, n=5) or []
            except RuntimeError:
                raw_neighbors = []
            for neighbor in raw_neighbors:
                neighbor_meta = self.movie_lookup.get(int(getattr(neighbor, "item_id", -1)))
                if neighbor_meta is None:
                    continue
                model_neighbors.append(
                    {
                        "meta": neighbor_meta,
                        "score": float(getattr(neighbor, "score", 0.0)),
                    }
                )

        if model_neighbors:
            support_neighbor_metas = [entry["meta"] for entry in model_neighbors[:2]]
            support_titles = self._join_reason_labels(
                [self._reason_display_title(meta) for meta in support_neighbor_metas],
                limit=2,
                fallback="related titles",
            )
            top_similarity = float(model_neighbors[0]["score"])
            reasons.append(
                {
                    "id": "collaborative-similarity",
                    "source": "collaborative_similarity",
                    "title": "Collaborative similarity signal",
                    "short_explanation": (
                        f"It sits close to {support_titles} in the model's learned item space, "
                        "making it easy to surface when similar taste patterns appear."
                    ),
                    "score": round(top_similarity, 4),
                    "metadata": {
                        "model": self.active_model_name,
                        "neighbor_count": len(model_neighbors),
                        "mentioned_items": self._reason_mentioned_items(*support_neighbor_metas),
                    },
                }
            )

        target_genres = self._parse_genres(target.get("genres", ""))
        if target_genres:
            support_items: List[Dict[str, Any]] = [entry["meta"] for entry in model_neighbors]
            if not support_items and similar_candidates:
                for candidate in similar_candidates[:6]:
                    candidate_meta = self.movie_lookup.get(int(candidate.get("item_id", -1)))
                    if candidate_meta is not None:
                        support_items.append(candidate_meta)

            overlap_counts: Dict[str, int] = {}
            support_title_metas: List[Dict[str, Any]] = []
            for meta in support_items:
                overlap = [genre for genre in self._parse_genres(meta.get("genres", "")) if genre in target_genres]
                if not overlap:
                    continue
                support_title_metas.append(meta)
                for genre in overlap:
                    overlap_counts[genre] = overlap_counts.get(genre, 0) + 1

            ranked_genres = sorted(target_genres, key=lambda genre: (-overlap_counts.get(genre, 0), target_genres.index(genre)))
            emphasis_genres = [genre for genre in ranked_genres if overlap_counts.get(genre, 0) > 0][:2]
            if not emphasis_genres:
                emphasis_genres = target_genres[:2]
            genre_phrase = self._join_reason_labels(emphasis_genres, limit=2, fallback="its genre profile")
            support_titles = self._join_reason_labels(
                [self._reason_display_title(meta) for meta in support_title_metas[:2]],
                limit=2,
                fallback="nearby titles",
            )

            if support_title_metas:
                explanation = (
                    f"Its {genre_phrase} profile overlaps with "
                    f"{support_titles}, "
                    "which helps the system place it near related movies."
                )
            else:
                explanation = (
                    f"Its {genre_phrase} mix gives the recommender a strong content signature "
                    "for finding related movies."
                )

            reasons.append(
                {
                    "id": "content-match",
                    "source": "content_match",
                    "title": "Genre and embedding match",
                    "short_explanation": explanation,
                    "metadata": {
                        "model": self.active_model_name,
                        "genres": genre_phrase,
                        "mentioned_items": self._reason_mentioned_items(*support_title_metas[:2]),
                    },
                }
            )

        behavior_stats = self._behavior_stats_for_item(item_id)
        if behavior_stats is not None and (
            behavior_stats["watched_count"] > 0 or behavior_stats["high_rating_count"] > 0
        ):
            watched_count = int(behavior_stats["watched_count"])
            high_rating_count = int(behavior_stats["high_rating_count"])
            avg_rating = float(behavior_stats["avg_rating"])
            if avg_rating >= 4.0 and high_rating_count > 0:
                title = "Strong audience approval"
                explanation = (
                    f"It has {high_rating_count} high ratings and a {avg_rating:.1f}/5 average "
                    f"across {watched_count} viewers, giving the model a confident behavior signal."
                )
            else:
                title = "Stable audience behavior"
                explanation = (
                    f"It shows consistent engagement across {watched_count} viewers with an average "
                    f"rating of {avg_rating:.1f}/5, so the recommender can rely on solid behavior data."
                )

            reasons.append(
                {
                    "id": "behavior-signal",
                    "source": "behavior_signal",
                    "title": title,
                    "short_explanation": explanation,
                    "score": round(avg_rating, 3),
                    "metadata": {
                        "watched_count": watched_count,
                        "high_rating_count": high_rating_count,
                        "avg_rating": round(avg_rating, 3),
                    },
                }
            )

        return self._dedupe_reason_list(reasons, limit=4)

    def get_movie_similarity_reasons(
        self,
        item_id: int,
        reference_item_id: int,
    ) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()

        if item_id == reference_item_id:
            return []

        target = self.movie_lookup.get(item_id)
        reference = self.movie_lookup.get(reference_item_id)
        if target is None or reference is None:
            return []

        target_title = self._reason_display_title(target)
        reference_title = self._reason_display_title(reference)
        reasons: List[Dict[str, Any]] = []

        model_similarity = self._get_model_item_similarity(item_id=item_id, reference_item_id=reference_item_id)
        if model_similarity is not None and model_similarity > 0:
            reasons.append(
                {
                    "id": "direct-collaborative-similarity",
                    "source": "collaborative_similarity",
                    "title": "Collaborative similarity signal",
                    "short_explanation": (
                        f"The active model places {target_title} close to {reference_title} in item space, "
                        "so they tend to surface together when viewer taste patterns align."
                    ),
                    "score": round(model_similarity, 4),
                    "metadata": {
                        "reference_item_id": reference_item_id,
                        "model": self.active_model_name,
                        "mentioned_items": self._reason_mentioned_items(target, reference),
                    },
                }
            )

        target_genres = self._parse_genres(target.get("genres", ""))
        reference_genres = self._parse_genres(reference.get("genres", ""))
        shared_genres = [genre for genre in target_genres if genre in reference_genres]
        if shared_genres:
            shared_genre_phrase = self._join_reason_labels(shared_genres, limit=2, fallback="shared themes")
            reasons.append(
                {
                    "id": "direct-content-overlap",
                    "source": "content_match",
                    "title": "Shared genres and themes",
                    "short_explanation": (
                        f"{target_title} overlaps with {reference_title} on {shared_genre_phrase}, "
                        "which gives both movies a closely related content signature."
                    ),
                    "metadata": {
                        "reference_item_id": reference_item_id,
                        "genres": shared_genre_phrase,
                        "mentioned_items": self._reason_mentioned_items(target, reference),
                    },
                }
            )

        pair_behavior_reason = self._build_pair_behavior_similarity_reason(
            item_id=item_id,
            reference_item_id=reference_item_id,
            target_title=target_title,
            reference_title=reference_title,
        )
        if pair_behavior_reason is not None:
            reasons.append(pair_behavior_reason)

        return self._dedupe_reason_list(reasons, limit=3)

    def search_movies(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        assert self.movies is not None
        q = query.strip().lower()
        if not q:
            return []
        title_lower = self.movies["title"].str.lower()
        scraped_title_lower = (
            self.movies["scraped_title"].str.lower()
            if "scraped_title" in self.movies.columns
            else pd.Series([""] * len(self.movies), index=self.movies.index)
        )
        title_normalized = (
            self.movies["title"]
            .str.replace(r"\s*\([^)]*\)\s*", " ", regex=True)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
            .str.lower()
        )
        mask = (
            title_lower.str.contains(q, na=False, regex=False)
            | title_normalized.str.contains(q, na=False, regex=False)
            | scraped_title_lower.str.contains(q, na=False, regex=False)
        )
        frame = self.movies[mask].head(limit)
        return frame.to_dict(orient="records")

    def get_movies_by_person(self, person_name: str) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        if not person_name:
            return []
            
        matched_items = []
        for item_id, meta in self.movie_lookup.items():
            found = False
            for c in meta.get("cast", []):
                if c.get("name") == person_name:
                    found = True
                    break
            if not found:
                for d in meta.get("directors", []):
                    if d.get("name") == person_name:
                        found = True
                        break
            if found:
                matched_items.append(item_id)
                
        if not matched_items:
            return []
            
        frame = self.movies[self.movies["item_id"].isin(matched_items)]
        
        # Sort by year descending (newest first)
        sortable = frame.copy()
        sortable["_sort_year"] = (
            sortable["title"]
            .str.extract(r"\((\d{4})\)\s*$", expand=False)
            .fillna("0")
            .astype(int)
        )
        sortable = sortable.sort_values(["_sort_year", "item_id"], ascending=[False, True], kind="mergesort")
        sortable = sortable[[c for c in sortable.columns if not c.startswith("_sort_")]]
        
        return sortable.to_dict(orient="records")

    def predict_rating(self, user_id: int, item_id: int) -> Dict[str, Any]:
        self._ensure_active_model_fresh(load_data=False)
        try:
            model = self.models.get(self.active_model_name)
            if model is None:
                self._lazy_load_model(self.active_model_name)
                model = self.models.get(self.active_model_name)
            score = model.predict(user_id=user_id, item_id=item_id)
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": score}
        except RuntimeError:
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": None}

    def recommend_for_user(self, user_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        model = self.models.get(self.active_model_name)
        if model is None:
            self._lazy_load_model(self.active_model_name)
            model = self.models.get(self.active_model_name)

        # If the active model was trained on old artifacts and does not cover this user,
        # fall back to popularity from the current database-wide ratings.
        model_user_to_idx = getattr(model, "user_to_idx", {})
        user_rating_pairs = self.user_ratings_by_user.get(user_id, [])
        seen = {int(item_id) for item_id, _ in user_rating_pairs}
        if not isinstance(model_user_to_idx, dict) or user_id not in model_user_to_idx:
            return self._fallback_popular_items(n=n, exclude_items=seen, score_mode="rating")

        candidate_count = min(max(n * 8, 100), 500)
        recs = model.recommend_top_n(user_id=user_id, n=candidate_count, exclude_seen=True, seen_items=seen)
        enriched = []
        selected_item_ids: set[int] = set()
        for rec in recs:
            rec_item_id = int(rec.item_id)
            meta = self.movie_lookup.get(rec_item_id)
            if meta is None or rec_item_id in selected_item_ids:
                continue
            enriched.append(
                {
                    "item_id": rec_item_id,
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(rec.score),
                    "score_source": "model",
                    "is_fallback_score": False,
                }
            )
            selected_item_ids.add(rec_item_id)

        if enriched:
            enriched = self._augment_candidates_from_user_history(
                model=model,
                user_id=user_id,
                seen_items=seen,
                candidates=enriched,
                target_count=min(candidate_count + 120, 700),
            )
            enriched = self._rerank_model_recommendations(user_id=user_id, candidates=enriched, limit=n)
            selected_item_ids = {int(item["item_id"]) for item in enriched}

        if len(enriched) < n:
            fallback_exclude = {int(iid) for iid in seen}
            fallback_exclude.update(selected_item_ids)
            enriched.extend(
                self._fallback_popular_items(
                    n=n - len(enriched),
                    exclude_items=fallback_exclude,
                    score_mode="rating",
                )
            )
        return enriched[:n]

    def similar_for_item(self, item_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        model = self.models.get(self.active_model_name)
        if model is None:
            self._lazy_load_model(self.active_model_name)
            model = self.models.get(self.active_model_name)

        recs = model.similar_items(item_id=item_id, n=n)
        if not recs:
            target = self.movie_lookup.get(item_id)
            if target is None:
                return []
            target_genres = {g for g in str(target.get("genres", "")).split("|") if g and g != "(no genres listed)"}
            year_match = None
            title = str(target.get("title", ""))
            year_token = pd.Series([title]).str.extract(r"\((\d{4})\)\s*$", expand=False).iloc[0]
            if isinstance(year_token, str) and year_token.isdigit():
                year_match = int(year_token)
            return self._fallback_popular_items(
                n=n,
                exclude_items={item_id},
                preferred_genres=target_genres,
                target_year=year_match,
                score_mode="similarity",
            )

        enriched = []
        selected_item_ids: set[int] = set()
        for rec in recs:
            rec_item_id = int(rec.item_id)
            meta = self.movie_lookup.get(rec_item_id)
            if meta is None or rec_item_id == item_id or rec_item_id in selected_item_ids:
                continue
            enriched.append(
                {
                    "item_id": rec_item_id,
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(rec.score),
                    "score_source": "model",
                    "is_fallback_score": False,
                }
            )
            selected_item_ids.add(rec_item_id)
            if len(enriched) >= n:
                break

        if len(enriched) < n:
            target = self.movie_lookup.get(item_id)
            target_genres: set[str] = set()
            year_match = None
            if target is not None:
                target_genres = {g for g in str(target.get("genres", "")).split("|") if g and g != "(no genres listed)"}
                title = str(target.get("title", ""))
                year_token = pd.Series([title]).str.extract(r"\((\d{4})\)\s*$", expand=False).iloc[0]
                if isinstance(year_token, str) and year_token.isdigit():
                    year_match = int(year_token)
            fallback_exclude = {item_id}
            fallback_exclude.update(selected_item_ids)
            enriched.extend(
                self._fallback_popular_items(
                    n=n - len(enriched),
                    exclude_items=fallback_exclude,
                    preferred_genres=target_genres,
                    target_year=year_match,
                    score_mode="similarity",
                )
            )
        return enriched[:n]


    def get_user_history(self, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
            
        history = []
        user_rows = self.user_ratings_by_user.get(user_id, [])
        if limit > 0:
            user_rows = user_rows[:limit]

        for iid, rating in user_rows:
            meta = self.movie_lookup.get(
                iid,
                {
                    "item_id": iid,
                    "title": "Unknown",
                    "scraped_title": "",
                    "genres": "",
                    "poster_url": "",
                    "backdrop_url": "",
                    "overview": "",
                    "tmdb_id": "",
                },
            )
            history.append({
                "item_id": int(iid),
                "title": meta["title"],
                "scraped_title": meta.get("scraped_title", ""),
                "genres": meta["genres"],
                "poster_url": meta.get("poster_url", ""),
                "backdrop_url": meta.get("backdrop_url", ""),
                "overview": meta.get("overview", ""),
                "tmdb_id": meta.get("tmdb_id", ""),
                "rating": float(rating),
            })
        return history

    def list_users(self, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        self._ensure_movie_data_fresh()
        total = len(self.users)
        users_page = self.users[offset:offset+limit]
        return {
            "total": total,
            "items": [{"user_id": u, "history_count": self.user_rating_counts.get(u, 0)} for u in users_page]
        }

    def get_db_stats(self) -> Dict[str, Any]:
        self._ensure_movie_data_fresh()
        total_movies = len(self.movies) if self.movies is not None else 0
        total_users = len(self.users)
        
        # Calculate some genre stats for charts
        genre_counts = {}
        if self.movies is not None:
            for genres in self.movies['genres'].dropna():
                for g in genres.split('|'):
                    if g and g != '(no genres listed)':
                        genre_counts[g] = genre_counts.get(g, 0) + 1
                        
        # Sort genres by count (top 12 for dashboard horizontal chart)
        top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:12]
        
        # Movies per year
        movies_per_year = {}
        if self.movies is not None:
            years = self.movies["title"].str.extract(r"\((\d{4})\)\s*$", expand=False).dropna()
            for y in years:
                movies_per_year[y] = movies_per_year.get(y, 0) + 1
                
        # Sort by year, take last 20 years
        recent_years = sorted(movies_per_year.items(), key=lambda x: x[0], reverse=True)[:20]
        recent_years = sorted(recent_years, key=lambda x: x[0]) # chronological
        movies_by_year = [{"year": y[0], "count": y[1]} for y in recent_years]
        
        # Top rated movies (most ratings)
        top_rated_movies = []
        user_counts_arr = np.array(list(self.user_rating_counts.values()), dtype=np.float64) if self.user_rating_counts else np.array([], dtype=np.float64)
        movie_counts_arr = np.array(list(self.movie_rating_counts.values()), dtype=np.float64) if self.movie_rating_counts else np.array([], dtype=np.float64)
        user_activity_histogram = self._ratings_count_histogram(user_counts_arr, num_bins=40)
        item_popularity_histogram = self._ratings_count_histogram(movie_counts_arr, num_bins=40)

        for iid, count in sorted(self.movie_rating_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            meta = self.movie_lookup.get(iid, {"title": "Unknown", "scraped_title": ""})
            display_title = meta.get("scraped_title") or meta.get("title", "Unknown")
            top_rated_movies.append({"title": display_title, "count": count})
        
        return {
            "total_movies": total_movies,
            "total_users": total_users,
            "total_ratings": getattr(self, "total_ratings", 0),
            "average_rating": round(getattr(self, "average_rating", 0.0), 2),
            "top_genres": [{"name": g[0], "count": g[1]} for g in top_genres],
            "rating_distribution": getattr(self, "rating_distribution", []),
            "movies_by_year": movies_by_year,
            "top_rated_movies": top_rated_movies,
            "user_activity_histogram": user_activity_histogram,
            "item_popularity_histogram": item_popularity_histogram,
        }

    @staticmethod
    def _ratings_count_histogram(values: np.ndarray, num_bins: int = 40) -> List[Dict[str, Any]]:
        """Histogram of per-user or per-movie rating counts (linear bins from 0 to max)."""
        if values.size == 0:
            return []
        max_v = float(np.max(values))
        if max_v <= 0:
            return []
        fin = values[np.isfinite(values) & (values >= 0)]
        if fin.size == 0:
            return []
        max_v = float(np.max(fin))
        nbin = max(2, int(num_bins))
        edges = np.linspace(0.0, max_v, nbin + 1)
        hist, _ = np.histogram(fin, bins=edges)
        rows: List[Dict[str, Any]] = []
        for i, c in enumerate(hist):
            lo, hi = float(edges[i]), float(edges[i + 1])
            mid = (lo + hi) / 2.0
            if max_v >= 5000 and mid >= 500:
                label = f"{mid / 1000.0:.1f}k"
            elif max_v >= 1000 and mid >= 200:
                label = f"{mid / 1000.0:.1f}k"
            else:
                label = f"{mid:.0f}"
            rows.append(
                {
                    "label": label,
                    "count": int(c),
                    "binStart": lo,
                    "binEnd": hi,
                    "xMid": mid,
                }
            )
        return rows

    @staticmethod
    def _build_histogram(values: np.ndarray, bins: int = 10) -> List[Dict[str, Any]]:
        if values.size == 0:
            return []
        finite_values = values[np.isfinite(values)]
        if finite_values.size == 0:
            return []

        min_v = float(np.min(finite_values))
        max_v = float(np.max(finite_values))
        if min_v == max_v:
            return [{"bin": f"{min_v:.3f}-{max_v:.3f}", "count": int(finite_values.size)}]

        edges = np.linspace(min_v, max_v, num=max(2, int(bins)) + 1)
        counts, _ = np.histogram(finite_values, bins=edges)
        rows: List[Dict[str, Any]] = []
        for i, count in enumerate(counts):
            left = float(edges[i])
            right = float(edges[i + 1])
            rows.append({"bin": f"{left:.3f}-{right:.3f}", "count": int(count)})
        return rows

    def _build_option3_diagnostics(self) -> Dict[str, Any] | None:
        if not self.active_model_name.startswith("option3_"):
            return None
        model = self.models.get(self.active_model_name)
        if model is None:
            try:
                self._lazy_load_model(self.active_model_name)
                model = self.models.get(self.active_model_name)
            except FileNotFoundError:
                return None
        if model is None:
            return None

        user_factors = getattr(model, "user_factors", None)
        item_factors = getattr(model, "item_factors", None)
        if not isinstance(user_factors, np.ndarray) or not isinstance(item_factors, np.ndarray):
            return None
        if user_factors.ndim != 2 or item_factors.ndim != 2:
            return None

        rank = int(min(user_factors.shape[1], item_factors.shape[1]))
        if rank <= 0:
            return {
                "svd_components": [],
                "user_latent_norm_hist": [],
                "item_latent_norm_hist": [],
                "top_calibration_weights": [],
            }

        user_mat = user_factors[:, :rank].astype(np.float64, copy=False)
        item_mat = item_factors[:, :rank].astype(np.float64, copy=False)

        # For Option3 factors U*sqrt(S), V*sqrt(S), component magnitude is ||u_k|| * ||v_k|| ~= sigma_k.
        singular_values = np.linalg.norm(user_mat, axis=0) * np.linalg.norm(item_mat, axis=0)
        singular_values = np.maximum(singular_values, 0.0)
        energy = np.square(singular_values)
        total_energy = float(np.sum(energy))
        energy_ratio = (
            energy / total_energy
            if total_energy > 0
            else np.zeros_like(energy, dtype=np.float64)
        )
        cumulative_energy = np.cumsum(energy_ratio)

        top_components = min(12, rank)
        svd_components = [
            {
                "component": int(i + 1),
                "singular_value": float(singular_values[i]),
                "energy_ratio": float(energy_ratio[i]),
                "cumulative_energy": float(cumulative_energy[i]),
            }
            for i in range(top_components)
        ]

        user_norms = np.linalg.norm(user_mat, axis=1)
        item_norms = np.linalg.norm(item_mat, axis=1)
        user_hist = self._build_histogram(user_norms, bins=10)
        item_hist = self._build_histogram(item_norms, bins=10)

        top_weights: List[Dict[str, Any]] = []
        regression_coef = getattr(model, "regression_coef", None)
        if isinstance(regression_coef, np.ndarray) and regression_coef.ndim == 1 and regression_coef.size > 0:
            coef = regression_coef.astype(np.float64, copy=False)
            labels = [f"latent_{i + 1}" for i in range(rank)]
            if coef.size > rank:
                labels.extend([f"feature_{i + 1}" for i in range(coef.size - rank)])
            labels = labels[:coef.size]

            sorted_idx = np.argsort(-np.abs(coef))
            for idx in sorted_idx[: min(10, coef.size)]:
                top_weights.append(
                    {
                        "feature": labels[int(idx)],
                        "weight": float(coef[int(idx)]),
                        "abs_weight": float(abs(coef[int(idx)])),
                    }
                )

        return {
            "svd_components": svd_components,
            "user_latent_norm_hist": user_hist,
            "item_latent_norm_hist": item_hist,
            "top_calibration_weights": top_weights,
        }

    def _load_metrics_json(self, model_name: str) -> Dict[str, Any] | None:
        metrics_path = self.artifacts_dir / model_name / "metrics.json"
        if not metrics_path.exists():
            return None
        try:
            with open(metrics_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, dict) else None
        except (OSError, ValueError, json.JSONDecodeError, TypeError):
            return None

    def get_model_config(self) -> Dict[str, Any]:
        self._ensure_active_model_fresh(load_data=False)

        # Try to load metrics and history for the active model.
        available_models = sorted(getattr(self, "_available_model_names", set(self.models.keys())))
        active_metrics = self._load_metrics_json(self.active_model_name)
        active_history = None
        diagnostics = None

        metrics_by_model: Dict[str, Dict[str, Any]] = {}
        for model_name in available_models:
            model_metrics = self._load_metrics_json(model_name)
            if model_metrics is not None:
                metrics_by_model[model_name] = model_metrics

        try:
            history_path = self.artifacts_dir / self.active_model_name / "training_history.json"
            if history_path.exists():
                with open(history_path, "r", encoding="utf-8") as f:
                    active_history = json.load(f)
            diagnostics = self._build_option3_diagnostics()
        except Exception:
            pass

        return {
            "active_model": self.active_model_name,
            "available_models": available_models,
            "metrics": active_metrics,
            "metrics_by_model": metrics_by_model,
            "history": active_history,
            "diagnostics": diagnostics,
        }

    @staticmethod
    def _training_history_epoch_length(history: Dict[str, Any]) -> int:
        """Number of per-epoch rows (excludes one-off metadata keys like best_val_epoch)."""
        skip_prefixes = ("best_",)
        m = 0
        for key, value in history.items():
            if any(key.startswith(p) for p in skip_prefixes):
                continue
            if not isinstance(value, list) or not value:
                continue
            if not all(isinstance(x, numbers.Real) and not isinstance(x, bool) for x in value):
                continue
            m = max(m, len(value))
        return m

    @staticmethod
    def _training_history_is_epoch_worthy(history: Dict[str, Any]) -> bool:
        return RecommenderService._training_history_epoch_length(history) >= 2

    def get_all_training_histories(self) -> Dict[str, Any]:
        """
        Load training_history.json for every model folder that has a multi-epoch history.
        Used by the settings dashboard to plot train/validation curves for all engines.
        """
        label_by_id: Dict[str, str] = {
            "option1": "MF-SGD",
            "option2": "Deep Hybrid",
            "option3_ridge": "SVD-Ridge",
            "option3_lasso": "SVD-Lasso",
            "option3_knn": "SVD-KNN",
            "option4": "MF-ALS",
        }
        order = ("option1", "option2", "option3_ridge", "option3_lasso", "option3_knn", "option4")

        if not self.artifacts_dir.is_dir():
            return {"engines": []}

        found: List[Dict[str, Any]] = []
        for name in os.listdir(self.artifacts_dir):
            model_dir = self.artifacts_dir / name
            if not model_dir.is_dir():
                continue
            path = model_dir / "training_history.json"
            if not path.exists():
                continue
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError, json.JSONDecodeError, TypeError):
                continue
            if not isinstance(data, dict) or not self._training_history_is_epoch_worthy(data):
                continue
            found.append(
                {
                    "id": name,
                    "label": label_by_id.get(name, name),
                    "history": data,
                }
            )

        def sort_key(item: Dict[str, Any]) -> tuple[int, str]:
            mid = str(item.get("id", ""))
            try:
                return (order.index(mid), mid)
            except ValueError:
                return (100, mid)

        found.sort(key=sort_key)
        return {"engines": found}

    def preload_active_model(self) -> Dict[str, Any]:
        """
        Preload the active model and its shared runtime data into memory.
        Runtime cache artifacts keep this lightweight while removing first-request
        cold starts after an engine switch.
        """
        self._ensure_active_model_fresh(load_data=True)
        with self._lock:
            model = self.models.get(self.active_model_name)
            if model is None:
                self._lazy_load_model(self.active_model_name)
            ready = (
                self._active_model_data_loaded_for_name == self.active_model_name
                and self.models.get(self.active_model_name) is not None
            )
            return {
                "active_model": self.active_model_name,
                "active_model_load_status": "ready" if ready else "error",
                "active_model_ready": ready,
            }

    def _lazy_load_model(self, name: str) -> None:
        import pickle
        candidates = [
            self.artifacts_dir / name / "model.pkl",
            self.artifacts_dir / f"model_{name}.pkl",
            self.artifacts_dir / "model.pkl"
        ]
        for p in candidates:
            if p.exists():
                with open(p, "rb") as f:
                    self.models[name] = pickle.load(f)
                return
        raise FileNotFoundError(f"Model {name} not found on disk.")

    def set_active_model(self, model_name: str) -> bool:
        self._ensure_loaded()
        if model_name not in getattr(self, '_available_model_names', set()):
            return False
        with self._lock:
            if model_name == self.active_model_name:
                self._persist_active_model_to_disk()
                return True
            self.active_model_name = model_name
            self._persist_active_model_to_disk()
            # Intentionally skip loading the data here so the API responds instantly.
            # The next request that needs data will call _ensure_active_model_fresh(True) and load it.
        return True

    def update_movie_enriched(
        self,
        item_id: int,
        poster_url: str | None = None,
        backdrop_url: str | None = None,
        overview: str | None = None,
        tmdb_id: int | None = None,
        scraped_title: str | None = None,
        cast: str | None = None,
        directors: str | None = None,
    ) -> bool:
        """Update one movie's shared enriched metadata fields."""
        self._ensure_movie_data_fresh()
        if self.movies is None or item_id not in self.movie_lookup:
            return False
        for col in ("poster_url", "backdrop_url", "overview", "tmdb_id", "scraped_title", "cast", "directors"):
            if col not in self.movies.columns:
                self.movies[col] = ""
        row = self.movie_lookup[item_id]
        if poster_url is not None:
            row["poster_url"] = poster_url
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "poster_url"] = poster_url
        if backdrop_url is not None:
            row["backdrop_url"] = backdrop_url
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "backdrop_url"] = backdrop_url
        if overview is not None:
            row["overview"] = overview
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "overview"] = overview
        if tmdb_id is not None:
            val = str(tmdb_id) if tmdb_id else ""
            row["tmdb_id"] = val
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "tmdb_id"] = val
        if scraped_title is not None:
            row["scraped_title"] = scraped_title
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "scraped_title"] = scraped_title
        if cast is not None:
            import json
            try:
                row["cast"] = json.loads(cast) if cast else []
            except json.JSONDecodeError:
                row["cast"] = []
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "cast"] = cast
        if directors is not None:
            import json
            try:
                row["directors"] = json.loads(directors) if directors else []
            except json.JSONDecodeError:
                row["directors"] = []
            idx = self.movies[self.movies["item_id"] == item_id].index
            if len(idx) > 0:
                self.movies.at[idx[0], "directors"] = directors
        self._sync_user_history_for_item(item_id)
        out_path = self._movies_write_path or (self.artifacts_dir / "movies_enriched.csv")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.movies.to_csv(out_path, index=False)
        self._movies_loaded_path = out_path
        try:
            self._movies_mtime_ns = out_path.stat().st_mtime_ns
        except OSError:
            self._movies_mtime_ns = None
        if self._movies_loaded_path is not None and self._movies_mtime_ns is not None:
            stale_keys = [
                key
                for key, cached in self._movies_cache_by_source_key.items()
                if cached.get("movies") is self.movies
            ]
            for key in stale_keys:
                self._movies_cache_by_source_key.pop(key, None)
            new_source_key = self._source_key_for_path(self._movies_loaded_path)
            if new_source_key:
                self._movies_cache_by_source_key[new_source_key] = {
                    "movies": self.movies,
                    "movie_lookup": self.movie_lookup,
                    "mtime_ns": int(self._movies_mtime_ns),
                }
        return True

service = RecommenderService()
