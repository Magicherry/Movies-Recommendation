from __future__ import annotations

from typing import Dict

import numpy as np
import pandas as pd

from models.option1_recommender import Option1UserBasedCF


def evaluate_rating_prediction(model: Option1UserBasedCF, test_ratings: pd.DataFrame) -> Dict[str, float]:
    if test_ratings.empty:
        return {"mae": 0.0, "rmse": 0.0}

    preds = []
    trues = []
    for row in test_ratings.itertuples(index=False):
        preds.append(model.predict(int(row.user_id), int(row.item_id)))
        trues.append(float(row.rating))

    preds_np = np.array(preds, dtype=np.float64)
    trues_np = np.array(trues, dtype=np.float64)
    mae = float(np.mean(np.abs(preds_np - trues_np)))
    rmse = float(np.sqrt(np.mean((preds_np - trues_np) ** 2)))
    return {"mae": mae, "rmse": rmse}


def evaluate_top_n(
    model: Option1UserBasedCF,
    train_ratings: pd.DataFrame,
    test_ratings: pd.DataFrame,
    k: int = 10,
) -> Dict[str, float]:
    if test_ratings.empty:
        return {"precision": 0.0, "recall": 0.0, "f_measure": 0.0, "ndcg": 0.0}

    test_items_by_user = test_ratings.groupby("user_id")["item_id"].apply(set).to_dict()
    train_users = set(train_ratings["user_id"].astype(int).unique().tolist())

    precisions = []
    recalls = []
    f_measures = []
    ndcgs = []

    for user_id, true_items in test_items_by_user.items():
        user_id = int(user_id)
        if user_id not in train_users:
            continue

        recs = model.recommend_top_n(user_id=user_id, n=k, exclude_seen=True)
        rec_items = [r.item_id for r in recs]
        if not rec_items:
            precisions.append(0.0)
            recalls.append(0.0)
            f_measures.append(0.0)
            ndcgs.append(0.0)
            continue

        hit_set = set(rec_items) & set(true_items)
        hits = len(hit_set)

        precision = hits / k
        recall = hits / max(len(true_items), 1)
        if precision + recall > 0:
            f_measure = 2 * precision * recall / (precision + recall)
        else:
            f_measure = 0.0

        dcg = 0.0
        for rank, item_id in enumerate(rec_items):
            if item_id in true_items:
                dcg += 1.0 / np.log2(rank + 2.0)
        idcg = sum(1.0 / np.log2(i + 2.0) for i in range(min(len(true_items), k)))
        ndcg = dcg / idcg if idcg > 0 else 0.0

        precisions.append(precision)
        recalls.append(recall)
        f_measures.append(f_measure)
        ndcgs.append(ndcg)

    if not precisions:
        return {"precision": 0.0, "recall": 0.0, "f_measure": 0.0, "ndcg": 0.0}

    return {
        "precision": float(np.mean(precisions)),
        "recall": float(np.mean(recalls)),
        "f_measure": float(np.mean(f_measures)),
        "ndcg": float(np.mean(ndcgs)),
    }
