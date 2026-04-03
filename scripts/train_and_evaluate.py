from __future__ import annotations

import argparse
import csv
import hashlib
import json
import pickle
import sys
from pathlib import Path

import pandas as pd

from models.option1_recommender import Option1MatrixFactorizationSGD
from models.option2_recommender import Option2DeepRecommender
from models.option3_recommender import Option3SVDHybridRecommender
from models.option4_recommender import Option4ALSRecommender
from scripts.data_pipeline import DataSplit, load_movielens, split_train_test_by_user
from scripts.evaluation import evaluate_rating_prediction, evaluate_top_n


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train and evaluate recommender models.")
    parser.add_argument(
        "--model-type",
        type=str,
        default="option1",
        choices=["option1", "option2", "option3_ridge", "option3_lasso", "option4"],
        help=(
            "Which model to train: option1 (MF SGD), option2 (Deep NCF), "
            "option3_ridge (SVD + Ridge), option3_lasso (SVD + Lasso), or option4 (MF-ALS)."
        ),
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="dataset/ml-latest",
        help="Path to MovieLens dataset directory.",
    )
    parser.add_argument("--test-ratio", type=float, default=0.2, help="Per-user holdout ratio.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for split.")
    parser.add_argument("--top-k", type=int, default=10, help="Top-K for recommendation metrics.")
    parser.add_argument(
        "--min-relevant-rating",
        type=float,
        default=4.0,
        help="Minimum test rating treated as relevant item when topn-relevance=rating_threshold.",
    )
    parser.add_argument(
        "--topn-relevance",
        type=str,
        default="all_test",
        choices=["all_test", "rating_threshold"],
        help="Top-K relevance definition: use all holdout test items (CS550 default) or rating threshold.",
    )
    parser.add_argument(
        "--n-factors",
        type=int,
        default=48,
        help="Latent size (option1 factors / option2 embedding dimension / option4 factors).",
    )
    parser.add_argument("--epochs", type=int, default=30, help="Number of training epochs.")
    parser.add_argument("--lr", type=float, default=0.01, help="Initial learning rate for SGD.")
    parser.add_argument("--reg", type=float, default=0.05, help="L2 regularization strength.")
    parser.add_argument("--lr-decay", type=float, default=0.98, help="Learning-rate decay after each epoch.")
    parser.add_argument(
        "--option1-validation-split",
        type=float,
        default=0.1,
        help="Validation split ratio for option1.",
    )
    parser.add_argument(
        "--option1-early-stopping-patience",
        type=int,
        default=6,
        help="Early stopping patience for option1 (0 disables).",
    )
    parser.add_argument(
        "--option1-batch-size",
        type=int,
        default=16384,
        help="Mini-batch size for option1 PyTorch training.",
    )
    parser.add_argument("--batch-size", type=int, default=256, help="Mini-batch size used by option2 deep model.")
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
        "--option2-early-stopping-patience",
        type=int,
        default=5,
        help="Early stopping patience for option2 (0 disables).",
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
        "--option3-regressor",
        type=str,
        default="ridge",
        choices=["ridge", "lasso"],
        help="Regression head for option3 variants over SVD latent features.",
    )
    parser.add_argument(
        "--option3-reg-alpha",
        type=float,
        default=0.1,
        help="Regularization strength used by option3 variants.",
    )
    parser.add_argument(
        "--option3-lasso-max-iter",
        type=int,
        default=200,
        help="Maximum coordinate-descent iterations for option3_lasso.",
    )
    parser.add_argument(
        "--option3-lasso-tol",
        type=float,
        default=1e-4,
        help="Convergence tolerance for option3_lasso.",
    )
    parser.add_argument(
        "--option3-bias-reg",
        type=float,
        default=10.0,
        help="Shrinkage used when estimating option3 variant user/item biases.",
    )
    parser.add_argument(
        "--option4-bias-reg",
        type=float,
        default=5.0,
        help="Ridge penalty for the bias term in option4 MF-ALS updates.",
    )
    parser.add_argument(
        "--option4-validation-split",
        type=float,
        default=0.1,
        help="Validation split ratio for option4 MF-ALS.",
    )
    parser.add_argument(
        "--option4-early-stopping-patience",
        type=int,
        default=6,
        help="Early stopping patience for option4 MF-ALS (0 disables).",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default="models/artifacts",
        help="Directory to save model artifacts.",
    )
    parser.add_argument(
        "--force-resplit",
        action="store_true",
        help="Force regeneration of shared train/test split under artifacts/splits.",
    )
    return parser.parse_args()


def _flag_was_provided(flag: str) -> bool:
    return any(arg == flag or arg.startswith(f"{flag}=") for arg in sys.argv[1:])


def _detect_cuda_total_memory_gb() -> float | None:
    try:
        import torch  # pyright: ignore[reportMissingImports]
    except Exception:
        return None

    if not torch.cuda.is_available() or torch.cuda.device_count() <= 0:
        return None
    props = torch.cuda.get_device_properties(0)
    return float(props.total_memory) / float(1024**3)


def _auto_tune_model_hparams(args: argparse.Namespace) -> list[str]:
    notes: list[str] = []
    model_type = str(args.model_type)
    cuda_mem_gb = _detect_cuda_total_memory_gb()
    has_cuda = cuda_mem_gb is not None

    if model_type == "option1":
        if not _flag_was_provided("--n-factors"):
            args.n_factors = 64
            notes.append("option1 n_factors -> 64")
        if not _flag_was_provided("--epochs"):
            args.epochs = 50
            notes.append("option1 epochs -> 50")
        if not _flag_was_provided("--lr"):
            args.lr = 0.005
            notes.append("option1 lr -> 0.005")
        if not _flag_was_provided("--reg"):
            args.reg = 0.02
            notes.append("option1 reg -> 0.02")
        if not _flag_was_provided("--lr-decay"):
            args.lr_decay = 0.97
            notes.append("option1 lr_decay -> 0.97")
        if not _flag_was_provided("--option1-early-stopping-patience"):
            args.option1_early_stopping_patience = 6
            notes.append("option1 early_stopping_patience -> 6")
        if not _flag_was_provided("--option1-batch-size"):
            if has_cuda:
                if cuda_mem_gb >= 20:
                    args.option1_batch_size = 131072
                elif cuda_mem_gb >= 12:
                    args.option1_batch_size = 65536
                else:
                    args.option1_batch_size = 32768
                notes.append(f"option1 batch_size -> {args.option1_batch_size} (auto from GPU memory)")
            else:
                args.option1_batch_size = 16384
                notes.append("option1 batch_size -> 16384 (CPU fallback)")

    elif model_type == "option2":
        if not _flag_was_provided("--n-factors"):
            args.n_factors = 96
            notes.append("option2 n_factors -> 96")
        if not _flag_was_provided("--epochs"):
            args.epochs = 50
            notes.append("option2 epochs -> 50")
        if not _flag_was_provided("--option2-lr"):
            args.option2_lr = 8e-4
            notes.append("option2 lr -> 8e-4")
        if not _flag_was_provided("--option2-dropout-rate"):
            args.option2_dropout_rate = 0.18
            notes.append("option2 dropout -> 0.18")
        if not _flag_was_provided("--option2-l2-reg"):
            args.option2_l2_reg = 1e-5
            notes.append("option2 l2_reg -> 1e-5")
        if not _flag_was_provided("--option2-validation-split"):
            args.option2_validation_split = 0.10
            notes.append("option2 validation_split -> 0.10")
        if not _flag_was_provided("--option2-lr-plateau-patience"):
            args.option2_lr_plateau_patience = 4
            notes.append("option2 lr_plateau_patience -> 4")
        if not _flag_was_provided("--option2-early-stopping-patience"):
            args.option2_early_stopping_patience = 5
            notes.append("option2 early_stopping_patience -> 5")
        if not _flag_was_provided("--title-embedding-dim"):
            args.title_embedding_dim = 48
            notes.append("option2 title_embedding_dim -> 48")
        if not _flag_was_provided("--title-num-filters"):
            args.title_num_filters = 96
            notes.append("option2 title_num_filters -> 96")
        if not _flag_was_provided("--batch-size"):
            if has_cuda:
                if cuda_mem_gb >= 20:
                    args.batch_size = 65536
                elif cuda_mem_gb >= 12:
                    args.batch_size = 32768
                else:
                    args.batch_size = 16384
                notes.append(f"option2 batch_size -> {args.batch_size} (auto from GPU memory)")
            else:
                args.batch_size = 4096
                notes.append("option2 batch_size -> 4096 (CPU fallback)")

    elif model_type in {"option3_ridge", "option3_lasso"}:
        if not _flag_was_provided("--n-factors"):
            args.n_factors = 200
            notes.append("option3 n_factors -> 200")
        if not _flag_was_provided("--option3-bias-reg"):
            args.option3_bias_reg = 12.0
            notes.append("option3 bias_reg -> 12.0")

        if model_type == "option3_ridge":
            if not _flag_was_provided("--option3-reg-alpha"):
                args.option3_reg_alpha = 0.08
                notes.append("option3_ridge reg_alpha -> 0.08")
        else:
            if not _flag_was_provided("--option3-reg-alpha"):
                args.option3_reg_alpha = 0.008
                notes.append("option3_lasso reg_alpha -> 0.008")
            if not _flag_was_provided("--option3-lasso-max-iter"):
                args.option3_lasso_max_iter = 2000
                notes.append("option3_lasso max_iter -> 2000")
            if not _flag_was_provided("--option3-lasso-tol"):
                args.option3_lasso_tol = 1e-5
                notes.append("option3_lasso tol -> 1e-5")

        if has_cuda:
            notes.append("option3 uses CUDA sparse randomized SVD when available")

    elif model_type == "option4":
        if not _flag_was_provided("--n-factors"):
            args.n_factors = 96
            notes.append("option4 n_factors -> 96")
        if not _flag_was_provided("--epochs"):
            args.epochs = 40
            notes.append("option4 epochs -> 40")
        if not _flag_was_provided("--reg"):
            args.reg = 0.10
            notes.append("option4 reg -> 0.10")
        if not _flag_was_provided("--option4-bias-reg"):
            args.option4_bias_reg = 6.0
            notes.append("option4 bias_reg -> 6.0")
        if not _flag_was_provided("--option4-early-stopping-patience"):
            args.option4_early_stopping_patience = 6
            notes.append("option4 early_stopping_patience -> 6")

    return notes


def _normalize_split_frame(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame[["user_id", "item_id", "rating", "timestamp"]].copy()
    normalized["user_id"] = normalized["user_id"].astype(int)
    normalized["item_id"] = normalized["item_id"].astype(int)
    normalized["rating"] = normalized["rating"].astype(float)
    normalized["timestamp"] = normalized["timestamp"].astype("int64")
    return normalized.sort_values(["user_id", "item_id", "timestamp"], kind="mergesort").reset_index(drop=True)


def _compute_split_hash(split: DataSplit) -> str:
    digest = hashlib.sha256()
    for split_name, frame in (("train", split.train), ("test", split.test)):
        normalized = _normalize_split_frame(frame)
        row_hashes = pd.util.hash_pandas_object(normalized, index=False).to_numpy(dtype="uint64")
        digest.update(split_name.encode("utf-8"))
        digest.update(row_hashes.tobytes())
    return digest.hexdigest()


def _load_or_create_shared_split(
    ratings: pd.DataFrame,
    artifacts_dir: Path,
    dataset_dir: Path,
    test_ratio: float,
    seed: int,
    force_resplit: bool,
) -> tuple[DataSplit, str, str]:
    split_dir = artifacts_dir / "splits"
    split_dir.mkdir(parents=True, exist_ok=True)

    train_split_path = split_dir / "train_ratings.csv"
    test_split_path = split_dir / "test_ratings.csv"
    split_meta_path = split_dir / "split_meta.json"

    expected_dataset_dir = str(dataset_dir.resolve())
    can_reuse_cached_split = (
        not force_resplit
        and train_split_path.exists()
        and test_split_path.exists()
        and split_meta_path.exists()
    )

    if can_reuse_cached_split:
        try:
            with open(split_meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
            if (
                int(meta.get("seed", -1)) == int(seed)
                and float(meta.get("test_ratio", -1.0)) == float(test_ratio)
                and str(meta.get("dataset_dir", "")) == expected_dataset_dir
            ):
                train = _normalize_split_frame(pd.read_csv(train_split_path))
                test = _normalize_split_frame(pd.read_csv(test_split_path))
                split = DataSplit(train=train, test=test)
                split_hash = str(meta.get("split_hash") or _compute_split_hash(split))
                return split, split_hash, "cached"
        except (ValueError, OSError, json.JSONDecodeError, KeyError):
            pass

    split = split_train_test_by_user(
        ratings=ratings,
        test_ratio=test_ratio,
        random_state=seed,
    )
    split = DataSplit(
        train=_normalize_split_frame(split.train),
        test=_normalize_split_frame(split.test),
    )
    split_hash = _compute_split_hash(split)

    split.train.to_csv(train_split_path, index=False)
    split.test.to_csv(test_split_path, index=False)
    split_meta = {
        "dataset_dir": expected_dataset_dir,
        "seed": int(seed),
        "test_ratio": float(test_ratio),
        "split_hash": split_hash,
        "train_size": int(len(split.train)),
        "test_size": int(len(split.test)),
    }
    with open(split_meta_path, "w", encoding="utf-8") as f:
        json.dump(split_meta, f, indent=2)
    return split, split_hash, "generated"


def main() -> None:
    args = parse_args()
    tuned_notes = _auto_tune_model_hparams(args)
    if tuned_notes:
        print("[AutoTune] Applied model/hardware-aware defaults:")
        for line in tuned_notes:
            print(f"  - {line}")

    dataset_dir = Path(args.dataset_dir)
    artifacts_dir = Path(args.artifacts_dir)
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    effective_model_type = str(args.model_type)
    effective_option3_regressor = str(args.option3_regressor)
    if effective_model_type == "option3_ridge":
        effective_option3_regressor = "ridge"
    elif effective_model_type == "option3_lasso":
        effective_option3_regressor = "lasso"

    model_artifacts_dir = artifacts_dir / effective_model_type
    model_artifacts_dir.mkdir(parents=True, exist_ok=True)

    ratings, movies = load_movielens(dataset_dir)
    split, split_hash, split_source = _load_or_create_shared_split(
        ratings=ratings,
        artifacts_dir=artifacts_dir,
        dataset_dir=dataset_dir,
        test_ratio=args.test_ratio,
        seed=args.seed,
        force_resplit=args.force_resplit,
    )

    if effective_model_type == "option1":
        model = Option1MatrixFactorizationSGD(
            n_factors=args.n_factors,
            epochs=args.epochs,
            lr=args.lr,
            reg=args.reg,
            lr_decay=args.lr_decay,
            batch_size=args.option1_batch_size,
            validation_split=args.option1_validation_split,
            early_stopping_patience=args.option1_early_stopping_patience,
            seed=args.seed,
        )
    elif effective_model_type == "option2":
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
            lr_plateau_patience=args.option2_lr_plateau_patience,
            lr_plateau_factor=args.option2_lr_plateau_factor,
            min_lr=args.option2_min_lr,
            early_stopping_patience=args.option2_early_stopping_patience,
            rating_weight_power=args.option2_rating_weight_power,
            popularity_prior_count=args.option2_popularity_prior_count,
        )
    elif effective_model_type == "option4":
        model = Option4ALSRecommender(
            n_factors=args.n_factors,
            epochs=args.epochs,
            reg=args.reg,
            bias_reg=args.option4_bias_reg,
            validation_split=args.option4_validation_split,
            early_stopping_patience=args.option4_early_stopping_patience,
            seed=args.seed,
        )
    elif effective_model_type in {"option3_ridge", "option3_lasso"}:
        model = Option3SVDHybridRecommender(
            n_factors=args.n_factors,
            regressor=effective_option3_regressor,
            reg_alpha=args.option3_reg_alpha,
            lasso_max_iter=args.option3_lasso_max_iter,
            lasso_tol=args.option3_lasso_tol,
            bias_reg=args.option3_bias_reg,
            seed=args.seed,
        )
    else:
        raise ValueError(f"Unsupported model type: {effective_model_type}")

    if effective_model_type == "option2":
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
        use_all_test_items=args.topn_relevance == "all_test",
    )

    if effective_model_type == "option1":
        model_hparams = {
            "n_factors": int(args.n_factors),
            "epochs": int(args.epochs),
            "lr": float(args.lr),
            "reg": float(args.reg),
            "lr_decay": float(args.lr_decay),
            "batch_size": int(args.option1_batch_size),
            "validation_split": float(args.option1_validation_split),
            "early_stopping_patience": int(args.option1_early_stopping_patience),
        }
    elif effective_model_type == "option2":
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
            "lr_plateau_patience": int(args.option2_lr_plateau_patience),
            "lr_plateau_factor": float(args.option2_lr_plateau_factor),
            "min_lr": float(args.option2_min_lr),
            "early_stopping_patience": int(args.option2_early_stopping_patience),
            "rating_weight_power": float(args.option2_rating_weight_power),
            "popularity_prior_count": float(args.option2_popularity_prior_count),
        }
    elif effective_model_type == "option4":
        model_hparams = {
            "n_factors": int(args.n_factors),
            "epochs": int(args.epochs),
            "reg": float(args.reg),
            "bias_reg": float(args.option4_bias_reg),
            "validation_split": float(args.option4_validation_split),
            "early_stopping_patience": int(args.option4_early_stopping_patience),
        }
    elif effective_model_type in {"option3_ridge", "option3_lasso"}:
        model_hparams = {
            "n_factors": int(args.n_factors),
            "regressor": str(effective_option3_regressor),
            "reg_alpha": float(args.option3_reg_alpha),
            "lasso_max_iter": int(args.option3_lasso_max_iter),
            "lasso_tol": float(args.option3_lasso_tol),
            "bias_reg": float(args.option3_bias_reg),
        }
    else:
        raise ValueError(f"Unsupported model type: {effective_model_type}")

    metrics = {
        "dataset_dir": str(dataset_dir),
        "seed": int(args.seed),
        "test_ratio": float(args.test_ratio),
        "split_hash": split_hash,
        "split_source": split_source,
        "train_size": int(len(split.train)),
        "test_size": int(len(split.test)),
        "users_train": int(split.train["user_id"].nunique()),
        "items_train": int(split.train["item_id"].nunique()),
        "model": effective_model_type,
        "top_k": int(args.top_k),
        "topn_relevance": args.topn_relevance,
        "min_relevant_rating": float(args.min_relevant_rating),
        **model_hparams,
        **rating_metrics,
        **topn_metrics,
    }

    with open(model_artifacts_dir / "model.pkl", "wb") as f:
        pickle.dump(model, f)
    
    # Keep MovieLens metadata in dataset_dir as the single source of truth.
    split.train.to_csv(model_artifacts_dir / "train_ratings.csv", index=False)
    split.test.to_csv(model_artifacts_dir / "test_ratings.csv", index=False)
    
    with open(model_artifacts_dir / "metrics.json", "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    history = getattr(model, "training_history", None)
    if history:
        best_epoch: int | None = None
        if history.get("best_val_epoch"):
            best_epoch = int(round(float(history["best_val_epoch"][0])))
            metrics["best_model_epoch"] = best_epoch
            if history.get("best_val_loss"):
                metrics["best_model_val_loss"] = float(history["best_val_loss"][0])
        elif history.get("val_rmse"):
            best_epoch = int(min(range(len(history["val_rmse"])), key=lambda i: history["val_rmse"][i]) + 1)
        elif history.get("val_loss"):
            best_epoch = int(min(range(len(history["val_loss"])), key=lambda i: history["val_loss"][i]) + 1)
        elif history.get("train_rmse"):
            best_epoch = int(
                min(range(len(history["train_rmse"])), key=lambda i: history["train_rmse"][i]) + 1
            )

        if best_epoch is not None:
            metrics["best_epoch"] = best_epoch
            metrics["best_model_epoch"] = best_epoch

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
