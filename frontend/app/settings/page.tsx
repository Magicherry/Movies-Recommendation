"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import AppearanceSettings from "./components/AppearanceSettings";
import AlgorithmSettings from "./components/AlgorithmSettings";
import DashboardStats from "./components/DashboardStats";
import AccountSettings from "./components/AccountSettings";
import AdvancedSettings from "./components/AdvancedSettings";

const VALID_TABS = ["ui", "db", "model", "account", "advanced", "about"];
const DEFAULT_TAB = "ui";

function resolveInitialTab(tabFromUrl: string | null): string {
  if (tabFromUrl && VALID_TABS.includes(tabFromUrl)) {
    return tabFromUrl;
  }
  if (typeof window !== "undefined") {
    const savedTab = localStorage.getItem("streamx-settings-last-tab");
    if (savedTab && VALID_TABS.includes(savedTab)) {
      return savedTab;
    }
  }
  return DEFAULT_TAB;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(() => resolveInitialTab(tabFromUrl));
  const [isDetailView, setIsDetailView] = useState(() => resolveInitialTab(tabFromUrl) !== DEFAULT_TAB);

  // Sync URL tab to state when URL changes (e.g. back/forward)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && VALID_TABS.includes(t)) {
      setActiveTab(t);
      setIsDetailView(true);
      localStorage.setItem("streamx-settings-last-tab", t);
    } else if (!t) {
      const savedTab = localStorage.getItem("streamx-settings-last-tab");
      if (savedTab && VALID_TABS.includes(savedTab)) {
        setActiveTab(savedTab);
        setIsDetailView(savedTab !== DEFAULT_TAB);
        const url = new URL(window.location.href);
        url.searchParams.set("tab", savedTab);
        window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
      } else {
        setActiveTab(DEFAULT_TAB);
        setIsDetailView(false);
      }
    }
  }, [searchParams]);

  // When mounting, ensure we start at the top
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleTabClick = (tab: string) => {
    setActiveTab(tab);
    setIsDetailView(true);
    localStorage.setItem("streamx-settings-last-tab", tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", url.pathname + "?" + url.searchParams.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="settings-page content-padding" style={{ paddingTop: "60px", minHeight: "100vh" }}>
      <div className="settings-header" style={{ marginTop: 0, marginBottom: "30px" }}>
        <h1 className="row-header" style={{ fontSize: "2.5rem", paddingLeft: "0", marginBottom: "16px" }}>Settings & Dashboard</h1>
        <p className="helper-text" style={{ color: "var(--text-subtle)", margin: 0 }}>Customize your experience and view platform statistics.</p>
      </div>

      <div className={`settings-layout ${isDetailView ? 'detail-open' : 'menu-open'}`}>
        <aside className="settings-sidebar">
          <nav className="settings-nav">
            <button 
              className={`settings-nav-item ${activeTab === "ui" ? "active" : ""}`}
              onClick={() => handleTabClick("ui")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
              Appearance
            </button>
            <button 
              className={`settings-nav-item ${activeTab === "db" ? "active" : ""}`}
              onClick={() => handleTabClick("db")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              Database
            </button>
            <button 
              className={`settings-nav-item ${activeTab === "model" ? "active" : ""}`}
              onClick={() => handleTabClick("model")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              Engines
            </button>
            <button 
              className={`settings-nav-item ${activeTab === "account" ? "active" : ""}`}
              onClick={() => handleTabClick("account")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              Account
            </button>
            <button 
              className={`settings-nav-item ${activeTab === "advanced" ? "active" : ""}`}
              onClick={() => handleTabClick("advanced")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              Advanced
            </button>
            <button 
              className={`settings-nav-item ${activeTab === "about" ? "active" : ""}`}
              onClick={() => handleTabClick("about")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
              About
            </button>
          </nav>
        </aside>

        <main className="settings-content">
          <div className="mobile-back-btn-container">
            <button className="btn-back" style={{ position: 'relative', top: 0, left: 0, marginBottom: '16px' }} onClick={() => setIsDetailView(false)} aria-label="Go back">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
          </div>
          
          {activeTab === "ui" && <AppearanceSettings />}
          {activeTab === "db" && <DashboardStats />}
          {activeTab === "account" && <AccountSettings />}
          {activeTab === "model" && <AlgorithmSettings />}
          {activeTab === "advanced" && <AdvancedSettings />}
          {activeTab === "about" && (
            <section className="settings-card about-card">
              <h2 className="about-title" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "24px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <img src="/icon.png" alt="StreamX Logo" style={{ width: "32px", height: "32px", borderRadius: "6px" }} />
                  <span><span className="about-brand">Stream</span><span className="about-brand-alt">X</span></span>
                </span>
              </h2>
              <div className="about-content">
                <p className="about-intro">
                  <strong><span className="about-brand">Stream</span><span className="about-brand-alt">X</span></strong> is a personalized movie recommendation system built as a final project. It leverages advanced machine learning algorithms to provide tailored movie suggestions based on user preferences.
                </p>
                <div className="about-actions">
                  <a
                    href="https://github.com/Magicherry/Movies-Recommendation"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-card about-github-link"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                    View on GitHub
                  </a>
                </div>
                <div className="about-sections">
                  <div className="about-section">
                    <h3 className="about-section-title">Tech Stack</h3>
                    <ul className="about-list">
                      <li><strong className="about-label">Frontend:</strong> Next.js, React, Recharts</li>
                      <li><strong className="about-label">Backend:</strong> Django REST Framework</li>
                      <li><strong className="about-label">Machine Learning:</strong> TensorFlow, NumPy, Pandas</li>
                    </ul>
                  </div>
                  <div className="about-section">
                    <h3 className="about-section-title">Recommendation Engines</h3>
                    <ul className="about-list">
                      <li><strong className="about-label">Matrix Factorization:</strong> Custom implementations trained with Stochastic Gradient Descent (SGD) and Alternating Least Squares (MF-ALS).</li>
                      <li><strong className="about-label">Deep Neural CF:</strong> Hybrid deep learning model with Text CNN for title feature extraction.</li>
                      <li><strong className="about-label">Matrix SVD:</strong> Closed-form SVD latent factors paired with Ridge, Lasso, or KNN-style latent scoring.</li>
                    </ul>
                  </div>
                  <div className="about-section">
                    <h3 className="about-section-title">Data Sources</h3>
                    <p className="about-text">
                      Core ratings and movie metadata are from the{" "}
                      <a href="https://grouplens.org/datasets/movielens/" target="_blank" rel="noopener noreferrer" className="about-link">MovieLens Latest dataset (ml-latest)</a>.
                      High-quality posters and backdrops are dynamically fetched via the{" "}
                      <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer" className="about-link">TMDB API</a>.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
