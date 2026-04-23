"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { dispatchActiveModelChange } from "../../../lib/model-engine";
import { preloadActiveModel } from "../../../lib/api";
import { TrainingEngineCurvesSection } from "./training-engine-curves-block";
import { ActiveModelHistoryCharts } from "./active-model-history-charts";
import { Option3SvdChartsBlock } from "./option3-svd-charts-block";
import { Tooltip, ResponsiveContainer, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";

interface ModelConfig {
  active_model: string;
  available_models: string[];
  metrics?: any;
  metrics_by_model?: Record<string, any>;
  history?: {
    loss?: number[];
    train_loss?: number[];
    val_loss?: number[];
    mae?: number[];
    val_mae?: number[];
    rmse?: number[];
    val_rmse?: number[];
    train_mae?: number[];
    train_rmse?: number[];
    learning_rate?: number[];
  };
  diagnostics?: {
    svd_components?: Array<{
      component: number;
      singular_value: number;
      energy_ratio: number;
      cumulative_energy: number;
    }>;
    user_latent_norm_hist?: Array<{
      bin: string;
      count: number;
    }>;
    item_latent_norm_hist?: Array<{
      bin: string;
      count: number;
    }>;
    top_calibration_weights?: Array<{
      feature: string;
      weight: number;
      abs_weight: number;
    }>;
  } | null;
}

const MODEL_METADATA: Record<string, { title: string; description: string }> = {
  option1: {
    title: "Matrix Factorization (SGD)",
    description:
      "A classic collaborative filtering model that learns latent factors for users and items using Stochastic Gradient Descent. Fast and reliable.",
  },
  option2: {
    title: "Deep Neural CF (Text CNN)",
    description:
      "An advanced deep learning model that combines user/item embeddings with a Text CNN feature extractor for movie titles. Captures complex non-linear patterns.",
  },
  option3_ridge: {
    title: "Option3 Ridge",
    description: "SVD latent factors calibrated with Ridge regression.",
  },
  option3_lasso: {
    title: "Option3 Lasso",
    description: "SVD latent factors calibrated with Lasso regression.",
  },
  option3_knn: {
    title: "Option3 KNN",
    description: "SVD latent factors projected into an item-similarity KNN space.",
  },
  option4: {
    title: "Matrix Factorization (ALS)",
    description:
      "An alternating least squares recommender that iteratively optimizes user and item latent factors with ridge-regularized closed-form updates.",
  },
};

const OPTION3_MODEL_ORDER = ["option3_ridge", "option3_lasso", "option3_knn"];
const OPTION3_MODEL_KEYS = new Set(OPTION3_MODEL_ORDER);
const OPTION1_MODEL_KEYS = new Set(["option1", "option4"]);
const RADAR_VISUAL_FLOOR = 0.12;
const RADAR_METRIC_DEFS = [
  { subject: "MAE↓", key: "mae", direction: "lower" as const },
  { subject: "RMSE↓", key: "rmse", direction: "lower" as const },
  { subject: "P@10↑", key: "precision", direction: "higher" as const },
  { subject: "R@10↑", key: "recall", direction: "higher" as const },
  { subject: "F1@10↑", key: "f_measure", direction: "higher" as const },
  { subject: "NDCG@10↑", key: "ndcg", direction: "higher" as const },
];
const RADAR_MODEL_LABELS: Record<string, string> = {
  option1: "MF-SGD",
  option2: "Deep Hybrid",
  option3_ridge: "SVD-Ridge",
  option3_lasso: "SVD-Lasso",
  option3_knn: "SVD-KNN",
  option4: "MF-ALS",
};

const parseColor = (color: string) => {
  const c = color.trim().toLowerCase();
  if (c.startsWith('rgb')) {
    const match = c.match(/\d+/g);
    if (match && match.length >= 3) {
      return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
    }
  }
  if (c.startsWith('#')) {
    const hex = c.replace('#', '');
    if (hex.length === 3) return [parseInt(hex[0]+hex[0], 16), parseInt(hex[1]+hex[1], 16), parseInt(hex[2]+hex[2], 16)];
    if (hex.length === 6) return [parseInt(hex.substring(0,2), 16), parseInt(hex.substring(2,4), 16), parseInt(hex.substring(4,6), 16)];
  }
  return [0, 0, 0];
};

const colorDistance = (c1: string, c2: string) => {
  const [r1, g1, b1] = parseColor(c1);
  const [r2, g2, b2] = parseColor(c2);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
};

const getRadarModelColor = (modelName: string, activeModel: string, index: number, brandColor: string) => {
  if (modelName === activeModel) return "var(--brand)";
  const palette = [
    "#ec4899", // pink
    "#14b8a6", // teal
    "#f59e0b", // amber
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#ef4444", // red
    "#84cc16", // lime
    "#3b82f6", // blue
  ];
  const safePalette = palette.filter(c => colorDistance(c, brandColor) > 80);
  const finalPalette = safePalette.length > 0 ? safePalette : palette;
  return finalPalette[index % finalPalette.length];
};

let cachedModelConfig: ModelConfig | null = null;

export default function AlgorithmSettings() {
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(cachedModelConfig);
  const [isChangingModel, setIsChangingModel] = useState(false);
  const isChangingModelRef = useRef(false);
  const [chartsMounted, setChartsMounted] = useState(false);
  const [radarDisplayMode, setRadarDisplayMode] = useState<"current" | "all">("current");
  const [animatedCx, setAnimatedCx] = useState(50);
  const [brandColor, setBrandColor] = useState("#6ae100");

  useEffect(() => {
    const targetCx = radarDisplayMode === "all" ? 65 : 50;
    if (animatedCx === targetCx) return;

    let start = performance.now();
    const duration = 350; // ms
    const initialCx = animatedCx;
    let frameId: number;

    const animate = (time: number) => {
      const progress = Math.min((time - start) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setAnimatedCx(initialCx + (targetCx - initialCx) * ease);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      }
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [radarDisplayMode]);
  const fetchConfigSeqRef = useRef(0);

  useEffect(() => {
    const updateBrandColor = () => {
      const computed = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim();
      if (computed) setBrandColor(computed);
    };
    updateBrandColor();
    window.addEventListener("streamx-settings-changed", updateBrandColor);
    return () => window.removeEventListener("streamx-settings-changed", updateBrandColor);
  }, []);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001/api";

  const fetchModelConfig = useCallback(async () => {
    const seq = ++fetchConfigSeqRef.current;
    try {
      const res = await fetch(`${API_BASE}/model-config`);
      if (res.ok) {
        const data = await res.json();
        if (seq !== fetchConfigSeqRef.current) return;
        const availableModels = Array.isArray(data.available_models) ? data.available_models : [];
        const newConfig = { ...data, available_models: availableModels };
        cachedModelConfig = newConfig;
        setModelConfig(newConfig);
      }
    } catch (err) {
      console.error("Failed to fetch model config", err);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchModelConfig();
  }, [fetchModelConfig]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setChartsMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleModelChange = useCallback(async (modelName: string) => {
    if (isChangingModelRef.current || modelName === modelConfig?.active_model) return;
    
    isChangingModelRef.current = true;
    setIsChangingModel(true);
    try {
      const res = await fetch(`${API_BASE}/model-config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ active_model: modelName }),
      });
      
      if (res.ok) {
        // Load full model-config (active_model, history, metrics) in one update.
        // Avoid optimistically setting active_model with stale history — chart titles and series would disagree.
        await fetchModelConfig();

        dispatchActiveModelChange(modelName, { loadStatus: "loading" });

        try {
          const preloadResult = await preloadActiveModel();
          const readyModel = preloadResult.active_model || modelName;
          if (preloadResult.active_model_ready) {
            dispatchActiveModelChange(readyModel, { ready: true });
          } else {
            dispatchActiveModelChange(readyModel, { loadStatus: "error" });
          }
        } catch (preloadError) {
          console.warn("Model preload failed before recommendation refresh", preloadError);
          dispatchActiveModelChange(modelName, { loadStatus: "error" });
        }

        // Force home page to refresh recommendations after preload finishes.
        localStorage.setItem("streamx-force-refresh", Date.now().toString());
      } else {
        console.error("Failed to change model, status:", res.status);
      }
    } catch (err) {
      console.error("Failed to change model", err);
    } finally {
      isChangingModelRef.current = false;
      setIsChangingModel(false);
    }
  }, [modelConfig?.active_model, API_BASE, fetchModelConfig]);

  const activeModel = modelConfig?.active_model ?? "";
  const isOption3StaticFit = OPTION3_MODEL_KEYS.has(activeModel);
  const isOption4Als = activeModel === "option4";

  /** Option1/Option2: epoch-wise curves. Option3 has no iterative epochs — do not reuse the RMSE/MAE fallback (it mislabels two unrelated scalars as a "curve"). */
  const lossChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h || isOption3StaticFit) return [];
    // Neural / Huber loss channel (saved as `loss` or `train_loss` depending on export).
    if (h.loss?.length) {
      return h.loss.map((l, i) => ({ epoch: i + 1, loss: l, val_loss: h.val_loss?.[i] }));
    }
    if (h.train_loss?.length) {
      return h.train_loss.map((l, i) => ({ epoch: i + 1, loss: l, val_loss: h.val_loss?.[i] }));
    }
    // Option1 (SGD) and Option4 (ALS): no loss series; plot train RMSE vs train MAE per epoch.
    return h.train_rmse?.map((r, i) => ({ epoch: i + 1, loss: r, val_loss: h.train_mae?.[i] })) || [];
  }, [modelConfig?.history, isOption3StaticFit]);

  /** Train vs holdout for closed-form Option3 (single fit, no epoch history). */
  const option3ErrorComparisonData = useMemo(() => {
    if (!isOption3StaticFit) return [];
    const h = modelConfig?.history;
    const m = modelConfig?.metrics;
    const trainMae = h?.train_mae?.[0];
    const trainRmse = h?.train_rmse?.[0];
    const testMae = m?.mae;
    const testRmse = m?.rmse;
    if (
      typeof trainMae !== "number" ||
      typeof trainRmse !== "number" ||
      typeof testMae !== "number" ||
      typeof testRmse !== "number"
    ) {
      return [];
    }
    return [
      { metric: "MAE", train: trainMae, test: testMae },
      { metric: "RMSE", train: trainRmse, test: testRmse },
    ];
  }, [isOption3StaticFit, modelConfig?.history, modelConfig?.metrics]);

  const option3SvdEnergyData = useMemo(() => {
    if (!isOption3StaticFit) return [];
    const rows = modelConfig?.diagnostics?.svd_components ?? [];
    return rows
      .filter(
        (row) =>
          typeof row.component === "number" &&
          Number.isFinite(row.component) &&
          typeof row.energy_ratio === "number" &&
          Number.isFinite(row.energy_ratio)
      )
      .map((row) => ({
        component: `C${row.component}`,
        energyPct: row.energy_ratio * 100,
        cumulativePct:
          typeof row.cumulative_energy === "number" && Number.isFinite(row.cumulative_energy)
            ? row.cumulative_energy * 100
            : undefined,
      }));
  }, [isOption3StaticFit, modelConfig?.diagnostics]);

  const option3UserNormHistData = useMemo(() => {
    if (!isOption3StaticFit) return [];
    const rows = modelConfig?.diagnostics?.user_latent_norm_hist ?? [];
    return rows
      .filter(
        (row) =>
          typeof row.bin === "string" &&
          typeof row.count === "number" &&
          Number.isFinite(row.count)
      )
      .map((row) => ({ bin: row.bin, count: row.count }));
  }, [isOption3StaticFit, modelConfig?.diagnostics]);

  const option3ItemNormHistData = useMemo(() => {
    if (!isOption3StaticFit) return [];
    const rows = modelConfig?.diagnostics?.item_latent_norm_hist ?? [];
    return rows
      .filter(
        (row) =>
          typeof row.bin === "string" &&
          typeof row.count === "number" &&
          Number.isFinite(row.count)
      )
      .map((row) => ({ bin: row.bin, count: row.count }));
  }, [isOption3StaticFit, modelConfig?.diagnostics]);

  const option3CalibrationWeightData = useMemo(() => {
    if (!isOption3StaticFit) return [];
    const rows = modelConfig?.diagnostics?.top_calibration_weights ?? [];
    return rows
      .filter(
        (row) =>
          typeof row.feature === "string" &&
          typeof row.abs_weight === "number" &&
          Number.isFinite(row.abs_weight)
      )
      .map((row) => ({ feature: row.feature, absWeight: row.abs_weight }));
  }, [isOption3StaticFit, modelConfig?.diagnostics]);

  const maeChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h?.mae) return [];
    return h.mae.map((m, i) => ({ epoch: i + 1, mae: m, val_mae: h.val_mae?.[i] }));
  }, [modelConfig?.history]);

  const rmseChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h?.rmse) return [];
    return h.rmse.map((r, i) => ({ epoch: i + 1, rmse: r, val_rmse: h.val_rmse?.[i] }));
  }, [modelConfig?.history]);

  const lrChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h?.learning_rate) return [];
    return h.learning_rate.map((lr, i) => ({ epoch: i + 1, lr }));
  }, [modelConfig?.history]);

  const availableModels = modelConfig?.available_models ?? [];

  const option1VariantModels = useMemo(() => {
    const ordered = ["option1", "option4"];
    return ordered.filter((name) => availableModels.includes(name));
  }, [availableModels]);

  const option3VariantModels = useMemo(() => {
    const ordered = OPTION3_MODEL_ORDER;
    return ordered.filter((name) => availableModels.includes(name));
  }, [availableModels]);

  const primaryModelOptions = useMemo(() => {
    return availableModels.filter((name) => {
      if (OPTION3_MODEL_KEYS.has(name)) return false;
      if (["option1", "option4"].includes(name)) return false;
      return true;
    });
  }, [availableModels]);

  const formatMetricNumber = useCallback((value: unknown, digits = 4) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-";
    return value.toFixed(digits);
  }, []);

  const metricCards = useMemo(() => {
    const metrics = modelConfig?.metrics;
    if (!metrics) return [];

    return [
      { label: "MAE↓", value: formatMetricNumber(metrics.mae) },
      { label: "RMSE↓", value: formatMetricNumber(metrics.rmse) },
      { label: "P@10↑", value: formatMetricNumber(metrics.precision) },
      { label: "R@10↑", value: formatMetricNumber(metrics.recall) },
      { label: "F1@10↑", value: formatMetricNumber(metrics.f_measure) },
      { label: "NDCG@10↑", value: formatMetricNumber(metrics.ndcg) },
    ];
  }, [modelConfig?.metrics, formatMetricNumber]);

  const radarModelMetrics = useMemo(() => {
    const metricsByModel = modelConfig?.metrics_by_model ?? {};
    const orderedModels = availableModels.filter((name) => metricsByModel[name]);

    const rows = orderedModels.map((modelName) => ({
      modelName,
      metrics: metricsByModel[modelName],
    }));

    if (
      activeModel &&
      modelConfig?.metrics &&
      !rows.some((row) => row.modelName === activeModel)
    ) {
      rows.unshift({ modelName: activeModel, metrics: modelConfig.metrics });
    }

    return rows.filter((row) =>
      RADAR_METRIC_DEFS.some((def) => Number.isFinite(Number(row.metrics?.[def.key])))
    );
  }, [availableModels, modelConfig?.metrics_by_model, modelConfig?.metrics, activeModel]);

  const radarChartData = useMemo(() => {
    const activeMetrics = modelConfig?.metrics;
    if (!activeMetrics) return [];

    return RADAR_METRIC_DEFS.map((def) => {
      const current = Number(activeMetrics?.[def.key]);
      const allValues = radarModelMetrics
        .map((row) => Number(row.metrics?.[def.key]))
        .filter((v) => Number.isFinite(v));

      let normalized = 0.5;
      if (Number.isFinite(current) && allValues.length > 0) {
        const lo = Math.min(...allValues);
        const hi = Math.max(...allValues);
        const span = hi - lo;
        if (span > 1e-12) {
          normalized =
            def.direction === "lower"
              ? (hi - current) / span
              : (current - lo) / span;
        }
      }

      const rawScore = Math.max(0, Math.min(1, normalized));
      const score = RADAR_VISUAL_FLOOR + rawScore * (1 - RADAR_VISUAL_FLOOR);

      return {
        subject: def.subject,
        score,
        rawScore,
      };
    });
  }, [modelConfig?.metrics, radarModelMetrics]);

  const allModelsRadarChartData = useMemo(() => {
    if (radarModelMetrics.length < 2) return [];

    return RADAR_METRIC_DEFS.map((def) => {
      const allValues = radarModelMetrics
        .map((row) => Number(row.metrics?.[def.key]))
        .filter((v) => Number.isFinite(v));
      const lo = allValues.length > 0 ? Math.min(...allValues) : 0;
      const hi = allValues.length > 0 ? Math.max(...allValues) : 1;
      const span = hi - lo;

      const row: Record<string, string | number> = { subject: def.subject };
      radarModelMetrics.forEach(({ modelName, metrics }) => {
        const value = Number(metrics?.[def.key]);
        let normalized = 0.5;
        if (Number.isFinite(value) && allValues.length > 0) {
          if (span > 1e-12) {
            normalized =
              def.direction === "lower"
                ? (hi - value) / span
                : (value - lo) / span;
          }
        }
        const rawScore = Math.max(0, Math.min(1, normalized));
        const score = RADAR_VISUAL_FLOOR + rawScore * (1 - RADAR_VISUAL_FLOOR);
        row[`${modelName}_score`] = score;
      });
      return row;
    });
  }, [radarModelMetrics]);

  const allModelsLegendItems = useMemo(() => {
    return radarModelMetrics.map(({ modelName }, index) => ({
      modelName,
      label: RADAR_MODEL_LABELS[modelName] ?? MODEL_METADATA[modelName]?.title ?? modelName,
      color: getRadarModelColor(modelName, activeModel, index, brandColor),
      isActive: modelName === activeModel,
    }));
  }, [radarModelMetrics, activeModel, brandColor]);

  return (
    <section className="settings-card">
      <h2>Engines</h2>
      
      <div className="setting-group">
        <label>Active Model</label>
        <p className="setting-desc">Select the algorithm used to generate your personalized recommendations.</p>
        
        <div className="model-selector">
          {modelConfig ? (
            <>
              {option1VariantModels.length > 0 && (
                <div
                  className={`model-option ${OPTION1_MODEL_KEYS.has(modelConfig.active_model) ? "active" : ""}`}
                  onClick={() => {
                    if (!OPTION1_MODEL_KEYS.has(modelConfig.active_model)) {
                      handleModelChange(option1VariantModels[0]);
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    <div className="model-radio">
                      <div className="radio-inner" />
                    </div>
                    <div className="model-info" style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h3 style={{ margin: 0 }}>Matrix Factorization</h3>
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          {option1VariantModels.map((modelName) => {
                            const active = modelConfig.active_model === modelName;
                            return (
                              <button
                                key={modelName}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleModelChange(modelName);
                                }}
                                disabled={isChangingModel}
                                className="variant-button"
                                style={{
                                  flex: "0 1 auto",
                                  minWidth: "100px",
                                  padding: "6px 16px",
                                  borderRadius: "20px",
                                  border: active ? "1px solid var(--brand)" : "1px solid var(--border-soft)",
                                  background: active ? "rgba(99,102,241,0.12)" : "var(--bg-hover-soft)",
                                  color: active ? "var(--text-main)" : "var(--text-subtle)",
                                  fontSize: "0.85rem",
                                  fontWeight: active ? 600 : 500,
                                  cursor: "pointer",
                                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                                  textAlign: "center",
                                }}
                                title={MODEL_METADATA[modelName]?.description ?? modelName}
                              >
                                {modelName === "option1" ? "SGD" : "ALS"}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p>A collaborative filtering model that learns latent factors for users and items. Choose between Stochastic Gradient Descent (SGD) or Alternating Least Squares (MF-ALS) optimization.</p>
                    </div>
                  </div>
                </div>
              )}

              {primaryModelOptions.map(model => (
                <div 
                  key={model} 
                  className={`model-option ${modelConfig.active_model === model ? "active" : ""}`}
                  onClick={() => handleModelChange(model)}
                >
                  <div className="model-radio">
                    <div className="radio-inner" />
                  </div>
                  <div className="model-info">
                    <h3>{MODEL_METADATA[model]?.title ?? model.toUpperCase()}</h3>
                    <p>{MODEL_METADATA[model]?.description ?? "Custom recommendation engine."}</p>
                  </div>
                </div>
              ))}

              {option3VariantModels.length > 0 && (
                <div
                  className={`model-option ${OPTION3_MODEL_KEYS.has(modelConfig.active_model) ? "active" : ""}`}
                  onClick={() => {
                    // If clicking the main card while it's not active, default to the first available Option3 variant.
                    if (!OPTION3_MODEL_KEYS.has(modelConfig.active_model) && option3VariantModels.length > 0) {
                      handleModelChange(option3VariantModels[0]);
                    }
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: "16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                    <div className="model-radio">
                      <div className="radio-inner" />
                    </div>
                    <div className="model-info" style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <h3 style={{ margin: 0 }}>Matrix SVD + Ridge/Lasso/KNN</h3>
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          {option3VariantModels.map((modelName) => {
                            const active = modelConfig.active_model === modelName;
                            return (
                              <button
                                key={modelName}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent triggering the parent card click
                                  handleModelChange(modelName);
                                }}
                                disabled={isChangingModel}
                                className="variant-button"
                                style={{
                                  flex: "0 1 auto",
                                  minWidth: "100px",
                                  padding: "6px 16px",
                                  borderRadius: "20px",
                                  border: active ? "1px solid var(--brand)" : "1px solid var(--border-soft)",
                                  background: active ? "rgba(99,102,241,0.12)" : "var(--bg-hover-soft)",
                                  color: active ? "var(--text-main)" : "var(--text-subtle)",
                                  fontSize: "0.85rem",
                                  fontWeight: active ? 600 : 500,
                                  cursor: "pointer",
                                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                                  textAlign: "center",
                                }}
                                title={MODEL_METADATA[modelName]?.description ?? modelName}
                              >
                                {MODEL_METADATA[modelName]?.title?.replace("Option3 ", "") ?? modelName}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p>A robust linear algebra model that extracts latent factors with Singular Value Decomposition, then applies Ridge, Lasso, or KNN-style scoring in the learned latent space.</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="loading-state">Loading models...</div>
          )}
        </div>
        {isChangingModel && <p className="status-text">Switching model...</p>}
      </div>

      {modelConfig?.metrics && (
        <div className="setting-group" style={{ marginTop: "32px" }}>
          <label>Current Model Metrics</label>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
            <p className="setting-desc" style={{ margin: 0 }}>Compare evaluation metrics across different recommendation engines.</p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setRadarDisplayMode("current")}
                className="variant-button"
                style={{
                  flex: "0 1 auto",
                  minWidth: "100px",
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: radarDisplayMode === "current" ? "1px solid var(--brand)" : "1px solid var(--border-soft)",
                  background: radarDisplayMode === "current" ? "rgba(99,102,241,0.12)" : "var(--bg-hover-soft)",
                  color: radarDisplayMode === "current" ? "var(--text-main)" : "var(--text-subtle)",
                  fontSize: "0.85rem",
                  fontWeight: radarDisplayMode === "current" ? 600 : 500,
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  textAlign: "center",
                }}
              >
                Current model
              </button>
              <button
                type="button"
                onClick={() => setRadarDisplayMode("all")}
                className="variant-button"
                style={{
                  flex: "0 1 auto",
                  minWidth: "100px",
                  padding: "6px 16px",
                  borderRadius: "20px",
                  border: radarDisplayMode === "all" ? "1px solid var(--brand)" : "1px solid var(--border-soft)",
                  background: radarDisplayMode === "all" ? "rgba(99,102,241,0.12)" : "var(--bg-hover-soft)",
                  color: radarDisplayMode === "all" ? "var(--text-main)" : "var(--text-subtle)",
                  fontSize: "0.85rem",
                  fontWeight: radarDisplayMode === "all" ? 600 : 500,
                  cursor: "pointer",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  textAlign: "center",
                }}
              >
                All models
              </button>
            </div>
          </div>

          <div className="model-metrics settings-panel-strong" style={{ marginTop: 0, padding: "20px" }}>
            <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 300px", height: "280px" }}>
                {chartsMounted && (radarDisplayMode === "all" ? allModelsRadarChartData.length > 0 : radarChartData.length > 0) && (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart
                      cx={`${animatedCx}%`}
                      cy="48%"
                      outerRadius={100}
                      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
                      data={radarDisplayMode === "all" ? allModelsRadarChartData : radarChartData}
                    >
                      <PolarGrid
                        gridType="polygon"
                        radialLines
                        polarRadius={[20, 40, 60, 80, 100]}
                        stroke="var(--chart-grid-stroke)"
                      />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text-subtle)", fontSize: 12 }} />
                      <PolarRadiusAxis
                        tickCount={6}
                        domain={[0, 1]}
                        tick={{ fill: "var(--text-subtle)", fontSize: 11 }}
                        axisLine={false}
                        tickFormatter={(value) => {
                          if (value <= 0 || value >= 1) return "";
                          return `${Math.round(value * 100)}%`;
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        formatter={(value: any, name: any, item: any) => {
                          if (radarDisplayMode === "all") {
                            if (typeof value === "number") {
                              const raw = (value - RADAR_VISUAL_FLOOR) / (1 - RADAR_VISUAL_FLOOR);
                              const normalized = Math.max(0, Math.min(1, raw));
                              return [`${(normalized * 100).toFixed(1)}%`, `${name}`];
                            }
                            return ["-", `${name}`];
                          }
                          const raw = item?.payload?.rawScore;
                          return [typeof raw === "number" ? `${(raw * 100).toFixed(1)}%` : "-", "Current model"];
                        }}
                      />
                      {radarDisplayMode === "all" ? (
                        <>
                          {radarModelMetrics.map(({ modelName }, index) => {
                            const isActive = modelName === activeModel;
                            const color = getRadarModelColor(modelName, activeModel, index, brandColor);
                            return (
                              <Radar
                                key={modelName}
                                name={RADAR_MODEL_LABELS[modelName] ?? MODEL_METADATA[modelName]?.title ?? modelName}
                                dataKey={`${modelName}_score`}
                                stroke={color}
                                fill={color}
                                fillOpacity={isActive ? 0.2 : 0.08}
                                strokeWidth={isActive ? 2.4 : 1.6}
                              />
                            );
                          })}
                          <Legend
                            layout="vertical"
                            verticalAlign="top"
                            align="left"
                            wrapperStyle={{ fontSize: "12px", left: "10px", top: "10px" }}
                            content={() => (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "10px",
                                  paddingTop: "2px",
                                }}
                              >
                                {allModelsLegendItems.map((item) => (
                                  <div
                                    key={item.modelName}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "10px",
                                      padding: "2px 0",
                                      color: item.isActive ? "var(--text-main)" : "var(--text-subtle)",
                                      fontWeight: item.isActive ? 700 : 500,
                                      lineHeight: 1.35,
                                    }}
                                  >
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        width: "10px",
                                        height: "10px",
                                        borderRadius: "999px",
                                        flex: "0 0 10px",
                                        background: item.color,
                                        boxShadow: item.isActive ? "0 0 0 3px rgba(255, 255, 255, 0.12)" : "none",
                                      }}
                                    />
                                    <span>{item.label}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          />
                        </>
                      ) : (
                        <Radar
                          name="Normalized score"
                          dataKey="score"
                          stroke="var(--brand)"
                          fill="var(--brand)"
                          fillOpacity={0.24}
                        />
                      )}
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div style={{ flex: "1 1 300px" }}>
                <div className="metrics-grid" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
                  {metricCards.map((card) => (
                    <div key={card.label} className="metric-item">
                      <span className="metric-label">{card.label}</span>
                      <span className="metric-value">{card.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modelConfig && chartsMounted && !isOption3StaticFit && (
        <TrainingEngineCurvesSection
          activeEngineId={modelConfig.active_model}
          activeEngineLabel={RADAR_MODEL_LABELS[modelConfig.active_model] ?? modelConfig.active_model}
        />
      )}

      {modelConfig && chartsMounted && isOption3StaticFit && (
        <Option3SvdChartsBlock
          modelLabel={RADAR_MODEL_LABELS[modelConfig.active_model] ?? modelConfig.active_model}
          errorData={option3ErrorComparisonData}
          energyData={option3SvdEnergyData}
          userNormData={option3UserNormHistData}
          itemNormData={option3ItemNormHistData}
          calibrationData={option3CalibrationWeightData}
        />
      )}

      {modelConfig?.history && chartsMounted && !isOption3StaticFit && (
        <ActiveModelHistoryCharts
          modelLabel={RADAR_MODEL_LABELS[modelConfig.active_model] ?? modelConfig.active_model}
          history={modelConfig.history}
          isOption4Als={isOption4Als}
          lossChartData={lossChartData}
          maeChartData={maeChartData}
          rmseChartData={rmseChartData}
          lrChartData={lrChartData}
        />
      )}
    </section>
  );
}
