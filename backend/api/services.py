from __future__ import annotations

import pickle
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List

import pandas as pd


class RecommenderService:
    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parents[2]
        self.artifacts_dir = self.project_root / "models" / "artifacts"
        self._loaded = False
        self._lock = Lock()

        self.models = {}
        self.active_model_name = "option1"
        self.movies: pd.DataFrame | None = None
        self.movie_lookup: Dict[int, Dict[str, Any]] = {}
        self.movie_behavior_stats: pd.DataFrame = pd.DataFrame()
        self.users: List[int] = []
        self.user_history: Dict[int, List[Dict[str, Any]]] = {}

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            model_option1_path = self.artifacts_dir / "option1" / "model.pkl"
            model_option2_path = self.artifacts_dir / "option2" / "model.pkl"
            
            # Data files are common and stored in the root artifacts dir
            movies_path = self.artifacts_dir / "movies.csv"
            enriched_movies_path = self.artifacts_dir / "movies_enriched.csv"
            train_ratings_path = self.artifacts_dir / "train_ratings.csv"

            if not movies_path.exists():
                # Fallback to option1 dir if old structure
                movies_path = self.artifacts_dir / "option1" / "movies.csv"
                enriched_movies_path = self.artifacts_dir / "option1" / "movies_enriched.csv"
                train_ratings_path = self.artifacts_dir / "option1" / "train_ratings.csv"
                
                if not movies_path.exists():
                    raise FileNotFoundError(
                        "Model artifacts not found. Run: python -m scripts.train_and_evaluate"
                    )

            if model_option1_path.exists():
                with open(model_option1_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
            
            if model_option2_path.exists():
                with open(model_option2_path, "rb") as f:
                    self.models["option2"] = pickle.load(f)
            
            # Fallback to old model.pkl if specific ones don't exist
            old_model_path = self.artifacts_dir / "model.pkl"
            old_model_option1_path = self.artifacts_dir / "model_option1.pkl"
            old_model_option2_path = self.artifacts_dir / "model_option2.pkl"
            
            if "option1" not in self.models and old_model_option1_path.exists():
                with open(old_model_option1_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
                    
            if "option2" not in self.models and old_model_option2_path.exists():
                with open(old_model_option2_path, "rb") as f:
                    self.models["option2"] = pickle.load(f)
                    
            if not self.models and old_model_path.exists():
                with open(old_model_path, "rb") as f:
                    self.models["option1"] = pickle.load(f)
            
            if not self.models:
                raise FileNotFoundError("No models found. Run training script.")
            
            # Ensure active model is valid
            if self.active_model_name not in self.models:
                self.active_model_name = list(self.models.keys())[0]
            
            if enriched_movies_path.exists():
                self.movies = pd.read_csv(enriched_movies_path)
            else:
                self.movies = pd.read_csv(movies_path)

            text_cols = ("poster_url", "backdrop_url", "overview", "tmdb_id")
            for col in text_cols:
                if col not in self.movies.columns:
                    self.movies[col] = ""
                # Normalize to string dtype to avoid float/object mismatch when writing updates.
                self.movies[col] = self.movies[col].astype("string").fillna("")

            # Fill only existing object columns with "" and keep numeric columns untouched.
            for col in self.movies.columns:
                if col not in text_cols and pd.api.types.is_object_dtype(self.movies[col]):
                    self.movies[col] = self.movies[col].fillna("")

            self.movie_lookup = {}
            for row in self.movies.itertuples(index=False):
                raw_tmdb_id = getattr(row, "tmdb_id", "")
                if pd.isna(raw_tmdb_id):
                    norm_tmdb_id = ""
                elif isinstance(raw_tmdb_id, float) and raw_tmdb_id.is_integer():
                    norm_tmdb_id = str(int(raw_tmdb_id))
                else:
                    norm_tmdb_id = str(raw_tmdb_id).strip()
                self.movie_lookup[int(row.item_id)] = {
                    "item_id": int(row.item_id),
                    "title": row.title,
                    "genres": row.genres,
                    "poster_url": getattr(row, "poster_url", ""),
                    "backdrop_url": getattr(row, "backdrop_url", ""),
                    "overview": getattr(row, "overview", ""),
                    "tmdb_id": norm_tmdb_id,
                }
            
            if train_ratings_path.exists():
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
                    
                    meta = self.movie_lookup.get(iid, {"item_id": iid, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": "", "tmdb_id": ""})
                    self.user_history[uid].append({
                        "item_id": iid,
                        "title": meta["title"],
                        "genres": meta["genres"],
                        "poster_url": meta["poster_url"],
                        "backdrop_url": meta["backdrop_url"],
                        "overview": meta["overview"],
                        "tmdb_id": meta.get("tmdb_id", ""),
                        "rating": float(row.rating),
                    })
                
                # Sort history by rating descending
                for uid in self.user_history:
                    self.user_history[uid].sort(key=lambda x: x["rating"], reverse=True)
            else:
                # Fallback if no train_ratings.csv
                self.users = []
                self.movie_behavior_stats = pd.DataFrame(
                    columns=["item_id", "watched_count", "high_rating_count", "avg_rating", "behavior_score"]
                )

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
        self._ensure_loaded()
        assert self.movies is not None
        frame = self.movies

        if query:
            q = query.strip().lower()
            title_lower = frame["title"].str.lower()
            title_normalized = (
                frame["title"]
                .str.replace(r"\s*\([^)]*\)\s*", " ", regex=True)
                .str.replace(r"\s+", " ", regex=True)
                .str.strip()
                .str.lower()
            )
            mask = title_lower.str.contains(q, na=False, regex=False) | title_normalized.str.contains(q, na=False, regex=False)
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
            sortable["_sort_title"] = sortable["title"].str.replace(
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
        self._ensure_loaded()
        return self.movie_lookup.get(item_id)

    def search_movies(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        self._ensure_loaded()
        assert self.movies is not None
        q = query.strip().lower()
        if not q:
            return []
        title_lower = self.movies["title"].str.lower()
        title_normalized = (
            self.movies["title"]
            .str.replace(r"\s*\([^)]*\)\s*", " ", regex=True)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
            .str.lower()
        )
        mask = title_lower.str.contains(q, na=False, regex=False) | title_normalized.str.contains(q, na=False, regex=False)
        frame = self.movies[mask].head(limit)
        return frame.to_dict(orient="records")

    def predict_rating(self, user_id: int, item_id: int) -> Dict[str, Any]:
        self._ensure_loaded()
        try:
            model = self.models[self.active_model_name]
            score = model.predict(user_id=user_id, item_id=item_id)
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": score}
        except RuntimeError:
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": None}

    def recommend_for_user(self, user_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_loaded()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        model = self.models[self.active_model_name]
        recs = model.recommend_top_n(user_id=user_id, n=n, exclude_seen=True)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(rec.item_id, {"item_id": rec.item_id, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": "", "tmdb_id": ""})
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
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
        self._ensure_loaded()
        model = self.models[self.active_model_name]
        recs = model.similar_items(item_id=item_id, n=n)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(rec.item_id, {"item_id": rec.item_id, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": "", "tmdb_id": ""})
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
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
        self._ensure_loaded()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        history = self.user_history.get(user_id, [])
        # We can return all history here if limit=0, or let the API caller decide.
        if limit == 0:
            return history
        return history[:limit]

    def list_users(self, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        self._ensure_loaded()
        total = len(self.users)
        users_page = self.users[offset:offset+limit]
        return {
            "total": total,
            "items": [{"user_id": u, "history_count": len(self.user_history.get(u, []))} for u in users_page]
        }

    def get_db_stats(self) -> Dict[str, Any]:
        self._ensure_loaded()
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
            meta = self.movie_lookup.get(iid, {"title": "Unknown"})
            top_rated_movies.append({"title": meta["title"], "count": count})
        
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

    def get_model_config(self) -> Dict[str, Any]:
        self._ensure_loaded()
        
        # Try to load metrics and history for the active model
        active_metrics = None
        active_history = None
        
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
        except Exception:
            pass

        return {
            "active_model": self.active_model_name,
            "available_models": list(self.models.keys()),
            "metrics": active_metrics,
            "history": active_history
        }
    
    def set_active_model(self, model_name: str) -> bool:
        self._ensure_loaded()
        if model_name in self.models:
            self.active_model_name = model_name
            return True
        return False

    def update_movie_enriched(
        self,
        item_id: int,
        poster_url: str | None = None,
        backdrop_url: str | None = None,
        overview: str | None = None,
        tmdb_id: int | None = None,
    ) -> bool:
        """Update one movie's enriched fields and persist to movies_enriched.csv."""
        self._ensure_loaded()
        if self.movies is None or item_id not in self.movie_lookup:
            return False
        for col in ("poster_url", "backdrop_url", "overview", "tmdb_id"):
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
        out_path = self.artifacts_dir / "movies_enriched.csv"
        self.movies.to_csv(out_path, index=False)
        return True

service = RecommenderService()
