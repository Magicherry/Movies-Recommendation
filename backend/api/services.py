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

        self.model = None
        self.movies: pd.DataFrame | None = None
        self.movie_lookup: Dict[int, Dict[str, Any]] = {}
        self.users: List[int] = []
        self.user_history: Dict[int, List[Dict[str, Any]]] = {}

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        with self._lock:
            if self._loaded:
                return

            model_path = self.artifacts_dir / "model.pkl"
            movies_path = self.artifacts_dir / "movies.csv"
            enriched_movies_path = self.artifacts_dir / "movies_enriched.csv"
            train_ratings_path = self.artifacts_dir / "train_ratings.csv"

            if not model_path.exists() or not movies_path.exists():
                raise FileNotFoundError(
                    "Model artifacts not found. Run: python -m scripts.train_and_evaluate"
                )

            with open(model_path, "rb") as f:
                self.model = pickle.load(f)
            
            if enriched_movies_path.exists():
                self.movies = pd.read_csv(enriched_movies_path)
                # Fill NaN with empty string
                self.movies.fillna("", inplace=True)
            else:
                self.movies = pd.read_csv(movies_path)
            
            self.movie_lookup = {}
            for row in self.movies.itertuples(index=False):
                self.movie_lookup[int(row.item_id)] = {
                    "item_id": int(row.item_id),
                    "title": row.title,
                    "genres": row.genres,
                    "poster_url": getattr(row, "poster_url", ""),
                    "backdrop_url": getattr(row, "backdrop_url", ""),
                    "overview": getattr(row, "overview", ""),
                }
            
            if train_ratings_path.exists():
                ratings = pd.read_csv(train_ratings_path)
                self.users = sorted(ratings["user_id"].astype(int).unique().tolist())
                self.user_history = {}
                for row in ratings.itertuples(index=False):
                    uid = int(row.user_id)
                    iid = int(row.item_id)
                    if uid not in self.user_history:
                        self.user_history[uid] = []
                    
                    meta = self.movie_lookup.get(iid, {"item_id": iid, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": ""})
                    self.user_history[uid].append({
                        "item_id": iid,
                        "title": meta["title"],
                        "genres": meta["genres"],
                        "poster_url": meta["poster_url"],
                        "backdrop_url": meta["backdrop_url"],
                        "overview": meta["overview"],
                        "rating": float(row.rating),
                    })
                
                # Sort history by rating descending
                for uid in self.user_history:
                    self.user_history[uid].sort(key=lambda x: x["rating"], reverse=True)
            else:
                # Fallback if no train_ratings.csv
                self.users = []

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
            frame = frame[frame["title"].str.lower().str.contains(query.strip().lower(), na=False)]
        
        if genre:
            frame = frame[frame["genres"].str.contains(genre.strip(), case=False, na=False)]
            
        if year:
            frame = frame[frame["title"].str.contains(f"({year.strip()})", regex=False, na=False)]

        sort_by = sort_by if sort_by in {"item_id", "title", "year"} else "item_id"
        sort_order = sort_order.lower()
        ascending = sort_order != "desc"

        sortable = frame.copy()
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
        frame = self.movies[self.movies["title"].str.lower().str.contains(q, na=False)].head(limit)
        return frame.to_dict(orient="records")

    def predict_rating(self, user_id: int, item_id: int) -> Dict[str, Any]:
        self._ensure_loaded()
        try:
            score = self.model.predict(user_id=user_id, item_id=item_id)
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": score}
        except RuntimeError:
            return {"user_id": user_id, "item_id": item_id, "predicted_rating": None}

    def recommend_for_user(self, user_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_loaded()
        if user_id not in self.users:
            raise ValueError(f"User ID {user_id} not found.")
        recs = self.model.recommend_top_n(user_id=user_id, n=n, exclude_seen=True)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(rec.item_id, {"item_id": rec.item_id, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": ""})
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
                    "score": float(rec.score),
                }
            )
        return enriched

    def similar_for_item(self, item_id: int, n: int = 10) -> List[Dict[str, Any]]:
        self._ensure_loaded()
        recs = self.model.similar_items(item_id=item_id, n=n)
        enriched = []
        for rec in recs:
            meta = self.movie_lookup.get(rec.item_id, {"item_id": rec.item_id, "title": "Unknown", "genres": "", "poster_url": "", "backdrop_url": "", "overview": ""})
            enriched.append(
                {
                    "item_id": int(rec.item_id),
                    "title": meta["title"],
                    "genres": meta["genres"],
                    "poster_url": meta.get("poster_url", ""),
                    "backdrop_url": meta.get("backdrop_url", ""),
                    "overview": meta.get("overview", ""),
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

service = RecommenderService()
