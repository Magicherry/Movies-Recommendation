"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "../context/user-context";
import { getMovieRecommendationReasons, type RecommendationReason } from "../lib/api";
import type { MovieDetailContextMode } from "../lib/movie-detail-context";
import { getModelLoadStatusFromEvent } from "../lib/model-engine";
import WhyRecommendedSection from "./why-recommended-section";

type MovieDetailWhyRecommendedProps = {
  itemId: number;
  initialReasons: RecommendationReason[];
  mode: MovieDetailContextMode;
  contextUserId?: number;
  referenceItemId?: number;
};

function hasPersonalReason(reasons: RecommendationReason[]): boolean {
  return reasons.some((reason) => reason.source === "personal_match");
}

export default function MovieDetailWhyRecommended({
  itemId,
  initialReasons,
  mode,
  contextUserId,
  referenceItemId,
}: MovieDetailWhyRecommendedProps) {
  const { userId } = useUser();
  const resolvedUserId = contextUserId ?? userId;
  const [reasons, setReasons] = useState<RecommendationReason[]>(initialReasons);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    setReasons(initialReasons);
  }, [initialReasons, itemId, mode, contextUserId, referenceItemId]);

  useEffect(() => {
    if (mode === "neutral" || (mode === "similar" && !referenceItemId)) {
      return;
    }

    let disposed = false;

    async function refreshReasons() {
      const seq = ++fetchSeqRef.current;
      setIsRefreshing(true);
      try {
        const nextReasons = await getMovieRecommendationReasons(
          itemId,
          mode === "similar"
            ? { mode: "similar", referenceItemId }
            : { userId: resolvedUserId }
        );
        if (disposed || seq !== fetchSeqRef.current) return;
        setReasons(nextReasons.length > 0 ? nextReasons : initialReasons);
      } catch (error) {
        if (disposed || seq !== fetchSeqRef.current) return;
        console.error("Failed to refresh recommendation reasons", error);
        setReasons(initialReasons);
      } finally {
        if (disposed || seq !== fetchSeqRef.current) return;
        setIsRefreshing(false);
      }
    }

    refreshReasons();
    const handleEngineChanged = (event: Event) => {
      if (getModelLoadStatusFromEvent(event) !== "ready") return;
      refreshReasons();
    };
    window.addEventListener("streamx-engine-changed", handleEngineChanged);

    return () => {
      disposed = true;
      window.removeEventListener("streamx-engine-changed", handleEngineChanged);
    };
  }, [initialReasons, itemId, resolvedUserId, mode, referenceItemId]);

  if (mode === "neutral" || (mode === "similar" && !referenceItemId)) {
    return null;
  }

  const summary =
    mode === "similar"
      ? isRefreshing
        ? "Refreshing similarity signals."
        : "These signals explain why this title is grouped with the movie you opened."
      : isRefreshing
        ? `Refreshing signals for User ${resolvedUserId}.`
        : hasPersonalReason(reasons)
          ? `Signals are tailored for User ${resolvedUserId} and the active recommendation engine.`
          : `Recommendation signals for User ${resolvedUserId}.`;

  return (
    <WhyRecommendedSection
      reasons={reasons}
      eyebrow={mode === "similar" ? "Similarity Signals" : "Recommendation Signals"}
      title={mode === "similar" ? "Why Similar" : "Why Recommended"}
      summary={summary}
      currentItemId={itemId}
      detailContext={mode}
      detailUserId={resolvedUserId}
      detailSourceItemId={referenceItemId}
    />
  );
}
