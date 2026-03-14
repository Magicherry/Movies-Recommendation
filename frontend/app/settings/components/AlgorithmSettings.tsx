"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

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
}

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
        setModelConfig(data);
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

  const lossChartData = useMemo(() => {
    const h = modelConfig?.history;
    if (!h) return [];
    if (h.loss) return h.loss.map((l, i) => ({ epoch: i + 1, loss: l, val_loss: h.val_loss?.[i] }));
    return h.train_rmse?.map((r, i) => ({ epoch: i + 1, loss: r, val_loss: h.train_mae?.[i] })) || [];
  }, [modelConfig?.history]);

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
  const usesAllTestRelevance = modelConfig?.metrics?.topn_relevance === "all_test";

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
  }, [modelConfig?.metrics, formatMetricInteger, formatMetricNumber, topK]);

  return (
    <section className="settings-card">
      <h2>Engines</h2>
      
      <div className="setting-group">
        <label>Active Model</label>
        <p className="setting-desc">Select the algorithm used to generate your personalized recommendations.</p>
        
        <div className="model-selector">
          {modelConfig ? (
            modelConfig.available_models.map(model => (
              <div 
                key={model} 
                className={`model-option ${modelConfig.active_model === model ? "active" : ""}`}
                onClick={() => handleModelChange(model)}
              >
                <div className="model-radio">
                  <div className="radio-inner" />
                </div>
                <div className="model-info">
                  <h3>{model === "option1" ? "Matrix Factorization (SGD)" : "Deep Neural CF (Text CNN)"}</h3>
                  <p>
                    {model === "option1" 
                      ? "A classic collaborative filtering model that learns latent factors for users and items using Stochastic Gradient Descent. Fast and reliable."
                      : "An advanced deep learning model that combines user/item embeddings with a Text CNN feature extractor for movie titles. Captures complex non-linear patterns."}
                  </p>
                </div>
              </div>
            ))
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
          
          <div className="metrics-info settings-panel-inset" style={{ marginTop: '24px', marginBottom: 0 }}>
            <h5 style={{ 
              margin: '0 0 12px 0', 
              fontWeight: 600, 
              color: 'var(--text-main)',
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              Evaluation Criteria & Standards
            </h5>
            <ul style={{ 
              margin: 0, 
              paddingLeft: '0', 
              listStyle: 'none',
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px' 
            }}>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Holdout Protocol</strong> 
                  A per-user 80/20 random split is applied so each user is evaluated on personalized unseen interactions.
                </div>
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Candidate Filtering</strong> 
                  Recommendation candidates always exclude items already observed in each user's training set.
                </div>
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Point-wise Error</strong> 
                  `MAE` and `RMSE` evaluate rating prediction error on hidden test interactions (lower is better).
                </div>
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Top-{topK} Ranking Quality</strong>{" "}
                  {`Precision@${topK}, Recall@${topK}, F-measure@${topK}, and NDCG@${topK}`} measure recommendation quality in the top-{topK} list (higher is better).
                </div>
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Top-K Relevance Rule</strong>{" "}
                  {usesAllTestRelevance ? (
                    <>All hidden test interactions are treated as relevant (`all_test`, CS550-aligned).</>
                  ) : (
                    <>A recommended item is relevant only when its hidden-test rating is <strong>≥ {modelConfig.metrics.min_relevant_rating || "4.0"}</strong> (`rating_threshold`).</>
                  )}
                </div>
              </li>
              <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: '4px' }}>Model Selection</strong> 
                  The deployed checkpoint is chosen by validation performance (minimum validation loss), reported by Best Model Epoch and Best Model Val Loss.
                </div>
              </li>
            </ul>
          </div>
        </div>
      )}

      {modelConfig?.history && chartsMounted && (
        <div className="model-history">
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 400px' }}>
              <h4>Training History ({modelConfig.history.loss ? 'Loss' : 'RMSE'})</h4>
              <div className="chart-wrapper chart-wrapper-fixed settings-chart-wrapper-strong">
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

            {modelConfig.history.mae && modelConfig.history.val_mae && (
              <div style={{ flex: '1 1 400px' }}>
                <h4>Training History (MAE)</h4>
                <div className="chart-wrapper chart-wrapper-fixed settings-chart-wrapper-strong">
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
              <div style={{ flex: '1 1 400px' }}>
                <h4>Training History (RMSE)</h4>
                <div className="chart-wrapper chart-wrapper-fixed settings-chart-wrapper-strong">
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
              <div style={{ flex: '1 1 400px' }}>
                <h4>Learning Rate Schedule</h4>
                <div className="chart-wrapper chart-wrapper-fixed settings-chart-wrapper-strong">
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
