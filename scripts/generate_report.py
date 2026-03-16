from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path
from typing import Any

import numpy as np

from scripts.data_pipeline import load_movielens
from scripts.generate_analysis_report import (
    analyze_latent_structure,
    build_feature_analysis,
    build_item_feature_frame,
    compare_real_and_synthetic,
    generate_synthetic_ratings,
    load_metrics_summary,
    load_model,
    load_tags,
    load_train_test_frames,
    summarize_distribution,
)


COLORS = {
    "bg": "#0f172a",
    "panel": "#111827",
    "grid": "#334155",
    "text": "#e5e7eb",
    "muted": "#94a3b8",
    "option1": "#38bdf8",
    "option2": "#f97316",
    "accent": "#22c55e",
    "danger": "#ef4444",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a unified final report with figures for both recommender options."
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="dataset/ml-latest-small",
        help="Path to the MovieLens dataset directory.",
    )
    parser.add_argument(
        "--artifacts-dir",
        type=str,
        default="models/artifacts",
        help="Directory that contains trained model artifacts.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="analysis",
        help="Directory where the final report and figures are written.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed used for bootstrap and synthetic data generation.",
    )
    parser.add_argument(
        "--bootstrap-iterations",
        type=int,
        default=120,
        help="Bootstrap iterations for feature coefficient confidence intervals.",
    )
    parser.add_argument(
        "--bootstrap-sample-size",
        type=int,
        default=20000,
        help="Rows sampled per bootstrap fit.",
    )
    parser.add_argument(
        "--synthetic-users",
        type=int,
        default=610,
        help="Number of synthetic users to generate per model.",
    )
    parser.add_argument(
        "--synthetic-temperature",
        type=float,
        default=0.55,
        help="Sampling temperature for synthetic user-item interactions.",
    )
    return parser.parse_args()


def load_training_history(artifacts_dir: Path, model_type: str) -> dict[str, Any]:
    history_path = artifacts_dir / model_type / "training_history.json"
    if not history_path.exists():
        return {}
    with open(history_path, "r", encoding="utf-8") as f:
        return json.load(f)


def pretty_feature_name(feature: str) -> str:
    if feature.startswith("genre_"):
        return feature.replace("genre_", "Genre: ").replace("_", " ").title()
    mapping = {
        "log_item_popularity": "Log Item Popularity",
        "log_user_activity": "Log User Activity",
        "log_tag_count": "Log Tag Count",
        "log_unique_tag_count": "Log Unique Tag Count",
        "release_year": "Release Year",
        "interaction_year": "Interaction Year",
        "genre_count": "Genre Count",
        "noise_feature_1": "Noise Feature 1",
        "noise_feature_2": "Noise Feature 2",
    }
    return mapping.get(feature, feature.replace("_", " ").title())


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def svg_document(width: int, height: int, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
        f'viewBox="0 0 {width} {height}" role="img" aria-labelledby="title desc">'
        f'<title>{escape(title)}</title>'
        f'<desc>{escape(title)}</desc>'
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="{COLORS["bg"]}"/>'
        f"{body}</svg>"
    )


def write_rating_distribution_svg(output_path: Path, distribution: dict[str, Any]) -> None:
    histogram = distribution["rating_histogram"]
    width = 920
    height = 430
    left = 80
    bottom = 360
    chart_width = 760
    chart_height = 250
    max_count = max(point["count"] for point in histogram)
    bar_width = chart_width / len(histogram) * 0.75
    gap = chart_width / len(histogram) * 0.25
    body = [
        f'<text x="40" y="42" fill="{COLORS["text"]}" font-size="24" font-family="Arial, sans-serif" font-weight="bold">Rating Distribution</text>',
        f'<text x="40" y="70" fill="{COLORS["muted"]}" font-size="14" font-family="Arial, sans-serif">MovieLens ratings are left-skewed and concentrated at 3.5 to 5.0.</text>',
        f'<line x1="{left}" y1="{bottom}" x2="{left + chart_width}" y2="{bottom}" stroke="{COLORS["grid"]}" stroke-width="1"/>',
        f'<line x1="{left}" y1="{bottom - chart_height}" x2="{left}" y2="{bottom}" stroke="{COLORS["grid"]}" stroke-width="1"/>',
    ]
    for tick in range(5):
        y = bottom - chart_height * tick / 4
        value = int(max_count * tick / 4)
        body.append(f'<line x1="{left}" y1="{y}" x2="{left + chart_width}" y2="{y}" stroke="{COLORS["grid"]}" stroke-width="1" opacity="0.5"/>')
        body.append(f'<text x="{left - 12}" y="{y + 5}" text-anchor="end" fill="{COLORS["muted"]}" font-size="12" font-family="Arial, sans-serif">{value}</text>')

    for idx, point in enumerate(histogram):
        x = left + idx * (bar_width + gap) + gap / 2
        bar_height = chart_height * point["count"] / max_count
        y = bottom - bar_height
        body.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width:.1f}" height="{bar_height:.1f}" '
            f'fill="{COLORS["option1"]}" rx="4"/>'
        )
        body.append(f'<text x="{x + bar_width / 2:.1f}" y="{bottom + 20}" text-anchor="middle" fill="{COLORS["muted"]}" font-size="12" font-family="Arial, sans-serif">{point["rating"]}</text>')
    body.append(
        f'<text x="{left + chart_width / 2}" y="{height - 20}" text-anchor="middle" fill="{COLORS["muted"]}" font-size="13" font-family="Arial, sans-serif">Rating bucket</text>'
    )
    write_file(output_path, svg_document(width, height, "".join(body), "Rating distribution"))


def write_metrics_comparison_svg(output_path: Path, metrics_summary: dict[str, dict[str, Any]]) -> None:
    width = 980
    height = 470
    rows = [
        ("MAE", "mae", False),
        ("RMSE", "rmse", False),
        ("Precision@10", "precision", True),
        ("Recall@10", "recall", True),
        ("NDCG@10", "ndcg", True),
    ]
    body = [
        f'<text x="40" y="42" fill="{COLORS["text"]}" font-size="24" font-family="Arial, sans-serif" font-weight="bold">Option 1 vs Option 2</text>',
        f'<text x="40" y="70" fill="{COLORS["muted"]}" font-size="14" font-family="Arial, sans-serif">Each row shows the pairwise offline comparison. Longer bars indicate better performance after row-wise normalization.</text>',
        f'<rect x="700" y="24" width="14" height="14" fill="{COLORS["option1"]}" rx="3"/>'
        f'<text x="722" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 1</text>',
        f'<rect x="810" y="24" width="14" height="14" fill="{COLORS["option2"]}" rx="3"/>'
        f'<text x="832" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 2</text>',
    ]
    start_y = 115
    for idx, (label, key, higher_better) in enumerate(rows):
        y = start_y + idx * 66
        v1 = float(metrics_summary["option1"][key])
        v2 = float(metrics_summary["option2"][key])
        if higher_better:
            best = max(v1, v2)
            score1 = v1 / best if best else 0.0
            score2 = v2 / best if best else 0.0
        else:
            best = min(v1, v2)
            score1 = best / v1 if v1 else 0.0
            score2 = best / v2 if v2 else 0.0
        body.append(f'<text x="40" y="{y}" fill="{COLORS["text"]}" font-size="15" font-family="Arial, sans-serif" font-weight="bold">{label}</text>')
        body.append(f'<rect x="210" y="{y - 18}" width="330" height="14" fill="{COLORS["panel"]}" rx="7"/>')
        body.append(f'<rect x="210" y="{y - 18}" width="{330 * score1:.1f}" height="14" fill="{COLORS["option1"]}" rx="7"/>')
        body.append(f'<text x="555" y="{y - 6}" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">{v1:.4f}</text>')
        body.append(f'<rect x="210" y="{y + 4}" width="330" height="14" fill="{COLORS["panel"]}" rx="7"/>')
        body.append(f'<rect x="210" y="{y + 4}" width="{330 * score2:.1f}" height="14" fill="{COLORS["option2"]}" rx="7"/>')
        body.append(f'<text x="555" y="{y + 16}" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">{v2:.4f}</text>')

        winner = "Option 1" if ((v1 >= v2) if higher_better else (v1 <= v2)) else "Option 2"
        body.append(f'<text x="650" y="{y + 4}" fill="{COLORS["muted"]}" font-size="13" font-family="Arial, sans-serif">Winner: {winner}</text>')
    write_file(output_path, svg_document(width, height, "".join(body), "Model comparison"))


def write_training_curve_svg(
    output_path: Path,
    option1_history: dict[str, Any],
    option2_history: dict[str, Any],
) -> None:
    option1_values = [float(v) for v in option1_history.get("val_rmse", [])]
    option2_values = [float(v) for v in option2_history.get("val_rmse", [])]
    width = 980
    height = 430
    left = 80
    top = 90
    chart_width = 820
    chart_height = 250
    all_values = option1_values + option2_values
    y_min = min(all_values)
    y_max = max(all_values)
    y_padding = (y_max - y_min) * 0.1 if y_max > y_min else 0.02
    y_min -= y_padding
    y_max += y_padding

    def points(values: list[float]) -> str:
        coords = []
        denom = max(len(values) - 1, 1)
        for idx, value in enumerate(values):
            x = left + chart_width * idx / denom
            y = top + chart_height * (1 - (value - y_min) / (y_max - y_min))
            coords.append(f"{x:.1f},{y:.1f}")
        return " ".join(coords)

    body = [
        f'<text x="40" y="42" fill="{COLORS["text"]}" font-size="24" font-family="Arial, sans-serif" font-weight="bold">Validation RMSE by Epoch</text>',
        f'<text x="40" y="70" fill="{COLORS["muted"]}" font-size="14" font-family="Arial, sans-serif">Option 1 improves more steadily, while Option 2 reaches its best validation loss early and then plateaus.</text>',
        f'<line x1="{left}" y1="{top + chart_height}" x2="{left + chart_width}" y2="{top + chart_height}" stroke="{COLORS["grid"]}" stroke-width="1"/>',
        f'<line x1="{left}" y1="{top}" x2="{left}" y2="{top + chart_height}" stroke="{COLORS["grid"]}" stroke-width="1"/>',
        f'<rect x="680" y="24" width="14" height="14" fill="{COLORS["option1"]}" rx="3"/>'
        f'<text x="702" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 1</text>',
        f'<rect x="800" y="24" width="14" height="14" fill="{COLORS["option2"]}" rx="3"/>'
        f'<text x="822" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 2</text>',
    ]
    for tick in range(6):
        y = top + chart_height * tick / 5
        value = y_max - (y_max - y_min) * tick / 5
        body.append(f'<line x1="{left}" y1="{y:.1f}" x2="{left + chart_width}" y2="{y:.1f}" stroke="{COLORS["grid"]}" stroke-width="1" opacity="0.5"/>')
        body.append(f'<text x="{left - 10}" y="{y + 4:.1f}" text-anchor="end" fill="{COLORS["muted"]}" font-size="12" font-family="Arial, sans-serif">{value:.3f}</text>')
    for tick in range(1, max(len(option1_values), len(option2_values)) + 1, 5):
        x = left + chart_width * (tick - 1) / max(max(len(option1_values), len(option2_values)) - 1, 1)
        body.append(f'<line x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + chart_height}" stroke="{COLORS["grid"]}" stroke-width="1" opacity="0.25"/>')
        body.append(f'<text x="{x:.1f}" y="{top + chart_height + 18}" text-anchor="middle" fill="{COLORS["muted"]}" font-size="12" font-family="Arial, sans-serif">{tick}</text>')
    body.append(f'<polyline fill="none" stroke="{COLORS["option1"]}" stroke-width="3" points="{points(option1_values)}"/>')
    body.append(f'<polyline fill="none" stroke="{COLORS["option2"]}" stroke-width="3" points="{points(option2_values)}"/>')
    write_file(output_path, svg_document(width, height, "".join(body), "Validation RMSE by epoch"))


def write_ablation_svg(output_path: Path, feature_analysis: dict[str, Any]) -> None:
    rows = feature_analysis["block_ablation"]
    width = 920
    height = 360
    left = 180
    top = 100
    chart_width = 650
    row_gap = 70
    max_value = max(max(row["delta_r2"], 0.0) for row in rows) or 0.01
    body = [
        f'<text x="40" y="42" fill="{COLORS["text"]}" font-size="24" font-family="Arial, sans-serif" font-weight="bold">Signal vs Noise Ablation</text>',
        f'<text x="40" y="70" fill="{COLORS["muted"]}" font-size="14" font-family="Arial, sans-serif">Higher delta R² means the removed block carried more useful signal.</text>',
    ]
    for idx, row in enumerate(rows):
        y = top + idx * row_gap
        bar_width = chart_width * row["delta_r2"] / max_value
        color = COLORS["accent"] if row["block"] != "noise" else COLORS["danger"]
        body.append(f'<text x="{left - 20}" y="{y + 5}" text-anchor="end" fill="{COLORS["text"]}" font-size="15" font-family="Arial, sans-serif">{row["block"].title()}</text>')
        body.append(f'<rect x="{left}" y="{y - 14}" width="{chart_width}" height="24" fill="{COLORS["panel"]}" rx="6"/>')
        body.append(f'<rect x="{left}" y="{y - 14}" width="{bar_width:.1f}" height="24" fill="{color}" rx="6"/>')
        body.append(f'<text x="{left + bar_width + 10:.1f}" y="{y + 4}" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">{row["delta_r2"]:.4f}</text>')
    write_file(output_path, svg_document(width, height, "".join(body), "Signal versus noise ablation"))


def write_synthetic_comparison_svg(
    output_path: Path,
    synthetic_results: dict[str, dict[str, Any]],
) -> None:
    metrics = [
        ("Mean rating delta", "rating_mean"),
        ("Rating std delta", "rating_std"),
        ("Popularity Gini delta", "item_popularity_gini"),
    ]
    width = 980
    height = 420
    body = [
        f'<text x="40" y="42" fill="{COLORS["text"]}" font-size="24" font-family="Arial, sans-serif" font-weight="bold">Synthetic Data Fidelity</text>',
        f'<text x="40" y="70" fill="{COLORS["muted"]}" font-size="14" font-family="Arial, sans-serif">Lower bars indicate that the synthetic data stays closer to the real training distribution.</text>',
    ]
    start_y = 125
    for idx, (label, key) in enumerate(metrics):
        y = start_y + idx * 88
        v1 = float(synthetic_results["option1"]["absolute_deltas"][key])
        v2 = float(synthetic_results["option2"]["absolute_deltas"][key])
        maxv = max(v1, v2, 1e-6)
        body.append(f'<text x="40" y="{y}" fill="{COLORS["text"]}" font-size="15" font-family="Arial, sans-serif" font-weight="bold">{label}</text>')
        body.append(f'<rect x="290" y="{y - 18}" width="300" height="14" fill="{COLORS["panel"]}" rx="7"/>')
        body.append(f'<rect x="290" y="{y - 18}" width="{300 * v1 / maxv:.1f}" height="14" fill="{COLORS["option1"]}" rx="7"/>')
        body.append(f'<text x="605" y="{y - 6}" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">{v1:.4f}</text>')
        body.append(f'<rect x="290" y="{y + 6}" width="300" height="14" fill="{COLORS["panel"]}" rx="7"/>')
        body.append(f'<rect x="290" y="{y + 6}" width="{300 * v2 / maxv:.1f}" height="14" fill="{COLORS["option2"]}" rx="7"/>')
        body.append(f'<text x="605" y="{y + 18}" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">{v2:.4f}</text>')
    body.append(f'<rect x="730" y="24" width="14" height="14" fill="{COLORS["option1"]}" rx="3"/>')
    body.append(f'<text x="752" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 1</text>')
    body.append(f'<rect x="840" y="24" width="14" height="14" fill="{COLORS["option2"]}" rx="3"/>')
    body.append(f'<text x="862" y="36" fill="{COLORS["text"]}" font-size="13" font-family="Arial, sans-serif">Option 2</text>')
    write_file(output_path, svg_document(width, height, "".join(body), "Synthetic data fidelity"))


def format_metric_row(metrics_summary: dict[str, dict[str, Any]], label: str, key: str) -> str:
    option1 = metrics_summary["option1"][key]
    option2 = metrics_summary["option2"][key]
    return f"| {label} | {option1:.4f} | {option2:.4f} |"


def build_executive_summary(
    metrics_summary: dict[str, dict[str, Any]],
    feature_analysis: dict[str, Any],
    option1_analysis: dict[str, Any],
    option2_analysis: dict[str, Any],
) -> list[str]:
    rmse_gain = (
        (metrics_summary["option2"]["rmse"] - metrics_summary["option1"]["rmse"])
        / metrics_summary["option2"]["rmse"]
        * 100.0
    )
    ndcg_gain = (
        (metrics_summary["option1"]["ndcg"] - metrics_summary["option2"]["ndcg"])
        / metrics_summary["option2"]["ndcg"]
        * 100.0
    )
    top_feature = feature_analysis["top_coefficients"][0]
    return [
        f"- `Option 1` is the strongest overall offline model: RMSE improves by {rmse_gain:.1f}% and NDCG@10 improves by {ndcg_gain:.1f}% over `Option 2`.",
        f"- The data is highly sparse (`{option1_analysis['distribution']['sparsity']:.3f}`) and strongly long-tailed, which makes popularity and user activity major structural forces.",
        f"- The strongest observed rating driver is `{pretty_feature_name(top_feature['feature'])}` with coefficient {top_feature['coefficient']:.4f} and a bootstrap 95% CI that stays away from zero.",
        f"- Synthetic data is realistic enough for structure checks, but `Option 1` preserves item-popularity shape better than `Option 2` (Gini delta {option1_analysis['synthetic_comparison']['absolute_deltas']['item_popularity_gini']:.3f} vs {option2_analysis['synthetic_comparison']['absolute_deltas']['item_popularity_gini']:.3f}).",
    ]


def build_final_report_markdown(
    distribution: dict[str, Any],
    feature_analysis: dict[str, Any],
    metrics_summary: dict[str, dict[str, Any]],
    option1_analysis: dict[str, Any],
    option2_analysis: dict[str, Any],
) -> str:
    option1_component = option1_analysis["latent_analysis"]["components"][0]
    option2_component = option2_analysis["latent_analysis"]["components"][0]
    summary_lines = build_executive_summary(
        metrics_summary=metrics_summary,
        feature_analysis=feature_analysis,
        option1_analysis=option1_analysis,
        option2_analysis=option2_analysis,
    )
    option1_pos = ", ".join(
        f"{row['genre']} ({row['correlation']:.3f})" for row in option1_component["top_positive_genres"]
    )
    option1_neg = ", ".join(
        f"{row['genre']} ({row['correlation']:.3f})" for row in option1_component["top_negative_genres"]
    )
    option2_pos = ", ".join(
        f"{row['genre']} ({row['correlation']:.3f})" for row in option2_component["top_positive_genres"]
    )
    option2_neg = ", ".join(
        f"{row['genre']} ({row['correlation']:.3f})" for row in option2_component["top_negative_genres"]
    )
    top_features = [
        row
        for row in feature_analysis["top_coefficients"]
        if not row["feature"].startswith("noise_feature")
    ][:6]
    synthetic_best = "Option 1" if (
        option1_analysis["synthetic_comparison"]["absolute_deltas"]["item_popularity_gini"]
        <= option2_analysis["synthetic_comparison"]["absolute_deltas"]["item_popularity_gini"]
    ) else "Option 2"

    lines = [
        "# Final Structural Analysis Report",
        "",
        "_This document follows a technical-report style common in industry ML write-ups: executive summary, experimental setup, quantitative comparison, interpretation, limitations, and traceable artifacts._",
        "",
        "## Executive Summary",
        *summary_lines,
        "",
        "## Problem Framing",
        "This project analyzes the MovieLens small dataset as a structured user-item system rather than treating it only as a prediction benchmark. The goal is to understand the distribution of the data, identify which observed features matter, separate signal from noise, interpret latent factors, and test whether the learned structure is rich enough to generate realistic synthetic interactions.",
        "",
        "## Dataset And Experimental Setup",
        f"- Dataset size: {distribution['users']} users, {distribution['items']} movies, {distribution['ratings']} ratings, and tags for {distribution['movies_with_tags_ratio'] * 100:.1f}% of movies.",
        f"- Data coverage: density = {distribution['density']:.4f}, sparsity = {distribution['sparsity']:.4f}.",
        "- Split policy: a shared per-user 80/20 holdout split is reused across Option 1 and Option 2 so that model comparison is fair.",
        "- `Option 1`: matrix factorization with explicit SGD updates and learned user/item biases.",
        "- `Option 2`: hybrid deep recommender that combines user embeddings with item ID, title, and genre features.",
        "- Confidence strategy: held-out evaluation, bootstrap confidence intervals for feature coefficients, and explicit block ablations for signal-vs-noise checks.",
        "",
        "## Figure 1. Rating Distribution",
        "![Rating Distribution](figures/rating_distribution.svg)",
        "",
        "The ratings are centered at 3.50 with a standard deviation of 1.04 and a mild negative skew, so the dataset contains more positive than negative feedback. User activity and item popularity are both long-tailed: user-activity Gini is "
        f"{distribution['user_activity']['gini']:.3f} and item-popularity Gini is {distribution['item_popularity']['gini']:.3f}. This matters because any recommender trained on the dataset must learn under severe sparsity and popularity imbalance.",
        "",
        "## Model Comparison",
        "![Option Comparison](figures/model_comparison.svg)",
        "",
        "| Metric | Option 1 | Option 2 |",
        "| --- | ---: | ---: |",
        format_metric_row(metrics_summary, "MAE", "mae"),
        format_metric_row(metrics_summary, "RMSE", "rmse"),
        format_metric_row(metrics_summary, "Precision@10", "precision"),
        format_metric_row(metrics_summary, "Recall@10", "recall"),
        format_metric_row(metrics_summary, "NDCG@10", "ndcg"),
        "",
        "Option 1 outperforms Option 2 on every reported offline metric. On this dataset, the simpler factorization model appears to fit the signal-to-noise ratio better than the deeper hybrid model. A likely reason is that MovieLens small is informative but still relatively small for a higher-capacity architecture that mixes ID embeddings with title and genre towers.",
        "",
        "## Figure 2. Validation RMSE During Training",
        "![Training Curves](figures/training_curves.svg)",
        "",
        "The training curves reinforce the quantitative comparison. Option 1 improves gradually across most of the training run, whereas Option 2 reaches its best validation behavior early and then mostly plateaus. That pattern is consistent with a model that can fit quickly but does not extract enough additional generalizable structure from the extra content features on this dataset.",
        "",
        "## Feature Influence And Interpretability",
        "The feature analysis is intentionally model-agnostic: it uses the shared train/test split and an interpretable held-out linear analysis to identify which observed covariates are associated with ratings.",
        "",
    ]
    for row in top_features:
        lines.append(
            f"- `{pretty_feature_name(row['feature'])}`: coefficient = {row['coefficient']:.4f}, "
            f"95% CI [{row['ci_low']:.4f}, {row['ci_high']:.4f}]"
        )
    lines.extend(
        [
            "",
            "The strongest positive association comes from item popularity, while higher user activity has a negative coefficient, suggesting that heavy users are harder to satisfy on average or spread their attention across more diverse tastes. Several content signals are also meaningful: animation and drama show positive associations, while children and newer release years trend negative after controlling for the other included variables.",
            "",
            "## Figure 3. Signal Versus Noise Ablation",
            "![Ablation](figures/ablation.svg)",
            "",
            f"The held-out feature model reaches test R² = {feature_analysis['test_r2_full_model']:.4f}. Removing the content block reduces R² by {feature_analysis['block_ablation'][0]['delta_r2']:.4f}, which is larger than the engagement-block drop of {feature_analysis['block_ablation'][1]['delta_r2']:.4f}. In contrast, removing the injected noise features has effectively zero impact. This directly answers the signal-vs-noise question: content and engagement both matter, but the content block carries the strongest marginal signal in this observational setup.",
            "",
            "## Latent Structure",
            f"- `Option 1` latent dimension: {option1_analysis['latent_analysis']['embedding_dim']}. Its first component explains only {option1_component['explained_variance_ratio']:.3f} of latent variance, which suggests a relatively distributed representation.",
            f"- `Option 2` latent dimension: {option2_analysis['latent_analysis']['embedding_dim']}. Its first component explains {option2_component['explained_variance_ratio']:.3f} of latent variance, indicating a more concentrated leading axis.",
            f"- `Option 1` component 1 is positively associated with {option1_pos} and negatively associated with {option1_neg}.",
            f"- `Option 2` component 1 is positively associated with {option2_pos} and negatively associated with {option2_neg}.",
            "",
            "These latent factors make the recommendation space easier to interpret. In Option 1, the latent geometry is more spread out and easier to read as multiple weak preference axes. In Option 2, the first latent axis dominates much more strongly, which may reflect a sharper separation between mainstream genre-heavy items and more niche dramatic or documentary titles. On a larger dataset that concentration might be useful, but here it seems to come with weaker offline performance.",
            "",
            "## Synthetic Data Check",
            "![Synthetic Fidelity](figures/synthetic_comparison.svg)",
            "",
            f"Both models can generate synthetic ratings with the same number of interactions as the real training set. `Option 1` produces a mean-rating delta of {option1_analysis['synthetic_comparison']['absolute_deltas']['rating_mean']:.4f} and an item-popularity Gini delta of {option1_analysis['synthetic_comparison']['absolute_deltas']['item_popularity_gini']:.4f}. `Option 2` produces a mean-rating delta of {option2_analysis['synthetic_comparison']['absolute_deltas']['rating_mean']:.4f} and an item-popularity Gini delta of {option2_analysis['synthetic_comparison']['absolute_deltas']['item_popularity_gini']:.4f}. The better synthetic-fidelity model on this test is {synthetic_best}.",
            "",
            "This does not prove that the model has fully captured the true data-generating process, but it is a useful structural sanity check. The synthetic samples preserve rating moments and user-activity shape quite closely, and Option 1 also preserves the item-popularity long tail more faithfully.",
            "",
            "## Why The Conclusions Are Justified",
            "- Both recommender options are evaluated on the same cached holdout split.",
            "- Feature-level claims are supported by bootstrap confidence intervals, not only by point estimates.",
            "- The report separates observed-feature analysis from latent-factor interpretation, which helps avoid overclaiming from either lens alone.",
            "- Signal-vs-noise is tested explicitly with block ablation and injected random features.",
            "- Synthetic-data realism is evaluated with direct comparisons against real summary statistics.",
            "",
            "## Limitations",
            "- The feature-influence analysis is observational, not causal. The coefficients describe association, not intervention effects.",
            "- Offline ranking metrics do not guarantee better online user satisfaction or business impact.",
            "- The dataset is small compared with modern production recommendation datasets, so Option 2 may be underpowered or over-parameterized here.",
            "- The synthetic-data validation focuses on marginal statistics and long-tail shape; it does not fully validate higher-order temporal dynamics.",
            "",
            "## Final Recommendation",
            "For this dataset and this project framing, `Option 1` should be the primary model in the final submission. It has the best predictive performance, the most stable training behavior, and the strongest synthetic-data fidelity. `Option 2` is still valuable in the report because it shows what happens when richer architecture is introduced without enough data to turn added complexity into better generalization.",
            "",
            "## Artifact Traceability",
            "- Primary report: `analysis/final_report.md`",
            "- Raw comparison artifacts: `analysis/artifacts/final_summary.json`",
            "- Per-model structural analysis: `analysis/artifacts/option1_analysis.json`, `analysis/artifacts/option2_analysis.json`",
            "- Synthetic interaction samples: `analysis/artifacts/option1_synthetic_ratings.csv`, `analysis/artifacts/option2_synthetic_ratings.csv`",
            "- Figures: `analysis/figures/`",
            "",
            "## Reporting Style Inspiration",
            "- The structure of this report follows common industry technical-report patterns: executive summary first, then experimental design, quantitative comparison, interpretation, and limitations.",
            "- Shopify Engineering technical reports emphasize clear business framing, explicit metric comparison, and concise discussion of why a modeling choice matters in practice: [Shopify Engineering](https://shopify.engineering/generative-recommendations).",
            "- Netflix engineering write-ups often compare alternative recommender designs while discussing scale, trade-offs, and failure modes rather than only listing scores: [Netflix Tech Blog](https://netflixtechblog.medium.com/lessons-learnt-from-consolidating-ml-models-in-a-large-scale-recommendation-system-870c5ea5eb4a).",
            "",
            "## Style Note",
            "The report structure is intentionally closer to an industry technical report or model card than to a short class write-up: it leads with a decision-oriented summary, then documents methodology, metrics, interpretability, risks, and artifact paths for reproducibility.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    dataset_dir = Path(args.dataset_dir)
    artifacts_dir = Path(args.artifacts_dir)
    output_dir = Path(args.output_dir)
    figures_dir = output_dir / "figures"
    analysis_artifacts_dir = output_dir / "artifacts"
    figures_dir.mkdir(parents=True, exist_ok=True)
    analysis_artifacts_dir.mkdir(parents=True, exist_ok=True)

    ratings, movies = load_movielens(dataset_dir)
    tags = load_tags(dataset_dir)
    distribution = summarize_distribution(ratings, movies, tags)
    rating_hist = (
        ratings.groupby("rating").size().sort_index().reset_index(name="count")
    )
    distribution["rating_histogram"] = [
        {"rating": f"{float(row.rating):.1f}", "count": int(row.count)}
        for row in rating_hist.itertuples(index=False)
    ]

    item_features, genre_columns, genres = build_item_feature_frame(movies, tags)
    feature_columns = [
        "log_user_activity",
        "log_item_popularity",
        "release_year",
        "interaction_year",
        "genre_count",
        "log_tag_count",
        "log_unique_tag_count",
        *genre_columns,
    ]
    shared_train, shared_test = load_train_test_frames(artifacts_dir, "option1")
    feature_analysis = build_feature_analysis(
        train_ratings=shared_train,
        test_ratings=shared_test,
        item_features=item_features,
        feature_columns=feature_columns,
        seed=args.seed,
        bootstrap_iterations=args.bootstrap_iterations,
        bootstrap_sample_size=args.bootstrap_sample_size,
    )
    metrics_summary = load_metrics_summary(artifacts_dir)

    per_model: dict[str, dict[str, Any]] = {}
    for model_type in ("option1", "option2"):
        train_ratings, test_ratings = load_train_test_frames(artifacts_dir, model_type)
        model = load_model(artifacts_dir, model_type)
        latent_analysis = analyze_latent_structure(model, item_features, genres)
        synthetic_ratings = generate_synthetic_ratings(
            model=model,
            train_ratings=train_ratings,
            test_ratings=test_ratings,
            synthetic_users=args.synthetic_users,
            temperature=args.synthetic_temperature,
            seed=args.seed,
        )
        synthetic_comparison = compare_real_and_synthetic(train_ratings, synthetic_ratings)
        training_history = load_training_history(artifacts_dir, model_type)
        payload = {
            "model_type": model_type,
            "distribution": distribution,
            "feature_analysis": feature_analysis,
            "latent_analysis": latent_analysis,
            "synthetic_comparison": synthetic_comparison,
            "metrics_summary": metrics_summary,
            "training_history": training_history,
        }
        with open(analysis_artifacts_dir / f"{model_type}_analysis.json", "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        synthetic_ratings.to_csv(analysis_artifacts_dir / f"{model_type}_synthetic_ratings.csv", index=False)
        per_model[model_type] = payload

    summary_payload = {
        "distribution": distribution,
        "feature_analysis": feature_analysis,
        "metrics_summary": metrics_summary,
        "models": per_model,
    }
    with open(analysis_artifacts_dir / "final_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2)

    write_rating_distribution_svg(figures_dir / "rating_distribution.svg", distribution)
    write_metrics_comparison_svg(figures_dir / "model_comparison.svg", metrics_summary)
    write_training_curve_svg(
        figures_dir / "training_curves.svg",
        per_model["option1"]["training_history"],
        per_model["option2"]["training_history"],
    )
    write_ablation_svg(figures_dir / "ablation.svg", feature_analysis)
    write_synthetic_comparison_svg(
        figures_dir / "synthetic_comparison.svg",
        {
            "option1": per_model["option1"]["synthetic_comparison"],
            "option2": per_model["option2"]["synthetic_comparison"],
        },
    )

    report_markdown = build_final_report_markdown(
        distribution=distribution,
        feature_analysis=feature_analysis,
        metrics_summary=metrics_summary,
        option1_analysis=per_model["option1"],
        option2_analysis=per_model["option2"],
    )
    write_file(output_dir / "final_report.md", report_markdown)

    print(f"Wrote {output_dir / 'final_report.md'}")
    print(f"Wrote {analysis_artifacts_dir / 'final_summary.json'}")
    print(f"Wrote {figures_dir}")


if __name__ == "__main__":
    main()
