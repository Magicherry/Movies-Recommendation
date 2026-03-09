"use client";

import { useRef } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";

export type MovieCardItem = {
  item_id: number;
  title: string;
  genres: string;
  score?: number;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
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

export default function MovieCardGrid({
  title,
  items,
  scoreLabel = "Match",
  emptyMessage = "No movies to display.",
  rowMode = false
}: MovieCardGridProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const handleCollectionClick = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('collectionData', JSON.stringify({ title, items, scoreLabel }));
      router.push('/collection');
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const { clientWidth } = rowRef.current;
      const scrollAmount = direction === 'left' ? -clientWidth * 0.8 : clientWidth * 0.8;
      rowRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  if (items.length === 0) {
    return <p style={{ color: "var(--text-subtle)", padding: "0 4vw" }}>{emptyMessage}</p>;
  }

  if (rowMode) {
    return (
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
              <button 
                className="row-scroll-btn" 
                onClick={() => scroll('left')}
                aria-label="Scroll left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button 
                className="row-scroll-btn" 
                onClick={() => scroll('right')}
                aria-label="Scroll right"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>
        )}
        <div className="card-row" ref={rowRef}>
          {items.map((movie) => (
            <NextLink
              key={movie.item_id}
              href={`/movies/${movie.item_id}`}
              className="poster-card"
            >
              <div
                className="poster-bg"
                style={{ 
                  background: movie.poster_url ? 'none' : getGradient(movie.item_id)
                }}
              >
                {movie.poster_url && (
                  <img 
                    src={movie.poster_url} 
                    alt={movie.title} 
                    loading="lazy"
                    className="poster-img"
                  />
                )}
                <div className="poster-overlay" />
                <div className="poster-info-overlay">
                  <div className="poster-genres">
                    {movie.genres ? (
                      movie.genres.split("|").map((g, idx) => (
                        <span key={idx} className="genre-tag">
                          {g}
                        </span>
                      ))
                    ) : (
                      <span className="genre-tag">No genres</span>
                    )}
                  </div>
                  {typeof movie.score === "number" && (
                    <span className="poster-score">
                      {scoreLabel}: {(movie.score).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
              <div className="poster-footer">
                <h3 className="poster-title">{movie.title.replace(/\s*\(\d{4}\)$/, '')}</h3>
                {(() => {
                  const year = getMovieYear(movie.title);
                  const topGenre = getTopGenre(movie.genres);
                  const metaText = year && topGenre ? `${year} · ${topGenre}` : year || topGenre;
                  return metaText ? <span className="poster-year">{metaText}</span> : null;
                })()}
              </div>
            </NextLink>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card-grid">
      {items.map((movie) => (
        <NextLink
          key={movie.item_id}
          href={`/movies/${movie.item_id}`}
          className="poster-card"
        >
          <div
            className="poster-bg"
            style={{ 
              background: movie.poster_url ? 'none' : getGradient(movie.item_id)
            }}
          >
            {movie.poster_url && (
              <img 
                src={movie.poster_url} 
                alt={movie.title} 
                loading="lazy"
                className="poster-img"
              />
            )}
            <div className="poster-overlay" />
            <div className="poster-info-overlay">
              <div className="poster-genres">
                {movie.genres ? (
                  movie.genres.split("|").map((g, idx) => (
                    <span key={idx} className="genre-tag">
                      {g}
                    </span>
                  ))
                ) : (
                  <span className="genre-tag">No genres</span>
                )}
              </div>
              {typeof movie.score === "number" && (
                <span className="poster-score">
                  {scoreLabel}: {(movie.score).toFixed(2)}
                </span>
              )}
            </div>
          </div>
          <div className="poster-footer">
            <h3 className="poster-title">{movie.title.replace(/\s*\(\d{4}\)$/, '')}</h3>
            {(() => {
              const year = getMovieYear(movie.title);
              const topGenre = getTopGenre(movie.genres);
              const metaText = year && topGenre ? `${year} · ${topGenre}` : year || topGenre;
              return metaText ? <span className="poster-year">{metaText}</span> : null;
            })()}
          </div>
        </NextLink>
      ))}
    </div>
  );
}