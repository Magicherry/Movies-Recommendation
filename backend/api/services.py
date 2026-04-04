from __future__ import annotations

import os
import pickle
import json
from pathlib import Path
from threading import Lock
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
        self.movies: pd.DataFrame | None = None
        self.movie_lookup: Dict[int, Dict[str, Any]] = {}
        self.movie_behavior_stats: pd.DataFrame = pd.DataFrame()
        self.users: List[int] = []
        self.user_history: Dict[int, List[Dict[str, Any]]] = {}
        self.reference_ratings_path: Path | None = None
        self._model_train_user_ids: set[int] = set()
        self._model_train_item_ids: set[int] = set()

    def _select_default_active_model(self) -> str:
        available = getattr(self, "_available_model_names", set())
        for candidate in ("option1", "option2", "option3_ridge", "option3_lasso", "option4"):
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

    def _load_movies_from_path(self, source_path: Path) -> None:
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

            self.movie_lookup[int(row.item_id)] = {
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

        self._movies_loaded_path = source_path
        try:
            self._movies_mtime_ns = source_path.stat().st_mtime_ns
        except OSError:
            self._movies_mtime_ns = None

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

    def _load_ratings_from_path(self, train_ratings_path: Path | None) -> None:
        if train_ratings_path is None or not train_ratings_path.exists():
            raise FileNotFoundError("Model-specific train_ratings.csv not found.")

        reference_path = self._resolve_reference_ratings_path(train_ratings_path)
        # Optimization: Skip expensive csv reloading if source paths are identical.
        if (
            getattr(self, "_last_train_ratings_path", None) == train_ratings_path
            and getattr(self, "_last_reference_ratings_path", None) == reference_path
            and hasattr(self, "ratings_df")
        ):
            return

        model_ratings = pd.read_csv(
            train_ratings_path,
            usecols=["user_id", "item_id", "rating"],
            dtype={"user_id": "int32", "item_id": "int32", "rating": "float32"},
        )
        self._model_train_user_ids = set(model_ratings["user_id"].astype(int).unique().tolist())
        self._model_train_item_ids = set(model_ratings["item_id"].astype(int).unique().tolist())

        ratings = self._read_ratings_any_format(reference_path)
        self.reference_ratings_path = reference_path
        self._last_train_ratings_path = train_ratings_path
        self._last_reference_ratings_path = reference_path
        self.users = sorted(ratings["user_id"].astype(int).unique().tolist())

        behavior_stats = ratings.groupby("item_id").agg(
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
        behavior_stats["item_id"] = behavior_stats["item_id"].astype(int)
        self.movie_behavior_stats = behavior_stats

        self.ratings_df = ratings[["user_id", "item_id", "rating"]].copy()
        self.user_rating_counts = ratings["user_id"].value_counts().to_dict()
        
        # Precompute db stats to avoid iterating over dataframe on the fly
        self.total_ratings = len(ratings)
        if self.total_ratings > 0:
            self.average_rating = float(ratings["rating"].mean())
        else:
            self.average_rating = 0.0
            
        self.movie_rating_counts = ratings["item_id"].value_counts().to_dict()
        
        rating_dist = {}
        for r, cnt in ratings["rating"].value_counts().items():
            r_rounded = round(float(r) * 2) / 2
            rating_dist[r_rounded] = rating_dist.get(r_rounded, 0) + cnt
        self.rating_distribution = [{"rating": str(k), "count": int(v)} for k, v in sorted(rating_dist.items())]

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
        behavior_map = self.movie_behavior_stats.set_index("item_id")

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
        self._load_movies_from_path(source_path)
        self._load_ratings_from_path(train_ratings_path)

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

    def _ensure_active_model_fresh(self) -> None:
        self._ensure_loaded()
        path = self._active_model_state_path
        if not path.exists():
            return
        try:
            mtime_ns = path.stat().st_mtime_ns
        except OSError:
            return
        if self._active_model_mtime_ns is not None and mtime_ns <= self._active_model_mtime_ns:
            return

        with self._lock:
            if not path.exists():
                return
            try:
                mtime_ns = path.stat().st_mtime_ns
            except OSError:
                return
            if self._active_model_mtime_ns is not None and mtime_ns <= self._active_model_mtime_ns:
                return
            try:
                model_name = path.read_text(encoding="utf-8").strip()
            except OSError:
                return
            if model_name in self.models:
                model_changed = model_name != self.active_model_name
                self.active_model_name = model_name
                if model_changed:
                    self._load_active_model_data()
            self._active_model_mtime_ns = mtime_ns

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
                         (self.artifacts_dir / "option4" / "model.pkl", "option4"),
                         (self.artifacts_dir / "model_option1.pkl", "option1"),
                         (self.artifacts_dir / "model_option2.pkl", "option2"),
                         (self.artifacts_dir / "model_option3_ridge.pkl", "option3_ridge"),
                         (self.artifacts_dir / "model_option3_lasso.pkl", "option3_lasso"),
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

            self._load_active_model_data()

            self._loaded = True

    def list_movies(
        self,
        limit: int = 50,
        offset: int = 0,
        query: str | None = None,
        genre: str | None = None,
        year: str | None = None,
        sort_by: str = "item_id",
        sort_order: str = "asc",
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
        self._ensure_active_model_fresh()
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
        self._ensure_active_model_fresh()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        model = self.models.get(self.active_model_name)
        if model is None:
            self._lazy_load_model(self.active_model_name)
            model = self.models.get(self.active_model_name)

        # If the active model was trained on old artifacts and does not cover this user,
        # fall back to popularity from the current database-wide ratings.
        model_user_to_idx = getattr(model, "user_to_idx", {})
        if not isinstance(model_user_to_idx, dict) or user_id not in model_user_to_idx:
            seen = set(self.ratings_df[self.ratings_df["user_id"] == user_id]["item_id"].astype(int).tolist())
            return self._fallback_popular_items(n=n, exclude_items=seen, score_mode="rating")

        # Dynamically inject seen items to bypass massive pickle overhead
        user_rows = self.ratings_df[self.ratings_df["user_id"] == user_id]
        seen = set(user_rows["item_id"])
        
        recs = model.recommend_top_n(user_id=user_id, n=n, exclude_seen=True, seen_items=seen)
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
            if len(enriched) >= n:
                break

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
        self._ensure_active_model_fresh()
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
            
        # Dynamically build history to save memory
        user_rows = self.ratings_df[self.ratings_df["user_id"] == user_id]
        user_rows = user_rows.sort_values(by="rating", ascending=False)
        if limit > 0:
            user_rows = user_rows.head(limit)
            
        history = []
        for iid, rating in zip(user_rows["item_id"], user_rows["rating"]):
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
        self._ensure_active_model_fresh()
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
                        
        # Sort genres by count
        top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
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
            "top_rated_movies": top_rated_movies
        }

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
        self._ensure_active_model_fresh()

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
            self._load_active_model_data()
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
        return True

service = RecommenderService()
