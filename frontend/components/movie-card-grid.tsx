"use client";

import { useRef, useCallback, memo, useState, useEffect } from "react";
import NextLink from "next/link";
import { useRouter, usePathname } from "next/navigation";
import MovieCardContextMenu from "./movie-card-context-menu";
import ScrapeMetadataModal from "./scrape-metadata-modal";
import ChangeImageModal from "./change-image-modal";
import { movieRefreshMetadata, displayMovieName } from "../lib/api";

export type MovieCardItem = {
  item_id: number;
  title: string;
  genres: string;
  score?: number;
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
}: {
  movie: MovieCardItem;
  scoreLabel: string;
  showScore: boolean;
  isRefreshing?: boolean;
  isFading?: boolean;
}) {
  const metaText = (() => {
    const year = getMovieYear(movie.title);
    const topGenre = getTopGenre(movie.genres);
    return year && topGenre ? `${year} · ${topGenre}` : year || topGenre;
  })();
  return (
    <NextLink href={`/movies/${movie.item_id}`} className="poster-card">
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

type ContextMenuState = { x: number; y: number; movie: MovieCardItem } | null;

export default function MovieCardGrid({
  title,
  items,
  scoreLabel = "Match",
  emptyMessage = "No movies to display.",
  rowMode = false
}: MovieCardGridProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [scrapeModalMovie, setScrapeModalMovie] = useState<MovieCardItem | null>(null);
  const [imageModalMovie, setImageModalMovie] = useState<MovieCardItem | null>(null);
  const [refreshingItemId, setRefreshingItemId] = useState<number | null>(null);
  const [fadingItemId, setFadingItemId] = useState<number | null>(null);
  const [imageOverrides, setImageOverrides] = useState<Record<number, { poster_url: string; backdrop_url: string }>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
      sessionStorage.setItem("collectionData", JSON.stringify({ title, items: itemsForCollection, scoreLabel }));
      let fromPath = "/";
      if (pathname.startsWith("/movies")) fromPath = "/movies";
      else if (pathname.startsWith("/users")) fromPath = "/users";
      router.push(`/collection?from=${fromPath}`);
    }
  }, [title, items, scoreLabel, pathname, router, withImageOverrides]);

  const scrollLeft = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: -rowRef.current.clientWidth * 0.8, behavior: "smooth" });
    }
  }, []);
  const scrollRight = useCallback(() => {
    if (rowRef.current) {
      rowRef.current.scrollBy({ left: rowRef.current.clientWidth * 0.8, behavior: "smooth" });
    }
  }, []);

  const updateScrollState = useCallback(() => {
    const row = rowRef.current;
    if (!row) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
    const epsilon = 1;
    setCanScrollLeft(row.scrollLeft > epsilon);
    setCanScrollRight(row.scrollLeft < maxScrollLeft - epsilon);
  }, []);

  useEffect(() => {
    if (!rowMode) return;
    const row = rowRef.current;
    if (!row) return;

    const onRecalculate = () => updateScrollState();
    row.addEventListener("scroll", onRecalculate, { passive: true });
    window.addEventListener("resize", onRecalculate);

    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(onRecalculate)
      : null;
    resizeObserver?.observe(row);

    const rafId = window.requestAnimationFrame(onRecalculate);

    return () => {
      row.removeEventListener("scroll", onRecalculate);
      window.removeEventListener("resize", onRecalculate);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, [rowMode, items.length, updateScrollState]);

  if (items.length === 0) {
    return <p style={{ color: "var(--text-subtle)", padding: "0 4vw" }}>{emptyMessage}</p>;
  }

  if (rowMode) {
    return (
      <>
      <div className="card-row-section">
        {title && (
          <div className="row-header-container">
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: 0.9, transition: 'opacity 0.2s' }}
              onClick={handleCollectionClick}
              title={`View all in ${title}`}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.9'}
            >
              <h2 className="row-header">{title}</h2>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-subtle)', transform: 'translateY(1px)' }}>
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
            <div className="row-controls">
              <button className="row-scroll-btn" onClick={scrollLeft} aria-label="Scroll left" disabled={!canScrollLeft}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button className="row-scroll-btn" onClick={scrollRight} aria-label="Scroll right" disabled={!canScrollRight}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="card-row-container">
          <div className="card-row" ref={rowRef}>
            {items.map((movie) => {
              const mergedMovie = withImageOverrides(movie);
              return (
              <div
                key={movie.item_id}
                className="movie-card-wrapper"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({ x: e.clientX, y: e.clientY, movie: mergedMovie });
                }}
                style={{ position: "relative" }}
              >
                <MovieCard
                  movie={mergedMovie}
                  scoreLabel={scoreLabel}
                  showScore={typeof movie.score === "number"}
                  isRefreshing={refreshingItemId === movie.item_id}
                  isFading={fadingItemId === movie.item_id}
                />
              </div>
            )})}
          </div>
        </div>
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

  return (
    <>
    <div className="card-grid">
      {items.map((movie) => {
        const mergedMovie = withImageOverrides(movie);
        return (
        <div
          key={movie.item_id}
          className="movie-card-wrapper"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, movie: mergedMovie });
          }}
          style={{ position: "relative" }}
        >
          <MovieCard
            movie={mergedMovie}
            scoreLabel={scoreLabel}
            showScore={typeof movie.score === "number"}
            isRefreshing={refreshingItemId === movie.item_id}
            isFading={fadingItemId === movie.item_id}
          />
        </div>
      )})}
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