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
        <div className="model-metrics">
          <h4>Current Model Metrics</h4>
          <div className="metrics-grid">
            <div className="metric-item">
              <span className="metric-label">RMSE</span>
              <span className="metric-value">{modelConfig.metrics.rmse?.toFixed(4)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">MAE</span>
              <span className="metric-value">{modelConfig.metrics.mae?.toFixed(4)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">Precision@10</span>
              <span className="metric-value">{modelConfig.metrics.precision?.toFixed(4)}</span>
            </div>
            <div className="metric-item">
              <span className="metric-label">NDCG@10</span>
              <span className="metric-value">{modelConfig.metrics.ndcg?.toFixed(4)}</span>
            </div>
          </div>
          
          <div className="metrics-info settings-panel settings-panel-inset" style={{ marginTop: '24px', marginBottom: 0 }}>
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
              display: 'flex', 
              flexDirection: 'column', 
              gap: '12px' 
            }}>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)' }}>Data Split Strategy:</strong> Per-user 80/20 random holdout split to ensure personalized and unbiased evaluation.
                </div>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)' }}>Unseen Items Only:</strong> Recommendations strictly exclude movies the user has already rated in the training set.
                </div>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)' }}>RMSE / MAE:</strong> Measures the error in rating predictions across all test items (lower is better).
                </div>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)' }}>Precision@10 / NDCG@10:</strong> Measures the quality of the top-10 recommended items (higher is better).
                </div>
              </li>
              <li style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: 'var(--brand)', marginTop: '2px' }}>•</span>
                <div>
                  <strong style={{ color: 'var(--text-main)' }}>Relevance Threshold:</strong> For Top-K metrics, a movie is considered a "relevant" recommendation if the user rated it <strong>≥ {modelConfig.metrics.min_relevant_rating || "4.0"}</strong> in the hidden test set.
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
              <div className="chart-wrapper chart-wrapper-fixed">
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
                <div className="chart-wrapper chart-wrapper-fixed">
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
                <div className="chart-wrapper chart-wrapper-fixed">
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
          </div>
        </div>
      )}
    </section>
  );
}
