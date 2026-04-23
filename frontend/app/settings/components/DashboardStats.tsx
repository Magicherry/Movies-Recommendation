"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { displayMovieTitle } from "../../../lib/api";

interface HistBin {
  label: string;
  count: number;
  binStart: number;
  binEnd: number;
  xMid: number;
}

interface DbStats {
  total_movies: number;
  total_users: number;
  total_ratings: number;
  average_rating: number;
  top_genres: { name: string; count: number }[];
  rating_distribution: { rating: string; count: number }[];
  movies_by_year: { year: string; count: number }[];
  top_rated_movies: { title: string; count: number }[];
  user_activity_histogram?: HistBin[];
  item_popularity_histogram?: HistBin[];
}

const AXIS_LINE = { stroke: "var(--border-soft)" as const };
const AXIS_TICK = { fill: "var(--text-subtle)", fontSize: 11 };

function formatCountTick(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 10_000) return `${Math.round(v / 1_000)}k`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function formatTooltipCount(value: unknown) {
  if (value == null) return ["—", "Count"];
  if (typeof value === "number") return [value.toLocaleString(), "Count"];
  return [String(value), "Count"];
}

const tooltipBase = (seriesColor: string) => ({
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)",
    border: "var(--chart-tooltip-border)",
    borderRadius: "var(--chart-tooltip-radius)",
  },
  labelStyle: { color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 } as const,
  itemStyle: { color: seriesColor, fontSize: 13, fontWeight: 600 } as const,
  formatter: formatTooltipCount,
  cursor: { fill: "var(--chart-cursor-fill)" } as const,
  wrapperStyle: { outline: "none" } as const,
});

const tooltipLineYear = {
  contentStyle: {
    backgroundColor: "var(--chart-tooltip-bg)",
    border: "var(--chart-tooltip-border)",
    borderRadius: "var(--chart-tooltip-radius)",
  },
  labelStyle: { color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 } as const,
  itemStyle: { color: "var(--chart-db-year)" } as const,
  formatter: formatTooltipCount,
  wrapperStyle: { outline: "none" } as const,
};

function histLabelFormatter(
  _label: string,
  payload: unknown,
  perUnit: "user" | "movie"
) {
  const arr = payload as Array<{ payload?: HistBin }> | undefined;
  const row = arr?.[0]?.payload;
  if (row && typeof row.binStart === "number" && typeof row.binEnd === "number") {
    const u = perUnit === "user" ? "user" : "movie";
    return `${Math.round(row.binStart)} – ${Math.round(row.binEnd)} ratings per ${u}`;
  }
  return "";
}

/** For log Y: Recharts log scale cannot use 0; use null to omit the bar; `count` remains for tooltips */
function histRowsForLogBar(rows: HistBin[]) {
  return rows.map((d) => ({
    ...d,
    countLog: d.count > 0 ? d.count : (null as number | null),
  }));
}

// Recharts Tooltip formatter typing is overly strict; we only need payload.count for the true total
function histTooltipValueFormatter(
  _value: unknown,
  name: unknown,
  item: unknown
): [string, string] {
  const payload = (item as { payload?: HistBin } | undefined)?.payload;
  const raw = payload?.count;
  const label = typeof name === "string" ? name : "Count";
  if (typeof raw === "number") return [raw.toLocaleString(), label];
  return [String(_value != null ? _value : "0"), label];
}

/** Bottom row (genre + rating): same chart height so the 2×2 grid aligns */
const DASHBOARD_BOTTOM_ROW_CHART_H = 360;

export default function DashboardStats() {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [scrapeState, setScrapeState] = useState<{
    status: string;
    processed: number;
    total: number;
    message: string;
    summary?: {
      links_id_hit: number;
      title_search_hit: number;
      no_match: number;
    };
  } | null>(null);
  const [testResult, setTestResult] = useState<{valid: boolean, message: string} | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [refreshAll, setRefreshAll] = useState(false);
  
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8001/api";

  useEffect(() => {
    fetchStats();
    fetchScrapeStatus();
    fetchApiKey();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (scrapeState?.status === "running" || scrapeState?.status === "starting") {
      interval = setInterval(fetchScrapeStatus, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [scrapeState?.status]);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };

  const fetchScrapeStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/scrape/status`);
      if (res.ok) {
        const data = await res.json();
        if (data.status !== "idle" || scrapeState) {
          setScrapeState(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch scrape status", err);
    }
  };

  const fetchApiKey = async () => {
    try {
      const res = await fetch(`${API_BASE}/scrape/key`);
      if (res.ok) {
        const data = await res.json();
        if (data.api_key) {
          setApiKey(data.api_key);
          // Set to password mode initially when loaded from .env
          setShowApiKey(false);
        }
      }
    } catch (err) {
      console.error("Failed to fetch api key", err);
    }
  };

  const startScrape = async () => {
    try {
      const res = await fetch(`${API_BASE}/scrape/start`, { 
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ api_key: apiKey, refresh: refreshAll })
      });
      if (res.ok) {
        fetchScrapeStatus();
      }
    } catch (err) {
      console.error("Failed to start scrape", err);
    }
  };

  const cancelScrape = async () => {
    try {
      const res = await fetch(`${API_BASE}/scrape/cancel`, { 
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
      if (res.ok) {
        fetchScrapeStatus();
      }
    } catch (err) {
      console.error("Failed to cancel scrape", err);
    }
  };

  const testApiKey = async () => {
    if (!apiKey) {
      setTestResult({ valid: false, message: "Please enter an API Key first" });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      const res = await fetch(`${API_BASE}/scrape/test-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ api_key: apiKey })
      });
      
      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      } else {
        setTestResult({ valid: false, message: "Failed to connect to server" });
      }
    } catch (err) {
      console.error("Failed to test api key", err);
      setTestResult({ valid: false, message: "Network error occurred" });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <section className="settings-card">
      <h2>Database</h2>
      
      <div className="setting-group">
        <label>Dataset Overview</label>
        <p className="setting-desc">
          This application is powered by the <a href="https://grouplens.org/datasets/movielens/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand)', textDecoration: 'none' }}>MovieLens dataset</a>, collected by the GroupLens Research Project at the University of Minnesota. It is widely recognized as the benchmark dataset for evaluating recommender systems.
        </p>
        
        {stats ? (
          <div className="stats-overview" style={{ marginTop: '16px' }}>
            <div className="stat-box">
              <span className="stat-value">{stats.total_movies.toLocaleString()}</span>
              <span className="stat-label">Total Movies</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{stats.total_users.toLocaleString()}</span>
              <span className="stat-label">Active Users</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{stats.total_ratings.toLocaleString()}</span>
              <span className="stat-label">User Ratings</span>
            </div>
            <div className="stat-box">
              <span className="stat-value">{stats.average_rating.toFixed(2)}</span>
              <span className="stat-label">Avg Rating</span>
            </div>
          </div>
        ) : (
          <div className="loading-state" style={{ marginTop: '16px' }}>Loading database statistics...</div>
        )}
      </div>

      <div className="setting-group">
        <label>TMDB Data Scraping</label>
        <p className="setting-desc">
          Enrich the movie database by fetching high-quality posters, backdrops, and overviews from the TMDB API.
        </p>
        
        <div className="setting-group-block" style={{ padding: '20px', background: 'var(--bg-overlay-light)', borderRadius: 'var(--radius-panel)', border: '1px solid var(--border-soft)', display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label htmlFor="tmdb-api-key" style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
              TMDB API Key (Optional if set in .env)
            </label>
            <div className="tmdb-scrape-controls">
              <div className="tmdb-api-input-wrap">
                <input
                  className={`tmdb-scrape-input${showApiKey ? "" : " tmdb-scrape-input--masked"}`}
                  id="tmdb-api-key"
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter your TMDB API Key"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null); // Clear test result on change
                  }}
                  onFocus={() => setShowApiKey(true)}
                  onBlur={() => setShowApiKey(false)}
                  disabled={scrapeState?.status === 'running' || scrapeState?.status === 'starting'}
                />
              </div>
              <button 
                onClick={testApiKey}
                disabled={scrapeState?.status === 'running' || scrapeState?.status === 'starting' || isTesting || !apiKey}
                className="settings-action-btn settings-action-btn-secondary"
              >
                {isTesting ? 'Testing...' : 'Test Key'}
              </button>
              <button 
                onClick={startScrape}
                disabled={scrapeState?.status === 'running' || scrapeState?.status === 'starting'}
                className="settings-action-btn settings-action-btn-primary"
              >
                {scrapeState?.status === 'running' || scrapeState?.status === 'starting' ? 'Scraping in Progress...' : refreshAll ? 'Refresh All Metadata' : 'Start Scraping'}
              </button>
              {(scrapeState?.status === 'running' || scrapeState?.status === 'starting') && (
                <button 
                  onClick={cancelScrape}
                  className="settings-action-btn"
                  style={{ background: '#ef4444', color: 'white', borderColor: '#ef4444' }}
                >
                  Cancel
                </button>
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: (scrapeState?.status === 'running' || scrapeState?.status === 'starting') ? 'not-allowed' : 'pointer', opacity: (scrapeState?.status === 'running' || scrapeState?.status === 'starting') ? 0.7 : 1, width: '100%' }}>
              <input
                type="checkbox"
                checked={refreshAll}
                onChange={(e) => setRefreshAll(e.target.checked)}
                disabled={scrapeState?.status === 'running' || scrapeState?.status === 'starting'}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>Refresh all (re-scrape existing metadata)</span>
            </label>
            {testResult && (
              <div
                className="tmdb-test-result-inline"
                style={{
                  fontSize: '0.85rem',
                  color: testResult.valid ? '#10b981' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {testResult.valid ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                )}
                {testResult.message}
              </div>
            )}
          </div>

          {scrapeState && scrapeState.status !== 'idle' && (
            <div className="overlay-box" style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-soft)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                <span style={{ color: 'var(--text-main)' }}>
                  {scrapeState.status === 'completed' ? 'Scraping Completed' : 
                   scrapeState.status === 'error' ? 'Error occurred' : 
                   scrapeState.status === 'starting' ? 'Starting scrape...' : 'Progress'}
                </span>
                <span style={{ color: 'var(--brand)', fontWeight: 600 }}>
                  {scrapeState.status === 'completed' ? '100%' : 
                   scrapeState.total > 0 ? `${Math.round((scrapeState.processed / scrapeState.total) * 100)}%` : '0%'}
                </span>
              </div>
              
              <div className="progress-track tmdb-scrape-progress-track">
                <div 
                  className="progress-fill" 
                  style={{ 
                    width: scrapeState.status === 'completed' ? '100%' : `${scrapeState.total > 0 ? (scrapeState.processed / scrapeState.total) * 100 : 0}%`,
                    background: scrapeState.status === 'error' ? '#ef4444' : 'var(--brand)',
                    transition: 'width 0.3s ease'
                  }} 
                />
              </div>
              
              <div style={{ 
                marginTop: '8px', 
                fontSize: '0.8rem', 
                color: scrapeState.status === 'error' ? '#ef4444' : 'var(--text-subtle)',
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ wordBreak: 'break-word', paddingRight: '16px' }}>{scrapeState.message}</span>
                {scrapeState.total > 0 && (
                  <span style={{ whiteSpace: 'nowrap' }}>{scrapeState.processed} / {scrapeState.total} movies</span>
                )}
              </div>

              {scrapeState.summary && (
                <div
                  style={{
                    marginTop: "10px",
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: "8px",
                    fontSize: "0.78rem",
                  }}
                >
                  <div
                    style={{
                      background: "rgba(56, 189, 248, 0.12)",
                      border: "1px solid rgba(56, 189, 248, 0.35)",
                      borderRadius: "8px",
                      padding: "8px",
                    }}
                  >
                    <div style={{ color: "#7dd3fc", fontWeight: 600 }}>Links TMDB hits</div>
                    <div style={{ color: "var(--text-main)", marginTop: "2px" }}>
                      {scrapeState.summary.links_id_hit.toLocaleString()}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.35)",
                      borderRadius: "8px",
                      padding: "8px",
                    }}
                  >
                    <div style={{ color: "#86efac", fontWeight: 600 }}>Title search hits</div>
                    <div style={{ color: "var(--text-main)", marginTop: "2px" }}>
                      {scrapeState.summary.title_search_hit.toLocaleString()}
                    </div>
                  </div>
                  <div
                    style={{
                      background: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      borderRadius: "8px",
                      padding: "8px",
                    }}
                  >
                    <div style={{ color: "#fca5a5", fontWeight: 600 }}>No match</div>
                    <div style={{ color: "var(--text-main)", marginTop: "2px" }}>
                      {scrapeState.summary.no_match.toLocaleString()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {stats && (
        <>
        <div className="setting-group">
          <label>Data distributions</label>
          <p className="setting-desc">Histograms and genre mix from the loaded ratings. Long tails are typical of collaborative data.</p>
          <div className="db-dashboard-grid">
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">User activity distribution</h4>
                <p className="setting-desc">Number of users by how many ratings each user submitted.</p>
                {stats.user_activity_histogram && stats.user_activity_histogram.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={histRowsForLogBar(stats.user_activity_histogram)}
                      margin={{ top: 6, right: 8, left: 2, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        interval={3}
                        height={46}
                        angle={-40}
                        textAnchor="end"
                        tickMargin={4}
                        label={{ value: "Ratings per user", position: "bottom", offset: 10, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        scale="log"
                        domain={[1, "auto"]}
                        allowDataOverflow
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        tickFormatter={(v: number) => formatCountTick(v)}
                        label={{ value: "Users (log scale)", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        labelStyle={{ color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 }}
                        itemStyle={{ color: "var(--chart-hist-user)", fontSize: 13, fontWeight: 600 }}
                        formatter={histTooltipValueFormatter}
                        labelFormatter={(l, p) => histLabelFormatter(l, p, "user")}
                        cursor={{ fill: "var(--chart-cursor-fill)" }}
                        wrapperStyle={{ outline: "none" }}
                      />
                      <Bar
                        dataKey="countLog"
                        name="Users"
                        fill="var(--chart-hist-user)"
                        radius={[2, 2, 0, 0]}
                        maxBarSize={14}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="db-chart-empty">No histogram data</div>
                )}
              </div>
            </div>
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">Item popularity distribution</h4>
                <p className="setting-desc">Number of movies by how many ratings each title received.</p>
                {stats.item_popularity_histogram && stats.item_popularity_histogram.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={histRowsForLogBar(stats.item_popularity_histogram)}
                      margin={{ top: 6, right: 8, left: 2, bottom: 28 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        interval={3}
                        height={46}
                        angle={-40}
                        textAnchor="end"
                        tickMargin={4}
                        label={{ value: "Ratings per movie", position: "bottom", offset: 10, fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <YAxis
                        type="number"
                        scale="log"
                        domain={[1, "auto"]}
                        allowDataOverflow
                        axisLine={AXIS_LINE}
                        tickLine={false}
                        tick={AXIS_TICK}
                        width={52}
                        tickFormatter={(v: number) => formatCountTick(v)}
                        label={{ value: "Movies (log scale)", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--chart-tooltip-bg)",
                          border: "var(--chart-tooltip-border)",
                          borderRadius: "var(--chart-tooltip-radius)",
                        }}
                        labelStyle={{ color: "var(--text-subtle)", fontSize: 12, marginBottom: 4 }}
                        itemStyle={{ color: "var(--chart-hist-item)", fontSize: 13, fontWeight: 600 }}
                        formatter={histTooltipValueFormatter}
                        labelFormatter={(l, p) => histLabelFormatter(l, p, "movie")}
                        cursor={{ fill: "var(--chart-cursor-fill)" }}
                        wrapperStyle={{ outline: "none" }}
                      />
                      <Bar
                        dataKey="countLog"
                        name="Movies"
                        fill="var(--chart-hist-item)"
                        radius={[2, 2, 0, 0]}
                        maxBarSize={14}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="db-chart-empty">No histogram data</div>
                )}
              </div>
            </div>
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">Genre distribution (Top 12)</h4>
                <p className="setting-desc">Movies per genre in the library (multi-label titles count in each genre).</p>
                <div className="db-dashboard-bottom-plot">
                <ResponsiveContainer width="100%" height={DASHBOARD_BOTTOM_ROW_CHART_H}>
                  <BarChart
                    data={stats.top_genres}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 4, bottom: 32 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" horizontal={false} />
                    <XAxis
                      type="number"
                      axisLine={AXIS_LINE}
                      tickLine={false}
                      tick={AXIS_TICK}
                      tickFormatter={formatCountTick}
                      label={{ value: "Number of movies", position: "bottom", offset: 12, fill: "var(--text-subtle)", fontSize: 11 }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      axisLine={AXIS_LINE}
                      tickLine={false}
                      tick={AXIS_TICK}
                      width={108}
                    />
                    <Tooltip {...tooltipBase("var(--chart-db-genre)")} />
                    <Bar dataKey="count" name="Movies" fill="var(--chart-db-genre)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="db-dashboard-cell">
              <div className="chart-wrapper settings-db-charts db-chart-card">
                <h4 className="db-chart-title">Rating distribution</h4>
                <p className="setting-desc">Volume of ratings at each half-star (0.5–5.0).</p>
                <div className="db-dashboard-bottom-plot">
                <ResponsiveContainer width="100%" height={DASHBOARD_BOTTOM_ROW_CHART_H}>
                  <BarChart data={stats.rating_distribution} margin={{ top: 8, right: 10, left: 4, bottom: 32 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                    <XAxis
                      dataKey="rating"
                      axisLine={AXIS_LINE}
                      tickLine={false}
                      tick={AXIS_TICK}
                      label={{ value: "Rating", position: "bottom", offset: 12, fill: "var(--text-subtle)", fontSize: 11 }}
                    />
                    <YAxis
                      axisLine={AXIS_LINE}
                      tickLine={false}
                      tick={AXIS_TICK}
                      tickFormatter={formatCountTick}
                      width={52}
                      label={{ value: "Count", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                    />
                    <Tooltip {...tooltipBase("var(--chart-db-rating)")} />
                    <Bar dataKey="count" name="Count" fill="var(--chart-db-rating)" radius={[3, 3, 0, 0]} maxBarSize={40} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="setting-group">
          <div className="chart-wrapper settings-db-charts db-chart-card">
            <h4 className="db-chart-title">Movies Added by Year (Last 20 Years)</h4>
            <p className="setting-desc">The number of movies released each year over the past two decades.</p>
            <ResponsiveContainer width="100%" height={360}>
              <LineChart data={stats.movies_by_year} margin={{ top: 12, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                <XAxis
                  dataKey="year"
                  axisLine={AXIS_LINE}
                  tickLine={false}
                  tick={AXIS_TICK}
                  label={{ value: "Year", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                  minTickGap={8}
                />
                <YAxis
                  axisLine={AXIS_LINE}
                  tickLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={formatCountTick}
                  width={48}
                  label={{ value: "Movies", angle: -90, position: "insideLeft", fill: "var(--text-subtle)", fontSize: 11 }}
                />
                <Tooltip {...tooltipLineYear} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Count"
                  stroke="var(--chart-db-year)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "var(--chart-db-year)", stroke: "var(--bg-surface)", strokeWidth: 1 }}
                  activeDot={{ r: 5, fill: "var(--chart-db-year)" }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="setting-group">
          <div className="chart-wrapper settings-db-charts db-chart-card">
            <h4 className="db-chart-title">Most Rated Movies</h4>
            <p className="setting-desc">The movies that have received the highest number of user ratings.</p>
            <ResponsiveContainer width="100%" height={380}>
              <BarChart
                data={stats.top_rated_movies.map((m) => ({ ...m, title: displayMovieTitle(m.title) }))}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" horizontal={false} />
                <XAxis
                  type="number"
                  axisLine={AXIS_LINE}
                  tickLine={false}
                  tick={AXIS_TICK}
                  tickFormatter={formatCountTick}
                  label={{ value: "Rating count", position: "bottom", offset: 0, fill: "var(--text-subtle)", fontSize: 11 }}
                />
                <YAxis
                  dataKey="title"
                  type="category"
                  axisLine={AXIS_LINE}
                  tickLine={false}
                  tick={{ ...AXIS_TICK, fontSize: 11 }}
                  width={200}
                  tickFormatter={(t: string) => (t.length > 36 ? `${t.slice(0, 33)}…` : t)}
                />
                <Tooltip {...tooltipBase("var(--chart-db-toprated)")} />
                <Bar dataKey="count" name="Count" fill="var(--chart-db-toprated)" radius={[0, 5, 5, 0]} maxBarSize={22} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
      )}
    </section>
  );
}
