"use client";

import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { displayMovieTitle } from "../../../lib/api";

interface DbStats {
  total_movies: number;
  total_users: number;
  total_ratings: number;
  average_rating: number;
  top_genres: { name: string; count: number }[];
  rating_distribution: { rating: string; count: number }[];
  movies_by_year: { year: string; count: number }[];
  top_rated_movies: { title: string; count: number }[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#8dd1e1', '#a4de6c', '#d0ed57'];

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
            <label>Top Genres Distribution</label>
            <p className="setting-desc">The distribution of movies across the most popular genres.</p>
            <div className="chart-wrapper" style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.top_genres} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                  <XAxis dataKey="name" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                    itemStyle={{ color: 'var(--brand)' }}
                    cursor={{ fill: 'var(--chart-cursor-fill)' }}
                  />
                  <Bar dataKey="count" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="setting-group">
            <label>Rating Distribution</label>
            <p className="setting-desc">How users have rated movies on the 0.5 to 5.0 scale.</p>
            <div className="chart-wrapper" style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.rating_distribution} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                  <XAxis dataKey="rating" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                    itemStyle={{ color: '#8884d8' }}
                    cursor={{ fill: 'var(--chart-cursor-fill)' }}
                  />
                  <Bar dataKey="count" fill="#8884d8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="setting-group">
            <label>Movies Added by Year (Last 20 Years)</label>
            <p className="setting-desc">The number of movies released each year over the past two decades.</p>
            <div className="chart-wrapper" style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={stats.movies_by_year} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" vertical={false} />
                  <XAxis dataKey="year" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <YAxis stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                    itemStyle={{ color: '#82ca9d' }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#82ca9d" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="setting-group">
            <label>Most Rated Movies</label>
            <p className="setting-desc">The movies that have received the highest number of user ratings.</p>
            <div className="chart-wrapper" style={{ marginTop: '16px' }}>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={stats.top_rated_movies.map((m) => ({ ...m, title: displayMovieTitle(m.title) }))} layout="vertical" margin={{ top: 20, right: 30, left: 150, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid-stroke)" horizontal={false} />
                  <XAxis type="number" stroke="#a1a1aa" tick={{ fill: '#a1a1aa' }} />
                  <YAxis dataKey="title" type="category" stroke="#a1a1aa" tick={{ fill: '#a1a1aa', fontSize: 13 }} width={250} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: 'var(--chart-tooltip-border)', borderRadius: 'var(--chart-tooltip-radius)' }}
                    itemStyle={{ color: '#ffc658' }}
                    cursor={{ fill: 'var(--chart-cursor-fill)' }}
                  />
                  <Bar dataKey="count" fill="#ffc658" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
