"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

interface ModelConfig {
  active_model: string;
  available_models: string[];
  metrics?: any;
  history?: {
    loss?: number[];
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
  option4: {
    title: "ALS Matrix Factorization",
    description:
      "An alternating least squares recommender that iteratively optimizes user and item latent factors with ridge-regularized closed-form updates.",
  },
};

const OPTION3_MODEL_KEYS = new Set(["option3_ridge", "option3_lasso"]);
const OPTION1_MODEL_KEYS = new Set(["option1", "option4"]);

export default function AlgorithmSettings() {
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [isChangingModel, setIsChangingModel] = useState(false);
  const [chartsMounted, setChartsMounted] = useState(false);
  const fetchConfigSeqRef = useRef(0);

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

  const fetchModelConfig = useCallback(async () => {
    const seq = ++fetchConfigSeqRef.current;
    try {
      const res = await fetch(`${API_BASE}/model-config`);
      if (res.ok) {
        const data = await res.json();
        if (seq !== fetchConfigSeqRef.current) return;
        const availableModels = Array.isArray(data.available_models) ? data.available_models : [];
        setModelConfig({ ...data, available_models: availableModels });
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
    if (isChangingModel || modelName === modelConfig?.active_model) return;
    
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
        // Optimistically update the UI
        setModelConfig(prev => prev ? { ...prev, active_model: modelName } : null);
        // Force home page to refresh recommendations
        localStorage.setItem("streamx-force-refresh", Date.now().toString());
        // Dispatch a custom event so the navbar in the same tab updates immediately
        window.dispatchEvent(new Event('streamx-engine-changed'));
        // Fetch full config to get new metrics
        await fetchModelConfig();
      } else {
        console.error("Failed to change model, status:", res.status);
      }
    } catch (err) {
      console.error("Failed to change model", err);
    } finally {
      setIsChangingModel(false);
    }
  }, [isChangingModel, modelConfig?.active_model, API_BASE, fetchModelConfig]);

  const activeModel = modelConfig?.active_model ?? "";
  const isOption3StaticFit = OPTION3_MODEL_KEYS.has(activeModel);
  const isOption4Als = activeModel === "option4";

  /** Option1/Option2: epoch-wise curves. Option3 has no iterative epochs — do not reuse the RMSE/MAE fallback (it mislabels two unrelated scalars as a "curve"). */
  const lossChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h || isOption3StaticFit) return [];
    if (h.loss) return h.loss.map((l, i) => ({ epoch: i + 1, loss: l, val_loss: h.val_loss?.[i] }));
    // Option1 and Option4: no neural "loss"; plot per-epoch train RMSE vs train MAE (legacy chart pairing).
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

  const hasOption3Charts =
    option3ErrorComparisonData.length > 0 ||
    option3SvdEnergyData.length > 0 ||
    option3UserNormHistData.length > 0 ||
    option3ItemNormHistData.length > 0 ||
    option3CalibrationWeightData.length > 0;

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

  const topK = Number(modelConfig?.metrics?.top_k ?? 10);
  const availableModels = modelConfig?.available_models ?? [];

  const option1VariantModels = useMemo(() => {
    const ordered = ["option1", "option4"];
    return ordered.filter((name) => availableModels.includes(name));
  }, [availableModels]);

  const option3VariantModels = useMemo(() => {
    const ordered = ["option3_ridge", "option3_lasso"];
    return ordered.filter((name) => availableModels.includes(name));
  }, [availableModels]);

  const primaryModelOptions = useMemo(() => {
    return availableModels.filter((name) => {
      if (["option3_ridge", "option3_lasso"].includes(name)) return false;
      if (["option1", "option4"].includes(name)) return false;
      return true;
    });
  }, [availableModels]);

  const formatMetricNumber = useCallback((value: unknown, digits = 4) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-";
    return value.toFixed(digits);
  }, []);

  const formatMetricInteger = useCallback((value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "-";
    return `${Math.round(value)}`;
  }, []);

  const metricCards = useMemo(() => {
    const metrics = modelConfig?.metrics;
    if (!metrics) return [];
    if (OPTION3_MODEL_KEYS.has(activeModel)) {
      return [
        { label: "SVD rank (n_factors)", value: formatMetricInteger(metrics.n_factors) },
        {
          label: "Reg strength (α)",
          value: formatMetricNumber(metrics.reg_alpha),
        },
        { label: "MAE (holdout)", value: formatMetricNumber(metrics.mae) },
        { label: "RMSE (holdout)", value: formatMetricNumber(metrics.rmse) },
        { label: `Precision@${topK}`, value: formatMetricNumber(metrics.precision) },
        { label: `Recall@${topK}`, value: formatMetricNumber(metrics.recall) },
        { label: `F-measure@${topK}`, value: formatMetricNumber(metrics.f_measure) },
        { label: `NDCG@${topK}`, value: formatMetricNumber(metrics.ndcg) },
      ];
    }
    if (isOption4Als) {
      return [
        { label: "ALS factors (n_factors)", value: formatMetricInteger(metrics.n_factors) },
        { label: "ALS epochs", value: formatMetricInteger(metrics.epochs) },
        { label: "Reg strength (lambda)", value: formatMetricNumber(metrics.reg) },
        { label: "Bias reg", value: formatMetricNumber(metrics.bias_reg) },
        { label: "MAE (holdout)", value: formatMetricNumber(metrics.mae) },
        { label: "RMSE (holdout)", value: formatMetricNumber(metrics.rmse) },
        { label: `Precision@${topK}`, value: formatMetricNumber(metrics.precision) },
        { label: `Recall@${topK}`, value: formatMetricNumber(metrics.recall) },
        { label: `F-measure@${topK}`, value: formatMetricNumber(metrics.f_measure) },
        { label: `NDCG@${topK}`, value: formatMetricNumber(metrics.ndcg) },
      ];
    }
    if (activeModel === "option1") {
      return [
        { label: "SGD factors (n_factors)", value: formatMetricInteger(metrics.n_factors) },
        { label: "Best Epoch", value: formatMetricInteger(metrics.best_model_epoch ?? metrics.best_epoch) },
        { label: "Reg strength (lambda)", value: formatMetricNumber(metrics.reg) },
        { label: "Learning Rate", value: formatMetricNumber(metrics.lr) },
        { label: "MAE (holdout)", value: formatMetricNumber(metrics.mae) },
        { label: "RMSE (holdout)", value: formatMetricNumber(metrics.rmse) },
        { label: `Precision@${topK}`, value: formatMetricNumber(metrics.precision) },
        { label: `NDCG@${topK}`, value: formatMetricNumber(metrics.ndcg) },
      ];
    }
    return [
      { label: "Best Model Epoch", value: formatMetricInteger(metrics.best_model_epoch ?? metrics.best_epoch) },
      { label: "Best Model Val Loss", value: formatMetricNumber(metrics.best_model_val_loss) },
      { label: "MAE", value: formatMetricNumber(metrics.mae) },
      { label: "RMSE", value: formatMetricNumber(metrics.rmse) },
      { label: `Precision@${topK}`, value: formatMetricNumber(metrics.precision) },
      { label: `Recall@${topK}`, value: formatMetricNumber(metrics.recall) },
      { label: `F-measure@${topK}`, value: formatMetricNumber(metrics.f_measure) },
      { label: `NDCG@${topK}`, value: formatMetricNumber(metrics.ndcg) },
    ];
  }, [modelConfig?.metrics, activeModel, formatMetricInteger, formatMetricNumber, topK, isOption4Als]);

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
                      <p>A collaborative filtering model that learns latent factors for users and items. Choose between Stochastic Gradient Descent (SGD) or Alternating Least Squares (ALS) optimization.</p>
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
                    // If clicking the main card while it's not active, default to option3_ridge
                    if (!OPTION3_MODEL_KEYS.has(modelConfig.active_model)) {
                      handleModelChange("option3_ridge");
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
                        <h3 style={{ margin: 0 }}>Matrix SVD + Ridge/Lasso</h3>
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
                      <p>A robust linear algebra model that extracts latent factors using Singular Value Decomposition, calibrated with Ridge or Lasso regression for stable generalization.</p>
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
        <div className="model-metrics settings-panel-strong">
          <h4>Current Model Metrics</h4>
          <div className="metrics-grid">
            {metricCards.map((card) => (
              <div key={card.label} className="metric-item">
                <span className="metric-label">{card.label}</span>
                <span className="metric-value">{card.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartsMounted && isOption3StaticFit && hasOption3Charts && (
        <div className="model-history">
          <h4 style={{ marginBottom: "8px" }}>Training fit vs holdout test</h4>
          <p className="setting-desc" style={{ marginBottom: "20px" }}>
            Matrix SVD runs one closed-form pipeline (truncated SVD, biases, optional Ridge/Lasso). There is no per-epoch loss curve. Bars compare
            in-sample error on the training split to MAE/RMSE on the held-out test split from metrics.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
            {option3ErrorComparisonData.length > 0 && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Error comparison (train vs holdout)</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={option3ErrorComparisonData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis dataKey="metric" stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        formatter={(value) => (typeof value === "number" ? value.toFixed(4) : `${value ?? "-"}`)}
                      />
                      <Legend />
                      <Bar dataKey="train" name="Training (in-sample)" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                      <Bar dataKey="test" name="Holdout test" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {option3SvdEnergyData.length > 0 && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>SVD component energy share</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={option3SvdEnergyData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis dataKey="component" stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} />
                      <YAxis
                        stroke="#a1a1aa"
                        tick={{ fill: "#a1a1aa" }}
                        domain={[0, "auto"]}
                        tickFormatter={(value) => `${value}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        formatter={(value) =>
                          typeof value === "number" ? `${value.toFixed(2)}%` : `${value ?? "-"}`
                        }
                      />
                      <Legend />
                      <Bar dataKey="energyPct" name="Energy %" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {option3UserNormHistData.length > 0 && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>User latent norm distribution</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={option3UserNormHistData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis dataKey="bin" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} angle={-25} textAnchor="end" height={56} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="count" name="User count" fill="#14b8a6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {option3ItemNormHistData.length > 0 && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Item latent norm distribution</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={option3ItemNormHistData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis dataKey="bin" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} angle={-25} textAnchor="end" height={56} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="count" name="Item count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {option3CalibrationWeightData.length > 0 && (
              <div style={{
                gridColumn: "1 / -1",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Top calibration weights (|w|)</h4>
                <div style={{ height: "300px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={option3CalibrationWeightData} margin={{ top: 8, right: 16, left: 8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis dataKey="feature" stroke="#a1a1aa" tick={{ fill: "#a1a1aa", fontSize: 11 }} angle={-25} textAnchor="end" height={56} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: "#a1a1aa" }} domain={[0, "auto"]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        formatter={(value) => (typeof value === "number" ? value.toFixed(5) : `${value ?? "-"}`)}
                      />
                      <Legend />
                      <Bar dataKey="absWeight" name="|weight|" fill="#8b5cf6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {modelConfig?.history && chartsMounted && !isOption3StaticFit && (
        <div className="model-history">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px" }}>
            {lossChartData.length > 0 && (
            <div style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-soft)",
              borderRadius: "12px",
              padding: "20px 20px 20px 0",
              display: "flex",
              flexDirection: "column",
              boxShadow: "var(--shadow-card)"
            }}>
              <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>
                {isOption4Als ? "ALS Training Convergence" : `Training History (${modelConfig.history.loss ? 'Loss' : 'RMSE'})`}
              </h4>
              <div style={{ height: "250px", width: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lossChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" />
                    <XAxis dataKey="epoch" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                    <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="loss" 
                      stroke="var(--brand)" 
                      strokeWidth={2} 
                      dot={false} 
                      name={modelConfig.history.loss ? "Train Loss" : "Train RMSE"} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="val_loss" 
                      stroke="#ec4899" 
                      strokeWidth={2} 
                      dot={false} 
                      name={modelConfig.history.loss ? "Val Loss" : "Train MAE"} 
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            )}

            {modelConfig.history.mae && modelConfig.history.val_mae && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Training History (MAE)</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={maeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" />
                      <XAxis dataKey="epoch" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="mae" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        dot={false} 
                        name="Train MAE" 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="val_mae" 
                        stroke="#f59e0b" 
                        strokeWidth={2} 
                        dot={false} 
                        name="Val MAE" 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {modelConfig.history.rmse && modelConfig.history.val_rmse && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Training History (RMSE)</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rmseChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" />
                      <XAxis dataKey="epoch" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} domain={['auto', 'auto']} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="rmse" 
                        stroke="#8b5cf6" 
                        strokeWidth={2} 
                        dot={false} 
                        name="Train RMSE" 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="val_rmse" 
                        stroke="#10b981" 
                        strokeWidth={2} 
                        dot={false} 
                        name="Val RMSE" 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {modelConfig.history.learning_rate && (
              <div style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-soft)",
                borderRadius: "12px",
                padding: "20px 20px 20px 0",
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-card)"
              }}>
                <h4 style={{ margin: "0 0 16px 20px", fontSize: "1rem", fontWeight: 600, color: "var(--text-main)" }}>Learning Rate Schedule</h4>
                <div style={{ height: "250px", width: "100%" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={lrChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" />
                      <XAxis dataKey="epoch" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                      <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} domain={['auto', 'auto']} tickFormatter={(val) => val.toExponential(1)} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                        formatter={(value) => (typeof value === "number" ? value.toExponential(4) : `${value ?? "-"}`)}
                      />
                      <Legend />
                      <Line 
                        type="stepAfter" 
                        dataKey="lr" 
                        stroke="#06b6d4" 
                        strokeWidth={2} 
                        dot={false} 
                        name="Learning Rate" 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
