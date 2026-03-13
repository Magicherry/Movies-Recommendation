"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { MovieCardItem } from "./movie-card-grid";

const PADDING = 8;

const ICON_SIZE = 18;

/** Scrape/search icon (magnifying glass). */
function IconScrape() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/** Refresh/sync icon (circular arrows). */
function IconRefresh() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21h5v-5" />
    </svg>
  );
}

/** Image/picture icon. */
function IconImage() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

type MovieCardContextMenuProps = {
  x: number;
  y: number;
  movie: MovieCardItem;
  onClose: () => void;
  onScrapeMetadata: () => void;
  onRefreshMetadata: () => void;
  onChangeImage: () => void;
};

export default function MovieCardContextMenu({
  x,
  y,
  onClose,
  onScrapeMetadata,
  onRefreshMetadata,
  onChangeImage,
}: MovieCardContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  const updatePosition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width + PADDING > vw) left = vw - rect.width - PADDING;
    if (top + rect.height + PADDING > vh) top = vh - rect.height - PADDING;
    if (left < PADDING) left = PADDING;
    if (top < PADDING) top = PADDING;
    setPosition({ left, top });
  }, [x, y]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleScroll = () => onClose();
    const handleResize = () => updatePosition();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("click", handleClick, true);
    document.addEventListener("contextmenu", handleContextMenu, true);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("resize", handleResize);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("contextmenu", handleContextMenu, true);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("resize", handleResize);
    };
  }, [onClose, updatePosition]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const menu = (
    <div
      ref={ref}
      className="movie-context-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      tabIndex={-1}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="movie-context-menu-item"
        role="menuitem"
        onClick={() => {
          onScrapeMetadata();
          onClose();
        }}
      >
        <span className="movie-context-menu-item-icon"><IconScrape /></span>
        <span>Scrape metadata</span>
      </button>
      <button
        type="button"
        className="movie-context-menu-item"
        role="menuitem"
        onClick={() => {
          onRefreshMetadata();
          onClose();
        }}
      >
        <span className="movie-context-menu-item-icon"><IconRefresh /></span>
        <span>Refresh metadata</span>
      </button>
      <button
        type="button"
        className="movie-context-menu-item"
        role="menuitem"
        onClick={() => {
          onChangeImage();
          onClose();
        }}
      >
        <span className="movie-context-menu-item-icon"><IconImage /></span>
        <span>Change image</span>
      </button>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(menu, document.body);
  }
  return menu;
}
