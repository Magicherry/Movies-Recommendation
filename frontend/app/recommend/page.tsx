"use client";

import { useState } from "react";
import { getRecommendations, Recommendation } from "../../lib/api";
import MovieCardGrid from "../../components/movie-card-grid";

export default function RecommendPage() {
  const [userId, setUserId] = useState("1");
  const [activeUserId, setActiveUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Recommendation[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = Number(userId);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 610) {
      setError("Please enter a valid User ID between 1 and 610.");
      setItems([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const recs = await getRecommendations(parsed);
      setItems(recs);
      setActiveUserId(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations.");
      setItems([]);
      setActiveUserId(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="recommend-hero">
        <h1>Who's watching?</h1>
        <p>Enter a User ID to get a personalized feed of top 10 movie recommendations just for them, powered by Matrix Factorization.</p>
        
        <form onSubmit={onSubmit} className="search-box">
          <input
            type="number"
            className="search-input"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter User ID (e.g. 1)"
            min="1"
            max="610"
          />
          <button type="submit" className="btn-search" disabled={loading}>
            {loading ? "Loading..." : "Explore"}
          </button>
        </form>

        <div className="status-row">
          {loading && <span>Crunching data...</span>}
          {!loading && items.length > 0 && activeUserId !== null && <span>We found {items.length} matches for User {activeUserId}</span>}
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>

      {items.length > 0 && (
        <section className="content-padding">
          <MovieCardGrid
            title="Top Picks for You"
            items={items}
            scoreLabel="Match Score"
            emptyMessage=""
            rowMode={true}
            detailContext="recommended"
            detailUserId={activeUserId ?? undefined}
          />
        </section>
      )}
    </>
  );
}