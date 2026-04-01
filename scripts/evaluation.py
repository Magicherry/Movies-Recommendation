from __future__ import annotations

from typing import Dict, List, Protocol

import numba
import numpy as np
import pandas as pd
from tqdm import tqdm


class RecommendationLike(Protocol):
    item_id: int
    score: float


class RecommenderLike(Protocol):
    def predict(self, user_id: int, item_id: int) -> float: ...
    def recommend_top_n(self, user_id: int, n: int = 10, exclude_seen: bool = True) -> List[RecommendationLike]: ...


def evaluate_rating_prediction(model: RecommenderLike, test_ratings: pd.DataFrame) -> Dict[str, float]:
    if test_ratings.empty:
        return {"mae": 0.0, "rmse": 0.0}

    if hasattr(model, "predict_batch"):
        user_ids = test_ratings["user_id"].to_numpy(dtype=np.int32)
        item_ids = test_ratings["item_id"].to_numpy(dtype=np.int32)
        preds_np = model.predict_batch(user_ids, item_ids)
        trues_np = test_ratings["rating"].to_numpy(dtype=np.float64)
    else:
        preds = []
        trues = []
        for row in tqdm(test_ratings.itertuples(index=False), total=len(test_ratings), desc="Evaluating Rating Predictions"):
            preds.append(model.predict(int(row.user_id), int(row.item_id)))
            trues.append(float(row.rating))
        preds_np = np.array(preds, dtype=np.float64)
        trues_np = np.array(trues, dtype=np.float64)

    mae = float(np.mean(np.abs(preds_np - trues_np)))
    rmse = float(np.sqrt(np.mean((preds_np - trues_np) ** 2)))
    return {"mae": mae, "rmse": rmse}


@numba.njit(parallel=True)
def _fast_eval_numba(
    test_users,
    train_indptr, train_indices,
    test_indptr, test_indices,
    user_factors, item_factors, user_bias, item_bias, global_mean,
    k, min_rating, max_rating
):
    n_eval_users = len(test_users)
    precisions = np.zeros(n_eval_users, dtype=np.float32)
    recalls = np.zeros(n_eval_users, dtype=np.float32)
    f_measures = np.zeros(n_eval_users, dtype=np.float32)
    ndcgs = np.zeros(n_eval_users, dtype=np.float32)
    
    for i in numba.prange(n_eval_users):
        u = test_users[i]
        
        t_start, t_end = test_indptr[u], test_indptr[u+1]
        n_true = t_end - t_start
        if n_true == 0:
            continue
            
        true_items = test_indices[t_start:t_end]
        
        tr_start, tr_end = train_indptr[u], train_indptr[u+1]
        seen_items = train_indices[tr_start:tr_end]
        
        u_factor = user_factors[u]
        scores = global_mean + user_bias[u] + item_bias + np.dot(item_factors, u_factor)
        
        for item in seen_items:
            scores[item] = -np.inf
            
        top_k_items = np.full(k, -1, dtype=np.int32)
        top_k_scores = np.full(k, -np.inf, dtype=np.float32)
        
        for item in range(len(scores)):
            s = scores[item]
            if s > top_k_scores[-1]:
                pos = k - 1
                while pos > 0 and s > top_k_scores[pos - 1]:
                    top_k_scores[pos] = top_k_scores[pos - 1]
                    top_k_items[pos] = top_k_items[pos - 1]
                    pos -= 1
                top_k_scores[pos] = s
                top_k_items[pos] = item
                
        hits = 0.0
        dcg = 0.0
        
        for rank in range(k):
            rec_id = top_k_items[rank]
            if rec_id == -1:
                break
            
            is_hit = False
            for t_item in true_items:
                if rec_id == t_item:
                    is_hit = True
                    break
                    
            if is_hit:
                hits += 1.0
                dcg += 1.0 / np.log2(rank + 2.0)
                
        idcg = 0.0
        for rank in range(min(n_true, k)):
            idcg += 1.0 / np.log2(rank + 2.0)
            
        precision = hits / k
        recall = hits / n_true
        f_measure = 0.0
        if precision + recall > 0:
            f_measure = 2.0 * precision * recall / (precision + recall)
            
        precisions[i] = precision
        recalls[i] = recall
        f_measures[i] = f_measure
        if idcg > 0:
            ndcgs[i] = dcg / idcg
            
    return precisions, recalls, f_measures, ndcgs


def _pandas_to_csr(df, max_user_id, user_to_idx=None, item_to_idx=None):
    if user_to_idx is not None and item_to_idx is not None:
        df = df[df["user_id"].isin(user_to_idx) & df["item_id"].isin(item_to_idx)].copy()
        user_ids = df["user_id"].map(user_to_idx).to_numpy(dtype=np.int32)
        item_ids = df["item_id"].map(item_to_idx).to_numpy(dtype=np.int32)
        sort_idx = np.argsort(user_ids)
        user_ids = user_ids[sort_idx]
        item_ids = item_ids[sort_idx]
    else:
        df_sorted = df.sort_values("user_id")
        user_ids = df_sorted["user_id"].to_numpy(dtype=np.int32)
        item_ids = df_sorted["item_id"].to_numpy(dtype=np.int32)
        
    counts = np.bincount(user_ids, minlength=max_user_id + 1)
    indptr = np.zeros(max_user_id + 2, dtype=np.int32)
    indptr[1:] = np.cumsum(counts)
    return indptr, item_ids


def evaluate_top_n(
    model: RecommenderLike,
    train_ratings: pd.DataFrame,
    test_ratings: pd.DataFrame,
    k: int = 10,
    min_relevant_rating: float = 4.0,
    use_all_test_items: bool = True,
) -> Dict[str, float]:
    if test_ratings.empty or k <= 0:
        return {"precision": 0.0, "recall": 0.0, "f_measure": 0.0, "ndcg": 0.0}

    if use_all_test_items:
        relevant_test = test_ratings
    else:
        relevant_test = test_ratings[test_ratings["rating"] >= float(min_relevant_rating)]

    test_users = sorted(test_ratings["user_id"].astype(int).unique().tolist())
    if not test_users:
        return {"precision": 0.0, "recall": 0.0, "f_measure": 0.0, "ndcg": 0.0}

    # Numba Accelerated Fast Path
    if hasattr(model, "user_factors") and hasattr(model, "item_factors") and getattr(model, "user_factors") is not None:
        try:
            print("[Evaluation] Numba fast-path active for Top-K.")
            max_user = model.user_factors.shape[0] - 1
            
            user_to_idx = getattr(model, "user_to_idx", None)
            item_to_idx = getattr(model, "item_to_idx", None)
            
            train_indptr, train_indices = _pandas_to_csr(train_ratings, max_user, user_to_idx, item_to_idx)
            test_indptr, test_indices = _pandas_to_csr(relevant_test, max_user, user_to_idx, item_to_idx)
            
            if user_to_idx is not None:
                # filter out test_users not in mapping and map them
                valid_test_users = [user_to_idx[u] for u in test_users if u in user_to_idx]
                test_users_np = np.array(valid_test_users, dtype=np.int32)
            else:
                test_users_np = np.array(test_users, dtype=np.int32)
            
            p_arr, r_arr, f_arr, n_arr = _fast_eval_numba(
                test_users_np,
                train_indptr, train_indices,
                test_indptr, test_indices,
                model.user_factors, model.item_factors, model.user_bias, model.item_bias, float(model.global_mean),
                int(k), float(getattr(model, "min_rating", 0.5)), float(getattr(model, "max_rating", 5.0))
            )
            
            return {
                "precision": float(np.mean(p_arr)),
                "recall": float(np.mean(r_arr)),
                "f_measure": float(np.mean(f_arr)),
                "ndcg": float(np.mean(n_arr)),
            }
        except Exception as e:
            print("[Evaluation] Numba fast-path failed, falling back to Python loop. Error:", e)

    # Generic Python Fallback
    print("[Evaluation] Using generic Python fallback.")
    test_items_by_user = relevant_test.groupby("user_id")["item_id"].apply(set).to_dict()

    precisions = []
    recalls = []
    f_measures = []
    ndcgs = []

    for user_id in tqdm(test_users, desc=f"Evaluating Top-{k} Recommendations"):
        true_items = test_items_by_user.get(user_id, set())

        recs = model.recommend_top_n(user_id=user_id, n=k, exclude_seen=True)
        rec_items = [r.item_id for r in recs]
        if not rec_items:
            precisions.append(0.0)
            recalls.append(0.0)
            f_measures.append(0.0)
            ndcgs.append(0.0)
            continue

        hit_set = set(rec_items) & true_items
        hits = len(hit_set)

        precision = hits / k
        recall = hits / len(true_items) if true_items else 0.0
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
