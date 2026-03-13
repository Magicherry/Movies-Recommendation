"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  const [recCount, setRecCount] = useState(10);
  const [watchAgainCount, setWatchAgainCount] = useState(15);
  const [trendingCount, setTrendingCount] = useState(15);
  const [moreLikeThisCount, setMoreLikeThisCount] = useState(15);
  const [countsExpanded, setCountsExpanded] = useState(false);
  const [chartsMounted, setChartsMounted] = useState(false);

  const MIN_REC = 5;
  const MAX_REC = 100;
  const STEP_REC = 5;
  const MIN_COL = 5;
  const MAX_COL = 100;
  const STEP_COL = 5;
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

  const fetchModelConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/model-config`);
      if (res.ok) {
        const data = await res.json();
        setModelConfig(data);
      }
    } catch (err) {
      console.error("Failed to fetch model config", err);
    }
  }, [API_BASE]);

  useEffect(() => {
    fetchModelConfig();
    
    const savedRecCount = localStorage.getItem("streamx-rec-count");
    if (savedRecCount) {
      const val = parseInt(savedRecCount, 10);
      if (!isNaN(val)) setRecCount(Math.min(MAX_REC, Math.max(MIN_REC, val)));
    }
    const savedWatchAgain = localStorage.getItem("streamx-watch-again-count");
    if (savedWatchAgain) {
      const val = parseInt(savedWatchAgain, 10);
      if (!isNaN(val)) setWatchAgainCount(Math.min(MAX_COL, Math.max(MIN_COL, val)));
    }
    const savedTrending = localStorage.getItem("streamx-trending-count");
    if (savedTrending) {
      const val = parseInt(savedTrending, 10);
      if (!isNaN(val)) setTrendingCount(Math.min(MAX_COL, Math.max(MIN_COL, val)));
    }
    const savedMoreLikeThis = localStorage.getItem("streamx-more-like-this-count");
    if (savedMoreLikeThis) {
      const val = parseInt(savedMoreLikeThis, 10);
      if (!isNaN(val)) setMoreLikeThisCount(Math.min(MAX_COL, Math.max(MIN_COL, val)));
    }
  }, [fetchModelConfig]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setChartsMounted(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const handleModelChange = useCallback(async (modelName: string) => {
    if (modelName === modelConfig?.active_model) return;
    
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
  }, [modelConfig?.active_model, API_BASE, fetchModelConfig]);

  const handleRecCountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setRecCount(val);
    localStorage.setItem("streamx-rec-count", val.toString());
  }, []);

  const handleRecCountInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    const val = parseInt(raw, 10);
    if (!isNaN(val)) {
      const clamped = Math.min(MAX_REC, Math.max(MIN_REC, val));
      setRecCount(clamped);
      localStorage.setItem("streamx-rec-count", clamped.toString());
    }
  }, []);

  const handleRecCountInputBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < MIN_REC || val > MAX_REC) {
      const fallback = Math.min(MAX_REC, Math.max(MIN_REC, recCount));
      setRecCount(fallback);
      localStorage.setItem("streamx-rec-count", fallback.toString());
    }
  }, [recCount]);

  const makeCollectionHandlers = useCallback((
    setter: React.Dispatch<React.SetStateAction<number>>,
    key: string
  ) => ({
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value, 10);
      setter(val);
      localStorage.setItem(key, val.toString());
    },
    onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (raw === "") return;
      const val = parseInt(raw, 10);
      if (!isNaN(val)) {
        const clamped = Math.min(MAX_COL, Math.max(MIN_COL, val));
        setter(clamped);
        localStorage.setItem(key, clamped.toString());
      }
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>, current: number) => {
      const val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < MIN_COL || val > MAX_COL) {
        const fallback = Math.min(MAX_COL, Math.max(MIN_COL, current));
        setter(fallback);
        localStorage.setItem(key, fallback.toString());
      }
    },
  }), []);

  const watchAgainHandlers = useMemo(() => makeCollectionHandlers(setWatchAgainCount, "streamx-watch-again-count"), [makeCollectionHandlers]);
  const trendingHandlers = useMemo(() => makeCollectionHandlers(setTrendingCount, "streamx-trending-count"), [makeCollectionHandlers]);
  const moreLikeThisHandlers = useMemo(() => makeCollectionHandlers(setMoreLikeThisCount, "streamx-more-like-this-count"), [makeCollectionHandlers]);

  // Unified value when collapsed: use recCount as display; when changed, sync all four (5–100)
  const unifiedCount = recCount;
  const setAllCounts = (val: number) => {
    const clamped = Math.min(100, Math.max(5, val));
    setRecCount(clamped);
    setWatchAgainCount(clamped);
    setTrendingCount(clamped);
    setMoreLikeThisCount(clamped);
    localStorage.setItem("streamx-rec-count", clamped.toString());
    localStorage.setItem("streamx-watch-again-count", clamped.toString());
    localStorage.setItem("streamx-trending-count", clamped.toString());
    localStorage.setItem("streamx-more-like-this-count", clamped.toString());
  };
  const handleUnifiedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setAllCounts(val);
  };
  const handleUnifiedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") return;
    const val = parseInt(raw, 10);
    if (!isNaN(val)) setAllCounts(val);
  };
  const handleUnifiedBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val) || val < 5 || val > 100) setAllCounts(unifiedCount);
  };

  const allCountsEqual =
    recCount === watchAgainCount &&
    watchAgainCount === trendingCount &&
    trendingCount === moreLikeThisCount;

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

      <div className="setting-group settings-collapse-card">
        <button
          type="button"
          onClick={() => setCountsExpanded((e) => !e)}
          className="settings-collapse-header"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '16px 20px',
            background: 'var(--bg-overlay)',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-main)',
            fontSize: '1rem',
            textAlign: 'left',
          }}
          aria-expanded={countsExpanded}
          aria-controls="display-counts-content"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontWeight: 600 }}>Display Counts</h3>
            {!countsExpanded && !allCountsEqual && (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: 'var(--brand)',
                  background: 'rgba(106, 225, 0, 0.15)',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-xs)',
                }}
              >
                Custom
              </span>
            )}
          </span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="settings-collapse-chevron"
            style={{
              flexShrink: 0,
              transform: countsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div id="display-counts-content" className="settings-collapse-content">
          {/* Collapsed: single slider. Panel height 0 when expanded, so we animate between two panels. */}
          <div
            className="settings-collapse-panel"
            style={{ maxHeight: countsExpanded ? 0 : 200 }}
            aria-hidden={countsExpanded}
          >
            <div className="setting-row settings-collapse-content-inner">
              <div className="setting-row-info" style={{ flex: 1 }}>
                <p style={{ margin: 0, color: 'var(--text-subtle)', fontSize: '0.9rem' }}>
                  Adjust all counts together (Recommendation, Watch It Again, Trending Now, More Like This). Moving the slider sets all four to the same value.
                </p>
                {!allCountsEqual && (
                  <p style={{ margin: '10px 0 0', color: 'var(--text-subtle)', fontSize: '0.85rem' }}>
                    Current: Rec {recCount} · Watch again {watchAgainCount} · Trending {trendingCount} · More {moreLikeThisCount}. Expand to edit individually.
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={unifiedCount}
                  onChange={handleUnifiedChange}
                  className="range-slider"
                  style={{ "--slider-progress": `${((unifiedCount - 5) / 95) * 100}%` } as React.CSSProperties}
                />
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={unifiedCount}
                  onChange={handleUnifiedInputChange}
                  onBlur={handleUnifiedBlur}
                  className="settings-number-input"
                  style={{ width: '72px' }}
                  aria-label="All display counts"
                />
              </div>
            </div>
          </div>
          {/* Expanded: four rows. Panel height 0 when collapsed. */}
          <div
            className="settings-collapse-panel"
            style={{ maxHeight: countsExpanded ? 800 : 0 }}
            aria-hidden={!countsExpanded}
          >
            <div className="settings-collapse-content-inner">
              <div className="setting-row">
                <div className="setting-row-info">
                  <h3>Recommendation Count</h3>
                  <p>Number of movies to show in your personalized feed.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <input 
                    type="range" 
                    min={MIN_REC} 
                    max={MAX_REC} 
                    step={STEP_REC} 
                    value={recCount} 
                    onChange={handleRecCountChange}
                    className="range-slider"
                    style={{ "--slider-progress": `${((recCount - MIN_REC) / (MAX_REC - MIN_REC)) * 100}%` } as React.CSSProperties}
                  />
                  <input
                    type="number"
                    min={MIN_REC}
                    max={MAX_REC}
                    value={recCount}
                    onChange={handleRecCountInputChange}
                    onBlur={handleRecCountInputBlur}
                    className="settings-number-input"
                    style={{ width: '72px' }}
                    aria-label="Recommendation count"
                  />
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-row-info">
                  <h3>Watch It Again</h3>
                  <p>Max items to show in the Watch It Again row on the home page.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <input 
                    type="range" 
                    min={MIN_COL} 
                    max={MAX_COL} 
                    step={STEP_COL} 
                    value={watchAgainCount} 
                    onChange={watchAgainHandlers.onChange}
                    className="range-slider"
                    style={{ "--slider-progress": `${((watchAgainCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
                  />
                  <input
                    type="number"
                    min={MIN_COL}
                    max={MAX_COL}
                    value={watchAgainCount}
                    onChange={watchAgainHandlers.onInputChange}
                    onBlur={(e) => watchAgainHandlers.onBlur(e, watchAgainCount)}
                    className="settings-number-input"
                    style={{ width: '72px' }}
                    aria-label="Watch It Again count"
                  />
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-row-info">
                  <h3>Trending Now</h3>
                  <p>Max items to show in the Trending Now row on the home page.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <input 
                    type="range" 
                    min={MIN_COL} 
                    max={MAX_COL} 
                    step={STEP_COL} 
                    value={trendingCount} 
                    onChange={trendingHandlers.onChange}
                    className="range-slider"
                    style={{ "--slider-progress": `${((trendingCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
                  />
                  <input
                    type="number"
                    min={MIN_COL}
                    max={MAX_COL}
                    value={trendingCount}
                    onChange={trendingHandlers.onInputChange}
                    onBlur={(e) => trendingHandlers.onBlur(e, trendingCount)}
                    className="settings-number-input"
                    style={{ width: '72px' }}
                    aria-label="Trending Now count"
                  />
                </div>
              </div>
              <div className="setting-row">
                <div className="setting-row-info">
                  <h3>More Like This</h3>
                  <p>Max items to show in the More Like This row on movie detail pages.</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <input 
                    type="range" 
                    min={MIN_COL} 
                    max={MAX_COL} 
                    step={STEP_COL} 
                    value={moreLikeThisCount} 
                    onChange={moreLikeThisHandlers.onChange}
                    className="range-slider"
                    style={{ "--slider-progress": `${((moreLikeThisCount - MIN_COL) / (MAX_COL - MIN_COL)) * 100}%` } as React.CSSProperties}
                  />
                  <input
                    type="number"
                    min={MIN_COL}
                    max={MAX_COL}
                    value={moreLikeThisCount}
                    onChange={moreLikeThisHandlers.onInputChange}
                    onBlur={(e) => moreLikeThisHandlers.onBlur(e, moreLikeThisCount)}
                    className="settings-number-input"
                    style={{ width: '72px' }}
                    aria-label="More Like This count"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
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
