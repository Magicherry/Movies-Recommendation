"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "../context/user-context";

export default function PredictionDisplay({ itemId }: { itemId: number }) {
  const { userId } = useUser();
  const [prediction, setPrediction] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEngine, setActiveEngine] = useState<string>("the active model");
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    async function fetchPrediction() {
      const seq = ++fetchSeqRef.current;
      setLoading(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";
        const res = await fetch(`${API_BASE}/predict/${userId}/${itemId}`);
        if (res.ok) {
          const data = await res.json();
          if (disposed || seq !== fetchSeqRef.current) return;
          if (data.predicted_rating !== null) {
            setPrediction(data.predicted_rating);
          } else {
            setPrediction(null);
          }
        }
        
        // Also fetch current model config to show what model is used
        const modelRes = await fetch(`${API_BASE}/model-config`);
        if (modelRes.ok) {
          const modelData = await modelRes.json();
          if (disposed || seq !== fetchSeqRef.current) return;
          if (modelData.active_model === 'option1') {
            setActiveEngine('Matrix Factorization');
          } else if (modelData.active_model === 'option2') {
            setActiveEngine('Deep Neural CF');
          } else if (modelData.active_model === 'option3_ridge') {
            setActiveEngine('Matrix SVD + Ridge');
          } else if (modelData.active_model === 'option3_lasso') {
            setActiveEngine('Matrix SVD + Lasso');
          } else if (modelData.active_model === 'option3') {
            setActiveEngine('Matrix SVD + Regression');
          } else if (modelData.active_model === 'option4') {
            setActiveEngine('ALS Matrix Factorization');
          } else {
            setActiveEngine(modelData.active_model);
          }
        }
      } catch (err) {
        console.error("Failed to fetch prediction", err);
      } finally {
        if (disposed || seq !== fetchSeqRef.current) return;
        setLoading(false);
      }
    }
    
    fetchPrediction();
    
    // Listen for engine change events to refetch prediction
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamx-force-refresh') {
        fetchPrediction();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('streamx-engine-changed', fetchPrediction);
    
    return () => {
      disposed = true;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('streamx-engine-changed', fetchPrediction);
    };
  }, [userId, itemId]);

  if (loading) {
    return (
      <div className="hero-actions" style={{ gap: "16px", marginTop: "8px" }}>
        <div className="stat-pill" style={{ padding: "8px 24px", background: "var(--bg-hover-soft)" }}>
          <span style={{ fontSize: "0.9rem", color: "var(--text-subtle)" }}>Analyzing match...</span>
        </div>
      </div>
    );
  }

  if (prediction === null) {
    return null;
  }

  // Convert 1-5 scale rating to a percentage for UI flair
  const matchPercentage = Math.round((prediction / 5) * 100);
  
  let matchColor = "#4ade80"; // green
  if (matchPercentage < 60) matchColor = "#ef4444"; // red
  else if (matchPercentage < 80) matchColor = "#facc15"; // yellow

  return (
    <div className="hero-actions" style={{ gap: "16px", marginTop: "8px", alignItems: "center" }}>
      <div className="stat-pill" style={{ 
        padding: "8px 24px", 
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(10px)",
        border: `1px solid ${matchColor}40`,
        flexDirection: "row",
        gap: "12px"
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "1.8rem", fontWeight: 800, color: matchColor, lineHeight: 1 }}>
            {matchPercentage}%
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
            Match Score
          </span>
        </div>
        <div style={{ width: "1px", height: "30px", background: "var(--border-strong)" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-main)", lineHeight: 1 }}>
            {prediction.toFixed(1)} <span style={{ fontSize: "0.9rem", color: "var(--text-subtle)" }}>/ 5</span>
          </span>
          <span style={{ fontSize: "0.7rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "4px" }}>
            Predicted Rating
          </span>
        </div>
      </div>
      
      <div style={{ color: "var(--text-subtle)", fontSize: "0.85rem", maxWidth: "200px" }}>
        Based on User {userId}'s history using {activeEngine}
      </div>
    </div>
  );
}