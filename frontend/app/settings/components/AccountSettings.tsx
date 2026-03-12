"use client";

import { useUser } from "../../../context/user-context";
import { useState } from "react";
import { getUserHistory } from "../../../lib/api";

export default function AccountSettings() {
  const { userId, setUserId } = useUser();
  const [inputId, setInputId] = useState(userId.toString());
  const [isExporting, setIsExporting] = useState(false);

  const handleUserChange = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(inputId, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 610) {
      setUserId(parsed);
    } else {
      setInputId(userId.toString());
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
        
        <form onSubmit={handleUserChange} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input 
            type="number" 
            value={inputId} 
            onChange={e => setInputId(e.target.value)}
            min="1"
            max="610"
            className="settings-number-input"
            style={{ width: '100px' }}
          />
          <button type="submit" className="btn-primary" style={{ padding: '10px 20px', fontSize: '1rem' }}>
            Switch User
          </button>
        </form>
      </div>

      <div className="setting-row" style={{ marginTop: '32px' }}>
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
