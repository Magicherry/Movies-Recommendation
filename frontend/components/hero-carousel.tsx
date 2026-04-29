"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";

function useShowMovieLogos(): boolean {
  const [show, setShow] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("streamx-show-movie-logos") !== "false";
  });
  useEffect(() => {
    const handler = () => setShow(localStorage.getItem("streamx-show-movie-logos") !== "false");
    window.addEventListener("streamx-settings-changed", handler);
    return () => window.removeEventListener("streamx-settings-changed", handler);
  }, []);
  return show;
}
import Link from "next/link";
import { Movie, displayMovieName } from "../lib/api";
import { buildMovieDetailHref } from "../lib/movie-detail-context";

export type HeroCarouselSource = "personalized" | "trending";

const HERO_INDICATOR_VISIBLE_SLOTS = 7;

function heroBackdropGradient(itemId: number): string {
  const hue1 = (itemId * 137) % 360;
  const hue2 = (itemId * 97) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 40%, 25%), hsl(${hue2}, 60%, 10%))`;
}

function heroBackdropStyle(movie: Movie): CSSProperties {
  return {
    backgroundImage: movie.backdrop_url ? `url('${movie.backdrop_url}')` : heroBackdropGradient(movie.item_id),
    backgroundSize: "cover",
    backgroundPosition: "top center",
    backgroundRepeat: "no-repeat",
  };
}

/** Opacity cross-fade only — do not transition `background-image` (it causes warped frames with `cover`). */
function HeroBackdropCrossfade({ movie }: { movie: Movie }) {
  const featuredKey = `${movie.item_id}:${movie.backdrop_url ?? ""}`;
  const [bgLayer0, setBgLayer0] = useState<Movie>(() => movie);
  const [bgLayer1, setBgLayer1] = useState<Movie>(() => movie);
  const [activeBgLayer, setActiveBgLayer] = useState<0 | 1>(0);
  const activeBgLayerRef = useRef<0 | 1>(0);
  const heroBgFeaturedKeyRef = useRef<string | null>(null);
  const heroBgLoadIdRef = useRef(0);

  useEffect(() => {
    if (heroBgFeaturedKeyRef.current === null) {
      heroBgFeaturedKeyRef.current = featuredKey;
      setBgLayer0(movie);
      setBgLayer1(movie);
      return;
    }
    if (heroBgFeaturedKeyRef.current === featuredKey) return;
    heroBgFeaturedKeyRef.current = featuredKey;

    const inactive = (1 - activeBgLayerRef.current) as 0 | 1;
    const loadId = ++heroBgLoadIdRef.current;

    const apply = () => {
      if (loadId !== heroBgLoadIdRef.current) return;
      if (inactive === 0) setBgLayer0(movie);
      else setBgLayer1(movie);
      activeBgLayerRef.current = inactive;
      setActiveBgLayer(inactive);
    };

    if (movie.backdrop_url) {
      const img = new Image();
      img.onload = apply;
      img.onerror = apply;
      img.src = movie.backdrop_url;
    } else {
      apply();
    }
  }, [featuredKey, movie]);

  return (
    <div className="hero-banner-bg-stack" aria-hidden>
      <div
        className="hero-banner-bg-fade"
        style={{
          ...heroBackdropStyle(bgLayer0),
          opacity: activeBgLayer === 0 ? 1 : 0,
          zIndex: activeBgLayer === 0 ? 1 : 0,
        }}
      />
      <div
        className="hero-banner-bg-fade"
        style={{
          ...heroBackdropStyle(bgLayer1),
          opacity: activeBgLayer === 1 ? 1 : 0,
          zIndex: activeBgLayer === 1 ? 1 : 0,
        }}
      />
    </div>
  );
}

function getIndicatorTrackOffset(total: number, activeIndex: number, visibleSlots: number): number {
  const safeActiveIndex = Math.max(0, Math.min(activeIndex, total - 1));
  const centerSlot = Math.floor(visibleSlots / 2);
  const maxOffset = Math.max(0, total - visibleSlots);
  return Math.max(0, Math.min(safeActiveIndex - centerSlot, maxOffset));
}

type HeroCarouselProps = {
  movies: Movie[];
  source: HeroCarouselSource;
  sourceNote?: string;
  autoAdvanceMs?: number;
  onExploreMore?: () => void;
  detailUserId?: number;
  previewMovie?: Movie | null;
  /** Called when the visible hero movie changes (auto-advance, arrows, indicators, or preview sync). */
  onFeaturedMovieChange?: (movie: Movie) => void;
};

export default function HeroCarousel({
  movies,
  source,
  sourceNote,
  autoAdvanceMs = 30000,
  onExploreMore,
  detailUserId,
  previewMovie = null,
  onFeaturedMovieChange,
}: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const showLogos = useShowMovieLogos();
  const intervalMs = Math.min(120000, Math.max(5000, autoAdvanceMs));
  const isPreviewActive = Boolean(previewMovie);

  useEffect(() => {
    if (currentIndex >= movies.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, movies.length]);

  useEffect(() => {
    if (!previewMovie) return;
    const nextIndex = movies.findIndex((movie) => movie.item_id === previewMovie.item_id);
    if (nextIndex >= 0 && nextIndex !== currentIndex) {
      setCurrentIndex(nextIndex);
    }
  }, [previewMovie, movies, currentIndex]);

  useEffect(() => {
    if (isPaused || isPreviewActive || movies.length < 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % movies.length);
    }, intervalMs);
    return () => clearInterval(interval);
  }, [isPaused, isPreviewActive, movies.length, intervalMs, currentIndex]);

  useEffect(() => {
    if (!onFeaturedMovieChange || !movies || movies.length === 0) return;
    const safeIndex = Math.max(0, Math.min(currentIndex, movies.length - 1));
    const next = previewMovie ?? movies[safeIndex];
    if (next) onFeaturedMovieChange(next);
  }, [onFeaturedMovieChange, previewMovie, movies, currentIndex, movies]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? movies.length - 1 : prev - 1));
  }, [movies.length]);
  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % movies.length);
  }, [movies.length]);
  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  if (!movies || movies.length === 0) return null;

  const featured = previewMovie ?? movies[currentIndex];
  const previewIndex = previewMovie ? movies.findIndex((movie) => movie.item_id === previewMovie.item_id) : -1;
  const activeIndicatorIndex = previewIndex >= 0 ? previewIndex : currentIndex;
  const visibleIndicatorSlots = Math.min(movies.length, HERO_INDICATOR_VISIBLE_SLOTS);
  const indicatorTrackOffset = getIndicatorTrackOffset(movies.length, activeIndicatorIndex, visibleIndicatorSlots);
  const maxIndicatorTrackOffset = Math.max(0, movies.length - visibleIndicatorSlots);
  const isIndicatorTrackAtStart = indicatorTrackOffset === 0;
  const isIndicatorTrackAtEnd = indicatorTrackOffset === maxIndicatorTrackOffset;
  const indicatorViewportStyle = {
    "--visible-slots": visibleIndicatorSlots,
    "--track-offset": indicatorTrackOffset,
    "--hero-indicator-edge-safe-left": isIndicatorTrackAtStart ? "10px" : "0px",
    "--hero-indicator-edge-safe-right": isIndicatorTrackAtEnd ? "18px" : "0px",
    "--hero-indicator-mask-left": isIndicatorTrackAtStart ? "0px" : "10px",
    "--hero-indicator-mask-right": isIndicatorTrackAtEnd ? "0px" : "6px",
  } as CSSProperties;
  const sourceLabel = source === "personalized" ? "Personalized Picks" : "Trending Picks";
  const featuredName = displayMovieName(featured);
  const detailHref = buildMovieDetailHref(featured.item_id, {
    context: source === "personalized" ? "recommended" : "neutral",
    userId: source === "personalized" ? detailUserId : undefined,
  });

  return (
    <div className="hero-banner">
      <HeroBackdropCrossfade movie={featured} />
      <div className="hero-banner-gradient" />

      {/* Navigation Arrows */}
      <button className="hero-arrow hero-arrow-left" onClick={goPrev} aria-label="Previous Slide">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      
      <button className="hero-arrow hero-arrow-right" onClick={goNext} aria-label="Next Slide">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>

      {/* Pause/Play Button */}
      <button
        className="hero-carousel-toggle"
        onClick={togglePause}
        aria-label={isPaused ? "Play Carousel" : "Pause Carousel"}
      >
        {isPaused ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
          </svg>
        )}
      </button>

      <div className="hero-content" style={{ animation: "fadeIn 0.5s ease" }} key={featured.item_id}>
        <div className="hero-source-row">
          <span className={`hero-source-badge ${source}`}>
            {sourceLabel}
          </span>
          {sourceNote ? <span className="hero-source-note">{sourceNote}</span> : null}
        </div>
        <div className={`hero-title-block${showLogos && featured.logo_url ? " hero-title-block--carousel" : ""}`}>
          {showLogos && featured.logo_url ? (
            <img className="hero-movie-logo" src={featured.logo_url} alt={`${featuredName} logo`} />
          ) : (
            <h1 className="hero-title">{featuredName}</h1>
          )}
        </div>
        <div className="hero-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: 'white' }}>{featured.title.match(/\((\d{4})\)$/)?.[1] || "Movie"}</span>
          <span>•</span>
          <span>{featured.genres ? featured.genres.replace(/\|/g, " • ") : "Drama"}</span>
        </div>
        <p className="hero-desc">
          {featured.overview || "Experience the magic of cinema with our personalized recommendations. Powered by advanced Matrix Factorization algorithms to find exactly what you want to watch."}
        </p>
        <div className="hero-actions">
          <Link href={detailHref} className="btn-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            View Details
          </Link>
          {onExploreMore ? (
            <button onClick={onExploreMore} className="btn-secondary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Explore More
            </button>
          ) : (
            <Link href="/movies" className="btn-secondary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
              </svg>
              Explore More
            </Link>
          )}
        </div>
      </div>
      
      {/* Indicators */}
      <div className="hero-carousel-indicators">
        <div className="hero-carousel-indicators-viewport" style={indicatorViewportStyle}>
          <div className="hero-carousel-indicators-track">
            {movies.map((_, idx) => (
              <div key={idx} className="hero-indicator-slot">
                <button
                  className={`hero-indicator ${idx === activeIndicatorIndex ? "active" : ""}`}
                  onClick={() => setCurrentIndex(idx)}
                  aria-label={`Go to slide ${idx + 1}`}
                  aria-current={idx === activeIndicatorIndex ? "true" : undefined}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}