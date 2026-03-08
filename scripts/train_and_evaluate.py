from __future__ import annotations

import argparse
import json
import pickle
from pathlib import Path

from models.option1_recommender import Option1MatrixFactorizationSGD
from scripts.data_pipeline import load_movielens, split_train_test_by_user
from scripts.evaluation import evaluate_rating_prediction, evaluate_top_n


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and evaluate Option 1 recommender.")
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="dataset/ml-latest-small",
        help="Path to MovieLens dataset directory.",
    )
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Per-user holdout ratio.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for split.")
    parser.add_argument("--top-k", type=int, default=10, help="Top-K for recommendation metrics.")
    parser.add_argument("--n-factors", type=int, default=48, help="Number of latent factors in MF.")
    parser.add_argument("--epochs", type=int, default=30, help="Number of SGD epochs.")
    parser.add_argument("--lr", type=float, default=0.01, help="Initial learning rate for SGD.")
    parser.add_argument("--reg", type=float, default=0.05, help="L2 regularization strength.")
    parser.add_argument("--lr-decay", type=float, default=0.98, help="Learning-rate decay after each epoch.")
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default="models/artifacts",
        help="Directory to save model artifacts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir)
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    ratings, movies = load_movielens(dataset_dir)
    split = split_train_test_by_user(
        ratings=ratings,
        test_ratio=args.test_ratio,
        random_state=args.seed,
    )

    model = Option1MatrixFactorizationSGD(
        n_factors=args.n_factors,
        epochs=args.epochs,
        lr=args.lr,
        reg=args.reg,
        lr_decay=args.lr_decay,
        seed=args.seed,
    )
    model.fit(split.train)

    rating_metrics = evaluate_rating_prediction(model, split.test)
    topn_metrics = evaluate_top_n(model, split.train, split.test, k=args.top_k)
    metrics = {
        "dataset_dir": str(dataset_dir),
        "train_size": int(len(split.train)),
        "test_size": int(len(split.test)),
        "users_train": int(split.train["user_id"].nunique()),
        "items_train": int(split.train["item_id"].nunique()),
        "model": "matrix_factorization_sgd",
        "n_factors": int(args.n_factors),
        "epochs": int(args.epochs),
        "lr": float(args.lr),
        "reg": float(args.reg),
        "lr_decay": float(args.lr_decay),
        "top_k": int(args.top_k),
        **rating_metrics,
        **topn_metrics,
    }

    with open(artifacts_dir / "model.pkl", "wb") as f:
        pickle.dump(model, f)
    movies.to_csv(artifacts_dir / "movies.csv", index=False)
    split.train.to_csv(artifacts_dir / "train_ratings.csv", index=False)
    split.test.to_csv(artifacts_dir / "test_ratings.csv", index=False)
    with open(artifacts_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    print("Training and evaluation completed.")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
