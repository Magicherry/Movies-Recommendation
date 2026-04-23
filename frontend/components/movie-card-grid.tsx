"use client";

import { useCallback, memo, useState, useEffect } from "react";
import NextLink from "next/link";
import { useRouter, usePathname } from "next/navigation";
import MovieCardContextMenu from "./movie-card-context-menu";
import ScrapeMetadataModal from "./scrape-metadata-modal";
import ChangeImageModal from "./change-image-modal";
import { movieRefreshMetadata, displayMovieName } from "../lib/api";
import { buildMovieDetailHref, type MovieDetailContextMode, type MovieDetailLinkOptions } from "../lib/movie-detail-context";

export type MovieCardItem = {
  item_id: number;
  title: string;
  genres: string;
  score?: number;
  score_source?: "model" | "fallback_rating" | "fallback_similarity" | "fallback_behavior" | string;
  is_fallback_score?: boolean;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  tmdb_id?: number | string;
  scraped_title?: string;
};

type MovieCardGridProps = {
  title?: string;
  items: MovieCardItem[];
  scoreLabel?: string;
  emptyMessage?: string;
  rowMode?: boolean;
  detailContext?: MovieDetailContextMode;
  detailUserId?: number;
  detailSourceItemId?: number;
  rowResetKey?: string | number;
  onMovieHoverStart?: (movie: MovieCardItem) => void;
  onMovieHoverEnd?: (movie: MovieCardItem) => void;
  /** When set, this item gets the same zoom/overlay styling as hover (e.g. synced with hero carousel). */
  highlightedItemId?: number | null;
};

// Generates a deterministic gradient based on item_id
function getGradient(id: number) {
  const hue1 = (id * 137) % 360;
  const hue2 = (id * 97) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 60%, 15%), hsl(${hue2}, 60%, 5%))`;
}

function getMovieYear(title: string): string {
  return title.match(/\((\d{4})\)$/)?.[1] ?? "";
}

function getTopGenre(genres: string): string {
  if (!genres || genres === "(no genres listed)") return "";
  return genres.split("|")[0]?.trim() ?? "";
}

const MovieCard = memo(function MovieCard({
  movie,
  scoreLabel,
  showScore,
  isRefreshing = false,
  isFading = false,
  href,
}: {
  movie: MovieCardItem;
  scoreLabel: string;
  showScore: boolean;
  isRefreshing?: boolean;
  isFading?: boolean;
  href: string;
}) {
  const metaText = (() => {
    const year = getMovieYear(movie.title);
    const topGenre = getTopGenre(movie.genres);
    return year && topGenre ? `${year} · ${topGenre}` : year || topGenre;
  })();
  return (
    <NextLink href={href} className="poster-card">
      <div
        className="poster-bg"
        style={{ background: movie.poster_url ? "none" : getGradient(movie.item_id) }}
      >
        {movie.poster_url && (
          <img src={movie.poster_url} alt={displayMovieName(movie)} loading="lazy" className="poster-img" />
        )}
        <div className="poster-overlay" />
        <div className="poster-info-overlay">
          <div className="poster-genres">
            {movie.genres ? (
              movie.genres.split("|").map((g, idx) => (
                <span key={idx} className="genre-tag">{g}</span>
              ))
            ) : (
              <span className="genre-tag">No genres</span>
            )}
          </div>
          {showScore && typeof movie.score === "number" && (
            <span className="poster-score">
              {scoreLabel}: {(movie.score).toFixed(2)}
              {scoreLabel === "Rating" ? "/5.00" : scoreLabel === "Match" || scoreLabel === "Match Score" ? "/5.00" : scoreLabel === "Similarity" ? "/1.00" : ""}
              {movie.is_fallback_score ? <span className="score-fallback-flag">Fallback</span> : null}
            </span>
          )}
        </div>
      </div>
      <div className="poster-footer">
        <h3 className="poster-title">{displayMovieName(movie)}</h3>
        {metaText ? <span className="poster-year">{metaText}</span> : null}
      </div>
      {(isRefreshing || isFading) && (
        <div
          className={`poster-card-refresh-overlay${isFading ? " poster-card-refresh-overlay--fading" : ""}`}
          aria-hidden="true"
        >
          <span className="poster-card-refresh-label">
            {isRefreshing ? "Refreshing..." : "Done"}
          </span>
          {isRefreshing && (
            <div className="poster-card-refresh-bar">
              <div className="poster-card-refresh-bar-fill" />
            </div>
          )}
        </div>
      )}
    </NextLink>
  );
});

import ScrollableRow from "./scrollable-row";

type ContextMenuState = { x: number; y: number; movie: MovieCardItem } | null;

function useShowCardScores(): boolean {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("streamx-show-card-scores") !== "false";
  });
  useEffect(() => {
    const handler = () => setShow(localStorage.getItem("streamx-show-card-scores") !== "false");
    window.addEventListener("streamx-settings-changed", handler);
    return () => window.removeEventListener("streamx-settings-changed", handler);
  }, []);
  return show;
}

export default function MovieCardGrid({
  title,
  items,
  scoreLabel = "Match",
  emptyMessage = "No movies to display.",
  rowMode = false,
  detailContext = "neutral",
  detailUserId,
  detailSourceItemId,
  rowResetKey,
  onMovieHoverStart,
  onMovieHoverEnd,
  highlightedItemId = null,
}: MovieCardGridProps) {
  const router = useRouter();
  const pathname = usePathname();
  const showCardScores = useShowCardScores();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [scrapeModalMovie, setScrapeModalMovie] = useState<MovieCardItem | null>(null);
  const [imageModalMovie, setImageModalMovie] = useState<MovieCardItem | null>(null);
  const [refreshingItemId, setRefreshingItemId] = useState<number | null>(null);
  const [fadingItemId, setFadingItemId] = useState<number | null>(null);
  const [imageOverrides, setImageOverrides] = useState<Record<number, { poster_url: string; backdrop_url: string }>>({});

  const openContextMenuAt = useCallback((movie: MovieCardItem, x: number, y: number) => {
    setContextMenu({ x: Math.round(x), y: Math.round(y), movie });
  }, []);

  const openContextMenuFromTrigger = useCallback((movie: MovieCardItem, triggerEl: HTMLElement) => {
    const rect = triggerEl.getBoundingClientRect();
    openContextMenuAt(movie, rect.right - 6, rect.bottom + 6);
  }, [openContextMenuAt]);

  const withImageOverrides = useCallback((movie: MovieCardItem): MovieCardItem => {
    const override = imageOverrides[movie.item_id];
    return override ? { ...movie, ...override } : movie;
  }, [imageOverrides]);

  const refreshAndPreserveScroll = useCallback(() => {
    if (typeof window === "undefined") {
      router.refresh();
      return;
    }
    const x = window.scrollX;
    const y = window.scrollY;
    router.refresh();
    // App Router refresh can briefly reset layout; restore twice for stability.
    requestAnimationFrame(() => window.scrollTo(x, y));
    window.setTimeout(() => window.scrollTo(x, y), 120);
  }, [router]);

  const handleRefreshMetadata = useCallback(async (itemId: number) => {
    setContextMenu(null);
    setRefreshingItemId(itemId);
    try {
      await movieRefreshMetadata(itemId);
      refreshAndPreserveScroll();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("streamx-metadata-updated"));
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshingItemId(null);
      setFadingItemId(itemId);
      window.setTimeout(() => setFadingItemId(null), 220);
    }
  }, [refreshAndPreserveScroll]);

  const handleModalSuccess = useCallback((payload?: { itemId: number; posterUrl: string; backdropUrl: string }) => {
    if (payload) {
      setImageOverrides((prev) => ({
        ...prev,
        [payload.itemId]: {
          poster_url: payload.posterUrl,
          backdrop_url: payload.backdropUrl,
        },
      }));
      if (imageModalMovie?.item_id === payload.itemId) {
        setImageModalMovie((prev) => (prev ? { ...prev, poster_url: payload.posterUrl, backdrop_url: payload.backdropUrl } : prev));
      }
    }
    refreshAndPreserveScroll();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("streamx-metadata-updated"));
    }
  }, [refreshAndPreserveScroll, imageModalMovie?.item_id]);

  const handleCollectionClick = useCallback(() => {
    if (typeof window !== "undefined") {
      const itemsForCollection = items.map(withImageOverrides);
      const detailLinkOptions: MovieDetailLinkOptions =
        detailContext === "recommended"
          ? { context: detailContext, userId: detailUserId }
          : detailContext === "similar"
            ? { context: detailContext, sourceItemId: detailSourceItemId }
            : { context: "neutral" };
      sessionStorage.setItem(
        "collectionData",
        JSON.stringify({ title, items: itemsForCollection, scoreLabel, detailLinkOptions })
      );
      let fromPath = "/";
      if (pathname.startsWith("/movies")) fromPath = "/movies";
      else if (pathname.startsWith("/users")) fromPath = "/users";
      router.push(`/collection?from=${fromPath}`);
    }
  }, [title, items, scoreLabel, pathname, router, withImageOverrides, detailContext, detailUserId, detailSourceItemId]);

  if (items.length === 0) {
    return <p style={{ color: "var(--text-subtle)", padding: "0 4vw" }}>{emptyMessage}</p>;
  }

  const renderCardWrapper = (movie: MovieCardItem) => {
    const mergedMovie = withImageOverrides(movie);
    const isMenuOpen = contextMenu?.movie.item_id === movie.item_id;
    const isHeroSynced = highlightedItemId != null && highlightedItemId === movie.item_id;
    const href = buildMovieDetailHref(mergedMovie.item_id, {
      context: detailContext,
      userId: detailUserId,
      sourceItemId: detailSourceItemId,
    });
    return (
      <div
        key={movie.item_id}
        className={`movie-card-wrapper${isMenuOpen ? " movie-card-wrapper--menu-open" : ""}${isHeroSynced ? " movie-card-wrapper--hero-sync" : ""}`}
        onMouseEnter={() => onMovieHoverStart?.(mergedMovie)}
        onMouseLeave={() => onMovieHoverEnd?.(mergedMovie)}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextMenuAt(mergedMovie, e.clientX, e.clientY);
        }}
      >
        <button
          type="button"
          className="movie-context-menu-trigger movie-context-menu-trigger--card"
          aria-label={`Open actions for ${displayMovieName(mergedMovie)}`}
          title="Movie actions"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isMenuOpen) {
              setContextMenu(null);
              return;
            }
            openContextMenuFromTrigger(mergedMovie, e.currentTarget);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="5" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="12" cy="19" r="1" />
          </svg>
        </button>
        <MovieCard
          movie={mergedMovie}
          scoreLabel={scoreLabel}
          showScore={showCardScores && typeof movie.score === "number"}
          isRefreshing={refreshingItemId === movie.item_id}
          isFading={fadingItemId === movie.item_id}
          href={href}
        />
      </div>
    );
  };

  if (rowMode) {
    return (
      <>
        <ScrollableRow
          title={title}
          resetKey={rowResetKey}
          onHeaderClick={handleCollectionClick}
          headerTitle={title ? `View all in ${title}` : undefined}
          headerIcon={
            title ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)', transform: 'translateY(1px)' }}>
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            ) : undefined
          }
        >
          {items.map((movie) => renderCardWrapper(movie))}
        </ScrollableRow>
        {contextMenu && (
          <MovieCardContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            movie={contextMenu.movie}
            onClose={() => setContextMenu(null)}
            onScrapeMetadata={() => setScrapeModalMovie(contextMenu.movie)}
            onRefreshMetadata={() => handleRefreshMetadata(contextMenu.movie.item_id)}
            onChangeImage={() => setImageModalMovie(contextMenu.movie)}
          />
        )}
        {scrapeModalMovie && (
          <ScrapeMetadataModal
            movie={scrapeModalMovie}
            onClose={() => setScrapeModalMovie(null)}
            onSuccess={handleModalSuccess}
          />
        )}
        {imageModalMovie && (
          <ChangeImageModal
            movie={imageModalMovie}
            onClose={() => setImageModalMovie(null)}
            onSuccess={handleModalSuccess}
          />
        )}
      </>
    );
  }

  return (
    <>
    <div className="card-grid">
      {items.map((movie) => renderCardWrapper(movie))}
    </div>
      {contextMenu && (
        <MovieCardContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          movie={contextMenu.movie}
          onClose={() => setContextMenu(null)}
          onScrapeMetadata={() => setScrapeModalMovie(contextMenu.movie)}
          onRefreshMetadata={() => handleRefreshMetadata(contextMenu.movie.item_id)}
          onChangeImage={() => setImageModalMovie(contextMenu.movie)}
        />
      )}
      {scrapeModalMovie && (
        <ScrapeMetadataModal
          movie={scrapeModalMovie}
          onClose={() => setScrapeModalMovie(null)}
          onSuccess={handleModalSuccess}
        />
      )}
      {imageModalMovie && (
        <ChangeImageModal
          movie={imageModalMovie}
          onClose={() => setImageModalMovie(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
}