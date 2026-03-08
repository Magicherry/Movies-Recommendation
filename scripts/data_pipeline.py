from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Tuple

import numpy as np
import pandas as pd


@dataclass
class DataSplit:
    train: pd.DataFrame
    test: pd.DataFrame


def _load_csv_format(dataset_dir: Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    ratings_path = dataset_dir / "ratings.csv"
    movies_path = dataset_dir / "movies.csv"
    if not ratings_path.exists() or not movies_path.exists():
        raise FileNotFoundError("ratings.csv or movies.csv not found for CSV format.")

    ratings = pd.read_csv(ratings_path)
    movies = pd.read_csv(movies_path)

    ratings = ratings.rename(
        columns={"userId": "user_id", "movieId": "item_id", "rating": "rating", "timestamp": "timestamp"}
    )
    movies = movies.rename(columns={"movieId": "item_id", "title": "title", "genres": "genres"})
    return ratings[["user_id", "item_id", "rating", "timestamp"]], movies[["item_id", "title", "genres"]]


def _load_dat_format(dataset_dir: Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    ratings_path = dataset_dir / "ratings.dat"
    movies_path = dataset_dir / "movies.dat"
    if not ratings_path.exists() or not movies_path.exists():
        raise FileNotFoundError("ratings.dat or movies.dat not found for DAT format.")

    ratings = pd.read_csv(
        ratings_path,
        sep="::",
        engine="python",
        names=["user_id", "item_id", "rating", "timestamp"],
    )
    movies = pd.read_csv(
        movies_path,
        sep="::",
        engine="python",
        names=["item_id", "title", "genres"],
        encoding="latin-1",
    )
    return ratings, movies


def load_movielens(dataset_dir: str | Path) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Load MovieLens ratings and movie metadata from CSV or DAT formats.
    """
    dataset_dir = Path(dataset_dir)
    if (dataset_dir / "ratings.csv").exists():
        ratings, movies = _load_csv_format(dataset_dir)
    elif (dataset_dir / "ratings.dat").exists():
        ratings, movies = _load_dat_format(dataset_dir)
    else:
        raise FileNotFoundError("No supported MovieLens ratings file found (ratings.csv or ratings.dat).")

    ratings["user_id"] = ratings["user_id"].astype(int)
    ratings["item_id"] = ratings["item_id"].astype(int)
    ratings["rating"] = ratings["rating"].astype(float)
    ratings["timestamp"] = ratings["timestamp"].astype("int64")
    movies["item_id"] = movies["item_id"].astype(int)
    return ratings, movies


def split_train_test_by_user(
    ratings: pd.DataFrame,
    test_ratio: float = 0.2,
    random_state: int = 42,
    min_test_items: int = 1,
) -> DataSplit:
    """
    Split ratings by user: 80/20 random holdout per user (default).
    """
    if not 0 < test_ratio < 1:
        raise ValueError("test_ratio must be in (0, 1).")

    rng = np.random.default_rng(random_state)
    train_parts = []
    test_parts = []

    for _, user_df in ratings.groupby("user_id", sort=False):
        if len(user_df) <= 1:
            train_parts.append(user_df)
            continue

        idx = user_df.index.to_numpy().copy()
        rng.shuffle(idx)

        n_test = max(min_test_items, int(round(len(idx) * test_ratio)))
        n_test = min(n_test, len(idx) - 1)

        test_idx = idx[:n_test]
        train_idx = idx[n_test:]
        train_parts.append(ratings.loc[train_idx])
        test_parts.append(ratings.loc[test_idx])

    train = pd.concat(train_parts, ignore_index=True)
    test = pd.concat(test_parts, ignore_index=True) if test_parts else pd.DataFrame(columns=ratings.columns)

    train = train.sort_values(["user_id", "item_id"]).reset_index(drop=True)
    test = test.sort_values(["user_id", "item_id"]).reset_index(drop=True)
    return DataSplit(train=train, test=test)


def build_seen_items(train_ratings: pd.DataFrame) -> Dict[int, set[int]]:
    seen: Dict[int, set[int]] = {}
    for user_id, group in train_ratings.groupby("user_id"):
        seen[int(user_id)] = set(group["item_id"].astype(int).tolist())
    return seen
