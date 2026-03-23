from __future__ import annotations

import os
import pickle
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

    def _load_movies_from_path(self, source_path: Path) -> None:
        frame = pd.read_csv(source_path)
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
            
            import json
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

        movies_candidates = [
            self.artifacts_dir / "movies.csv",
            model_dir / "movies.csv",
            fallback_dir / "movies.csv",
        ]
        train_candidates = [
            model_dir / "train_ratings.csv",
        ]
        enriched_candidates = [
            self.artifacts_dir / "movies_enriched.csv",
            model_dir / "movies_enriched.csv",
            fallback_dir / "movies_enriched.csv",
        ]

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
        # Always write enriched metadata to the shared root file.
        preferred_enriched_write_path = self.artifacts_dir / "movies_enriched.csv"
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

        ratings = pd.read_csv(train_ratings_path)
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

        self.user_history = {}
        for row in ratings.itertuples(index=False):
            uid = int(row.user_id)
            iid = int(row.item_id)
            if uid not in self.user_history:
                self.user_history[uid] = []

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
            self.user_history[uid].append(
                {
                    "item_id": iid,
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta["poster_url"],
                    "backdrop_url": meta["backdrop_url"],
                    "overview": meta["overview"],
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "rating": float(row.rating),
                }
            )

        for uid in self.user_history:
            self.user_history[uid].sort(key=lambda x: x["rating"], reverse=True)

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

            model_option1_path = self.artifacts_dir / "option1" / "model.pkl"
            model_option2_path = self.artifacts_dir / "option2" / "model.pkl"
            model_option3_path = self.artifacts_dir / "option3" / "model.pkl"
            model_option3_ridge_path = self.artifacts_dir / "option3_ridge" / "model.pkl"
            model_option3_lasso_path = self.artifacts_dir / "option3_lasso" / "model.pkl"
            model_option4_path = self.artifacts_dir / "option4" / "model.pkl"

            if model_option1_path.exists():
                with open(model_option1_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
            
            if model_option2_path.exists():
                with open(model_option2_path, "rb") as f:
                    self.models["option2"] = pickle.load(f)

            if model_option3_path.exists():
                with open(model_option3_path, "rb") as f:
                    self.models["option3"] = pickle.load(f)

            if model_option3_ridge_path.exists():
                with open(model_option3_ridge_path, "rb") as f:
                    self.models["option3_ridge"] = pickle.load(f)

            if model_option3_lasso_path.exists():
                with open(model_option3_lasso_path, "rb") as f:
                    self.models["option3_lasso"] = pickle.load(f)

            if model_option4_path.exists():
                with open(model_option4_path, "rb") as f:
                    self.models["option4"] = pickle.load(f)
            
            # Fallback to old model.pkl if specific ones don't exist
            old_model_path = self.artifacts_dir / "model.pkl"
            old_model_option1_path = self.artifacts_dir / "model_option1.pkl"
            old_model_option2_path = self.artifacts_dir / "model_option2.pkl"
            old_model_option3_path = self.artifacts_dir / "model_option3.pkl"
            old_model_option3_ridge_path = self.artifacts_dir / "model_option3_ridge.pkl"
            old_model_option3_lasso_path = self.artifacts_dir / "model_option3_lasso.pkl"
            old_model_option4_path = self.artifacts_dir / "model_option4.pkl"
            
            if "option1" not in self.models and old_model_option1_path.exists():
                with open(old_model_option1_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
                    
            if "option2" not in self.models and old_model_option2_path.exists():
                with open(old_model_option2_path, "rb") as f:
                    self.models["option2"] = pickle.load(f)

            if "option3" not in self.models and old_model_option3_path.exists():
                with open(old_model_option3_path, "rb") as f:
                    self.models["option3"] = pickle.load(f)

            if "option3_ridge" not in self.models and old_model_option3_ridge_path.exists():
                with open(old_model_option3_ridge_path, "rb") as f:
                    self.models["option3_ridge"] = pickle.load(f)

            if "option3_lasso" not in self.models and old_model_option3_lasso_path.exists():
                with open(old_model_option3_lasso_path, "rb") as f:
                    self.models["option3_lasso"] = pickle.load(f)

            if "option4" not in self.models and old_model_option4_path.exists():
                with open(old_model_option4_path, "rb") as f:
                    self.models["option4"] = pickle.load(f)
                    
            if not self.models and old_model_path.exists():
                with open(old_model_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
            
            if not self.models:
                raise FileNotFoundError("No models found. Run training script.")
            
            # Resolve and persist active model so it survives reloads and cross-process requests.
            self._load_active_model_from_disk()
            if self.active_model_name not in self.models:
                self.active_model_name = list(self.models.keys())[0]
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
            model = self.models[self.active_model_name]
            score = model.predict(user_id=user_id, item_id=item_id)
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": score}
        except RuntimeError:
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": None}

    def recommend_for_user(self, user_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        self._ensure_active_model_fresh()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        model = self.models[self.active_model_name]
        recs = model.recommend_top_n(user_id=user_id, n=n, exclude_seen=True)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(
                rec.item_id,
                {
                    "item_id": rec.item_id,
                    "title": "Unknown",
                    "scraped_title": "",
                    "genres": "",
                    "poster_url": "",
                    "backdrop_url": "",
                    "overview": "",
                    "tmdb_id": "",
                },
            )
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(rec.score),
                }
            )
        return enriched

    def similar_for_item(self, item_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        self._ensure_active_model_fresh()
        model = self.models[self.active_model_name]
        recs = model.similar_items(item_id=item_id, n=n)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(
                rec.item_id,
                {
                    "item_id": rec.item_id,
                    "title": "Unknown",
                    "scraped_title": "",
                    "genres": "",
                    "poster_url": "",
                    "backdrop_url": "",
                    "overview": "",
                    "tmdb_id": "",
                },
            )
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
                    "scraped_title": meta.get("scraped_title", ""),
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "tmdb_id": meta.get("tmdb_id", ""),
                    "score": float(rec.score),
                }
            )
        return enriched


    def get_user_history(self, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        self._ensure_movie_data_fresh()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        history = self.user_history.get(user_id, [])
        # We can return all history here if limit=0, or let the API caller decide.
        if limit == 0:
            return history
        return history[:limit]

    def list_users(self, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        self._ensure_active_model_fresh()
        total = len(self.users)
        users_page = self.users[offset:offset+limit]
        return {
            "total": total,
            "items": [{"user_id": u, "history_count": len(self.user_history.get(u, []))} for u in users_page]
        }

    def get_db_stats(self) -> Dict[str, Any]:
        self._ensure_movie_data_fresh()
        total_movies = len(self.movies) if self.movies is not None else 0
        total_users = len(self.users)
        
        all_ratings = []
        movie_rating_counts = {}
        for hist in self.user_history.values():
            for item in hist:
                all_ratings.append(item["rating"])
                iid = item["item_id"]
                movie_rating_counts[iid] = movie_rating_counts.get(iid, 0) + 1
                
        total_ratings = len(all_ratings)
        average_rating = sum(all_ratings) / total_ratings if total_ratings > 0 else 0
        
        # Rating distribution (0.5 to 5.0)
        rating_dist = {}
        for r in all_ratings:
            # Round to nearest 0.5
            r_rounded = round(r * 2) / 2
            rating_dist[r_rounded] = rating_dist.get(r_rounded, 0) + 1
        
        rating_distribution = [{"rating": str(k), "count": v} for k, v in sorted(rating_dist.items())]
        
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
        for iid, count in sorted(movie_rating_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
            meta = self.movie_lookup.get(iid, {"title": "Unknown", "scraped_title": ""})
            display_title = meta.get("scraped_title") or meta.get("title", "Unknown")
            top_rated_movies.append({"title": display_title, "count": count})
        
        return {
            "total_movies": total_movies,
            "total_users": total_users,
            "total_ratings": total_ratings,
            "average_rating": round(average_rating, 2),
            "top_genres": [{"name": g[0], "count": g[1]} for g in top_genres],
            "rating_distribution": rating_distribution,
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
        if not self.active_model_name.startswith("option3"):
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

    def get_model_config(self) -> Dict[str, Any]:
        self._ensure_active_model_fresh()
        
        # Try to load metrics and history for the active model
        active_metrics = None
        active_history = None
        diagnostics = None
        
        try:
            metrics_path = self.artifacts_dir / self.active_model_name / "metrics.json"
            if metrics_path.exists():
                import json
                with open(metrics_path, "r", encoding="utf-8") as f:
                    active_metrics = json.load(f)
                    
            history_path = self.artifacts_dir / self.active_model_name / "training_history.json"
            if history_path.exists():
                import json
                with open(history_path, "r", encoding="utf-8") as f:
                    active_history = json.load(f)
            diagnostics = self._build_option3_diagnostics()
        except Exception:
            pass

        return {
            "active_model": self.active_model_name,
            "available_models": list(self.models.keys()),
            "metrics": active_metrics,
            "history": active_history,
            "diagnostics": diagnostics,
        }
    
    def set_active_model(self, model_name: str) -> bool:
        self._ensure_loaded()
        if model_name not in self.models:
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
