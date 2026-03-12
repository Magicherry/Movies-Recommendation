"use client";

import { useMemo } from "react";
import MovieCardGrid, { MovieCardItem } from "./movie-card-grid";

const DEFAULT_COUNT = 15;
const MIN_COL = 5;
const MAX_COL = 100;

const STORAGE_KEYS: Record<string, string> = {
  "more-like-this": "streamx-more-like-this-count",
};

function getLimit(storageKey: string): number {
  if (typeof window === "undefined") return DEFAULT_COUNT;
  const key = STORAGE_KEYS[storageKey] || storageKey;
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
};

/** Renders a movie grid with items limited by the user's setting for this collection. */
export default function CollectionLimitGrid(props: CollectionLimitGridProps) {
  const { settingKey, ...gridProps } = props;
  const limit = useMemo(() => getLimit(settingKey), [settingKey]);
  const sliced = useMemo(() => props.items.slice(0, limit), [props.items, limit]);
  return (
    <MovieCardGrid
      title={gridProps.title}
      items={sliced}
      scoreLabel={gridProps.scoreLabel}
      emptyMessage={gridProps.emptyMessage}
      rowMode={gridProps.rowMode}
    />
  );
}
