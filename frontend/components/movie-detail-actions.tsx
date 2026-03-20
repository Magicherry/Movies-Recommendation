"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import MovieCardContextMenu from "./movie-card-context-menu";
import ScrapeMetadataModal from "./scrape-metadata-modal";
import ChangeImageModal from "./change-image-modal";
import { movieRefreshMetadata } from "../lib/api";
import type { MovieCardItem } from "./movie-card-grid";

type MovieDetailActionsProps = {
  movie: MovieCardItem;
};

export default function MovieDetailActions({ movie }: MovieDetailActionsProps) {
  const router = useRouter();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [scrapeModalOpen, setScrapeModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Stop propagation for the button click so it doesn't trigger other things
  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (contextMenu) {
      setContextMenu(null);
    } else {
      const rect = e.currentTarget.getBoundingClientRect();
      setContextMenu({ x: rect.right, y: rect.bottom + 8 });
    }
  };

  const handleRefreshMetadata = useCallback(async () => {
    setContextMenu(null);
    setIsRefreshing(true);
    try {
      await movieRefreshMetadata(movie.item_id);
      router.refresh();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("streamx-metadata-updated"));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setIsRefreshing(false);
    }
  }, [movie.item_id, router]);

  const handleModalSuccess = useCallback(() => {
    router.refresh();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("streamx-metadata-updated"));
    }
  }, [router]);

  return (
    <>
      <button
        type="button"
        className="btn-back movie-context-menu-trigger"
        style={{
          left: 'auto',
          right: '4vw',
          top: '110px'
        }}
        onClick={handleButtonClick}
        title="More options"
      >
        {isRefreshing ? (
          <div style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: 'none' }}>
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        )}
      </button>

      {contextMenu && (
        <MovieCardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          movie={movie}
          onClose={() => setContextMenu(null)}
          onScrapeMetadata={() => {
            setContextMenu(null);
            setScrapeModalOpen(true);
          }}
          onRefreshMetadata={handleRefreshMetadata}
          onChangeImage={() => {
            setContextMenu(null);
            setImageModalOpen(true);
          }}
        />
      )}

      {scrapeModalOpen && (
        <ScrapeMetadataModal
          movie={movie}
          onClose={() => setScrapeModalOpen(false)}
          onSuccess={() => {
            setScrapeModalOpen(false);
            handleModalSuccess();
          }}
        />
      )}

      {imageModalOpen && (
        <ChangeImageModal
          movie={movie}
          onClose={() => setImageModalOpen(false)}
          onSuccess={() => {
            setImageModalOpen(false);
            handleModalSuccess();
          }}
        />
      )}
    </>
  );
}
