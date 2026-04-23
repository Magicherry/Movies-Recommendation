"use client";

import { useUser } from "../../../context/user-context";
import { useState, useEffect } from "react";
import { getUserHistory } from "../../../lib/api";

export default function AccountSettings() {
  const { userId, setUserId } = useUser();
  const [inputId, setInputId] = useState(userId.toString());
  const [isExporting, setIsExporting] = useState(false);
  const [switchMessage, setSwitchMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setInputId(userId.toString());
  }, [userId]);

  const handleUserChange = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputId, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 610) {
      setUserId(parsed);
      setSwitchMessage({ type: "success", text: `Switched to User ${parsed}` });
    } else {
      setInputId(userId.toString());
      setSwitchMessage({ type: "error", text: "Please enter a valid user ID (1–610)." });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      // Fetch user's full history (pass true for fetchAll)
      const history = await getUserHistory(userId, true);
      
      const exportData = {
        user_id: userId,
        export_date: new Date().toISOString(),
        total_ratings: history.length,
        ratings: history.map(item => ({
          movie_id: item.item_id,
          title: item.title,
          rating: item.rating,
          genres: item.genres
        }))
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user_${userId}_data_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export data:", error);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="settings-card">
      <h2>Account</h2>

      <div className="setting-group">
        <label>Current Active User</label>
        <p className="setting-desc">Change the user context to simulate recommendations for different profiles (1-610).</p>
        
        <form onSubmit={handleUserChange} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          <input 
            type="number" 
            value={inputId} 
            onChange={e => setInputId(e.target.value)}
            onWheel={(e) => (e.currentTarget as HTMLInputElement).blur()}
            min="1"
            max="610"
            className="settings-number-input"
            style={{ width: '100px' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '10px 20px', fontSize: '1rem' }}>
            Switch User
          </button>
        </form>
        {switchMessage && (
          <p
            style={{
              marginTop: '12px',
              marginBottom: 0,
              fontSize: '0.9rem',
              color: switchMessage.type === 'success' ? 'var(--brand-default)' : '#ef4444',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 500,
            }}
          >
            {switchMessage.type === 'success' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {switchMessage.text}
          </p>
        )}
      </div>

      <div className="setting-row account-setting-row-section">
        <div className="setting-row-info">
          <h3>Export Personal Data</h3>
          <p>Download a JSON file containing your ratings and preferences.</p>
        </div>
        <button 
          className="btn-secondary" 
          onClick={handleExportData}
          disabled={isExporting}
          style={{ opacity: isExporting ? 0.7 : 1, cursor: isExporting ? 'not-allowed' : 'pointer' }}
        >
          {isExporting ? "Exporting..." : "Export Data"}
        </button>
      </div>
    </section>
  );
}
