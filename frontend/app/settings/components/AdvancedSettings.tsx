"use client";

import { useState, useEffect } from "react";

export default function AdvancedSettings() {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

  useEffect(() => {
    checkApi();
  }, []);

  const checkApi = async () => {
    setApiStatus("checking");
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) {
        setApiStatus("online");
      } else {
        setApiStatus("offline");
      }
    } catch {
      setApiStatus("offline");
    }
  };

  const handleClearCache = () => {
    if (confirm("Are you sure you want to clear all local settings and cache? This will reload the page.")) {
      localStorage.clear();
      window.location.reload();
    }
  };

  return (
    <section className="settings-card">
      <h2>Advanced</h2>

      <div className="setting-row">
        <div className="setting-row-info">
          <h3>Backend API Status</h3>
          <p>Current endpoint: <code>{API_BASE}</code></p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ 
            display: 'inline-block', 
            width: '10px', 
            height: '10px', 
            borderRadius: '50%', 
            backgroundColor: apiStatus === 'online' ? 'var(--brand)' : apiStatus === 'offline' ? '#ef4444' : '#f59e0b' 
          }}></span>
          <span style={{ fontWeight: 600, textTransform: 'capitalize', color: apiStatus === 'online' ? 'var(--brand)' : apiStatus === 'offline' ? '#ef4444' : '#f59e0b' }}>
            {apiStatus}
          </span>
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', marginLeft: '12px' }} onClick={checkApi}>
            Retry
          </button>
        </div>
      </div>

      <div className="setting-row">
        <div className="setting-row-info">
          <h3>Clear Local Storage</h3>
          <p>Resets UI preferences, theme, and locally cached settings.</p>
        </div>
        <button onClick={handleClearCache} className="btn-danger">
          Clear Cache
        </button>
      </div>

      <div className="setting-row">
        <div className="setting-row-info">
          <h3>Developer Mode</h3>
          <p>Enable verbose logging in the console.</p>
        </div>
        <label className="toggle-switch">
          <input 
            type="checkbox" 
            defaultChecked={typeof window !== 'undefined' ? localStorage.getItem("streamx-dev-mode") === "true" : false} 
            onChange={(e) => {
              const isDev = e.target.checked;
              localStorage.setItem("streamx-dev-mode", isDev.toString());
              if (isDev) {
                console.log("[StreamX Dev Mode] Enabled");
              }
            }} 
          />
          <span className="toggle-slider"></span>
        </label>
      </div>
    </section>
  );
}
