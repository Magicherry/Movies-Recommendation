from __future__ import annotations

import argparse
import csv
import json
import pickle
from pathlib import Path

from models.option1_recommender import Option1MatrixFactorizationSGD
from models.option2_recommender import Option2DeepRecommender
from scripts.data_pipeline import load_movielens, split_train_test_by_user
from scripts.evaluation import evaluate_rating_prediction, evaluate_top_n


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and evaluate recommender models.")
    parser.add_argument(
        "--model-type",
        type=str,
        default="option1",
        choices=["option1", "option2"],
        help="Which model to train: option1 (MF SGD) or option2 (Deep NCF).",
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="dataset/ml-latest-small",
        help="Path to MovieLens dataset directory.",
    )
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Per-user holdout ratio.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for split.")
    parser.add_argument("--top-k", type=int, default=10, help="Top-K for recommendation metrics.")
    parser.add_argument(
        "--min-relevant-rating",
        type=float,
        default=4.0,
        help="Minimum test rating treated as relevant item for Top-K metrics.",
    )
    parser.add_argument(
        "--n-factors",
        type=int,
        default=48,
        help="Latent size (option1 factors / option2 embedding dimension).",
    )
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs.")
    parser.add_argument("--lr", type=float, default=0.01, help="Initial learning rate for SGD.")
    parser.add_argument("--reg", type=float, default=0.05, help="L2 regularization strength.")
    parser.add_argument("--lr-decay", type=float, default=0.98, help="Learning-rate decay after each epoch.")
    parser.add_argument("--batch-size", type=int, default=256, help="Mini-batch size used by deep model.")
    parser.add_argument(
        "--option2-lr",
        type=float,
        default=0.001,
        help="Learning rate for option2 deep model.",
    )
    parser.add_argument(
        "--option2-dropout-rate",
        type=float,
        default=0.15,
        help="Dropout rate for option2.",
    )
    parser.add_argument(
        "--option2-l2-reg",
        type=float,
        default=1e-6,
        help="L2 regularization strength for option2.",
    )
    parser.add_argument(
        "--option2-validation-split",
        type=float,
        default=0.1,
        help="Validation split ratio for option2.",
    )
    parser.add_argument(
        "--option2-early-stopping-patience",
        type=int,
        default=3,
        help="Early stopping patience for option2.",
    )
    parser.add_argument(
        "--option2-lr-plateau-patience",
        type=int,
        default=2,
        help="ReduceLROnPlateau patience for option2.",
    )
    parser.add_argument(
        "--option2-lr-plateau-factor",
        type=float,
        default=0.5,
        help="ReduceLROnPlateau factor for option2.",
    )
    parser.add_argument(
        "--option2-min-lr",
        type=float,
        default=1e-5,
        help="Minimum learning rate for option2 scheduler.",
    )
    parser.add_argument(
        "--option2-rating-weight-power",
        type=float,
        default=1.25,
        help="Power for rating-based sample weighting in option2.",
    )
    parser.add_argument(
        "--option2-popularity-prior-count",
        type=float,
        default=20.0,
        help="Prior count for popularity smoothing in option2 cold-start fallback.",
    )
    parser.add_argument("--title-max-len", type=int, default=15, help="Max title token length for option2.")
    parser.add_argument(
        "--title-vocab-size",
        type=int,
        default=20000,
        help="Title vocabulary size for option2.",
    )
    parser.add_argument(
        "--title-embedding-dim",
        type=int,
        default=32,
        help="Title token embedding dimension for option2.",
    )
    parser.add_argument(
        "--title-num-filters",
        type=int,
        default=32,
        help="Number of CNN filters per title kernel for option2.",
    )
    parser.add_argument(
        "--genre-max-len",
        type=int,
        default=4,
        help="Max number of genre tokens per movie in option2.",
    )
    parser.add_argument(
        "--genre-embedding-dim",
        type=int,
        default=8,
        help="Genre embedding dimension for option2.",
    )
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

    model_artifacts_dir = artifacts_dir / args.model_type
    model_artifacts_dir.mkdir(parents=True, exist_ok=True)

    ratings, movies = load_movielens(dataset_dir)
    split = split_train_test_by_user(
        ratings=ratings,
        test_ratio=args.test_ratio,
        random_state=args.seed,
    )

    if args.model_type == "option1":
        model = Option1MatrixFactorizationSGD(
            n_factors=args.n_factors,
            epochs=args.epochs,
            lr=args.lr,
            reg=args.reg,
            lr_decay=args.lr_decay,
            seed=args.seed,
        )
    else:
        model = Option2DeepRecommender(
            embedding_dim=args.n_factors,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.option2_lr,
            seed=args.seed,
            title_max_len=args.title_max_len,
            title_vocab_size=args.title_vocab_size,
            title_embedding_dim=args.title_embedding_dim,
            title_num_filters=args.title_num_filters,
            genre_max_len=args.genre_max_len,
            genre_embedding_dim=args.genre_embedding_dim,
            dropout_rate=args.option2_dropout_rate,
            l2_reg=args.option2_l2_reg,
            validation_split=args.option2_validation_split,
            early_stopping_patience=args.option2_early_stopping_patience,
            lr_plateau_patience=args.option2_lr_plateau_patience,
            lr_plateau_factor=args.option2_lr_plateau_factor,
            min_lr=args.option2_min_lr,
            rating_weight_power=args.option2_rating_weight_power,
            popularity_prior_count=args.option2_popularity_prior_count,
        )

    if args.model_type == "option2":
        model.fit(split.train, movies=movies)
    else:
        model.fit(split.train)

    rating_metrics = evaluate_rating_prediction(model, split.test)
    topn_metrics = evaluate_top_n(
        model,
        split.train,
        split.test,
        k=args.top_k,
        min_relevant_rating=args.min_relevant_rating,
    )

    if args.model_type == "option1":
        model_hparams = {
            "n_factors": int(args.n_factors),
            "epochs": int(args.epochs),
            "lr": float(args.lr),
            "reg": float(args.reg),
            "lr_decay": float(args.lr_decay),
        }
    else:
        model_hparams = {
            "embedding_dim": int(args.n_factors),
            "epochs": int(args.epochs),
            "batch_size": int(args.batch_size),
            "lr": float(args.option2_lr),
            "title_max_len": int(args.title_max_len),
            "title_vocab_size": int(args.title_vocab_size),
            "title_embedding_dim": int(args.title_embedding_dim),
            "title_num_filters": int(args.title_num_filters),
            "genre_max_len": int(args.genre_max_len),
            "genre_embedding_dim": int(args.genre_embedding_dim),
            "dropout_rate": float(args.option2_dropout_rate),
            "l2_reg": float(args.option2_l2_reg),
            "validation_split": float(args.option2_validation_split),
            "early_stopping_patience": int(args.option2_early_stopping_patience),
            "lr_plateau_patience": int(args.option2_lr_plateau_patience),
            "lr_plateau_factor": float(args.option2_lr_plateau_factor),
            "min_lr": float(args.option2_min_lr),
            "rating_weight_power": float(args.option2_rating_weight_power),
            "popularity_prior_count": float(args.option2_popularity_prior_count),
        }

    metrics = {
        "dataset_dir": str(dataset_dir),
        "train_size": int(len(split.train)),
        "test_size": int(len(split.test)),
        "users_train": int(split.train["user_id"].nunique()),
        "items_train": int(split.train["item_id"].nunique()),
        "model": args.model_type,
        "top_k": int(args.top_k),
        "min_relevant_rating": float(args.min_relevant_rating),
        **model_hparams,
        **rating_metrics,
        **topn_metrics,
    }

    with open(model_artifacts_dir / "model.pkl", "wb") as f:
        pickle.dump(model, f)
    
    # Save common data files to root artifacts dir
    movies.to_csv(artifacts_dir / "movies.csv", index=False)
    split.train.to_csv(artifacts_dir / "train_ratings.csv", index=False)
    split.test.to_csv(artifacts_dir / "test_ratings.csv", index=False)
    
    with open(model_artifacts_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    history = getattr(model, "training_history", None)
    if history:
        if history.get("val_loss"):
            best_epoch = int(min(range(len(history["val_loss"])), key=lambda i: history["val_loss"][i]) + 1)
            metrics["best_epoch"] = best_epoch
        elif history.get("train_rmse"):
            best_epoch = int(
                min(range(len(history["train_rmse"])), key=lambda i: history["train_rmse"][i]) + 1
            )
            metrics["best_epoch"] = best_epoch

        with open(model_artifacts_dir / "metrics.json", "w", encoding="utf-8") as f:
            json.dump(metrics, f, indent=2)

        with open(model_artifacts_dir / "training_history.json", "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)

        history_keys = list(history.keys())
        epochs = max((len(history[key]) for key in history_keys), default=0)
        with open(model_artifacts_dir / "training_history.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["epoch", *history_keys])
            for i in range(epochs):
                writer.writerow(
                    [i + 1, *[history[key][i] if i < len(history[key]) else "" for key in history_keys]]
                )

    print("Training and evaluation completed.")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
