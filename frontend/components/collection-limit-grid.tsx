"use client";

import { useEffect, useMemo, useState } from "react";
import MovieCardGrid, { MovieCardItem } from "./movie-card-grid";
import type { MovieDetailContextMode } from "../lib/movie-detail-context";

const DEFAULT_COUNT = 15;
const MIN_COL = 5;
const MAX_COL = 100;

const STORAGE_KEYS: Record<string, string> = {
  "more-like-this": "streamx-more-like-this-count",
};

function resolveStorageKey(settingKey: string): string {
  if (settingKey.startsWith("person-")) {
    // Person detail collections use a dedicated display-count setting.
    return "streamx-person-movies-count";
  }
  return STORAGE_KEYS[settingKey] || settingKey;
}

function getLimit(storageKey: string): number {
  if (typeof window === "undefined") return DEFAULT_COUNT;
  const key = resolveStorageKey(storageKey);
  const saved = localStorage.getItem(key);
  const val = saved ? parseInt(saved, 10) : DEFAULT_COUNT;
  return Math.min(MAX_COL, Math.max(MIN_COL, isNaN(val) ? DEFAULT_COUNT : val));
}

type CollectionLimitGridProps = {
  /** Which setting to use, e.g. "more-like-this". */
  settingKey: string;
  title?: string;
  items: MovieCardItem[];
  scoreLabel?: string;
  emptyMessage?: string;
  rowMode?: boolean;
  detailContext?: MovieDetailContextMode;
  detailUserId?: number;
  detailSourceItemId?: number;
};

/** Renders a movie grid with items limited by the user's setting for this collection. */
export default function CollectionLimitGrid(props: CollectionLimitGridProps) {
  const { settingKey, ...gridProps } = props;
  const [limit, setLimit] = useState<number>(() => getLimit(settingKey));

  useEffect(() => {
    setLimit(getLimit(settingKey));
  }, [settingKey]);

  useEffect(() => {
    const handler = () => setLimit(getLimit(settingKey));
    window.addEventListener("streamx-settings-changed", handler);
    return () => window.removeEventListener("streamx-settings-changed", handler);
  }, [settingKey]);

  const sliced = useMemo(() => props.items.slice(0, limit), [props.items, limit]);
  return (
    <MovieCardGrid
      title={gridProps.title}
      items={sliced}
      scoreLabel={gridProps.scoreLabel}
      emptyMessage={gridProps.emptyMessage}
      rowMode={gridProps.rowMode}
      detailContext={gridProps.detailContext}
      detailUserId={gridProps.detailUserId}
      detailSourceItemId={gridProps.detailSourceItemId}
    />
  );
}
