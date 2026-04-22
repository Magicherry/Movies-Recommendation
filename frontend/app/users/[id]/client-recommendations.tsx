"use client";

import { useEffect, useState } from "react";
import MovieCardGrid from "../../../components/movie-card-grid";

export default function ClientRecommendations({ initialRecommendations, userId }: { initialRecommendations: any[], userId: number }) {
  const [recs, setRecs] = useState(initialRecommendations);
  const [count, setCount] = useState(10);

  useEffect(() => {
    const savedCount = localStorage.getItem("streamx-rec-count");
    if (savedCount) {
      const parsed = parseInt(savedCount, 10);
      setCount(parsed);
      setRecs(initialRecommendations.slice(0, parsed));
    } else {
      setRecs(initialRecommendations.slice(0, 10));
    }
  }, [initialRecommendations]);

  return (
    <MovieCardGrid
      title={`Recommended for User ${userId}`}
      items={recs}
      scoreLabel="Match Score"
      emptyMessage="No recommendations generated for this user."
      rowMode={true}
      detailContext="recommended"
      detailUserId={userId}
    />
  );
}
