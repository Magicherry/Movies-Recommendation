"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { MovieCardItem } from "./movie-card-grid";
import type { TMDBSearchResult } from "../lib/api";
import { tmdbSearch, movieApplyScrape } from "../lib/api";

/** Parse full title into search name and year; strip non-year parentheticals e.g. (Hont faan kui). */
function parseTitleAndYear(fullTitle: string): { name: string; year: string } {
  let s = fullTitle.trim();
  const yearMatch = s.match(/\s*\((\d{4})\)\s*$/);
  const year = yearMatch ? yearMatch[1] : "";
  if (yearMatch) s = s.replace(/\s*\(\d{4}\)\s*$/, "").trim();
  const name = s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return { name, year };
}

type ScrapeMetadataModalProps = {
  movie: MovieCardItem;
  onClose: () => void;
  onSuccess: () => void;
};

const MODAL_TRANSITION_MS = 250;

export default function ScrapeMetadataModal({ movie, onClose, onSuccess }: ScrapeMetadataModalProps) {
  const { name: initialName, year: initialYear } = parseTitleAndYear(movie.title);
  const currentTmdbIdRaw = movie.tmdb_id != null && String(movie.tmdb_id).trim() !== ""
    ? String(movie.tmdb_id).replace(/\.0$/, "")
    : "";
  const currentTmdbId = currentTmdbIdRaw || "—";
  const currentTmdbUrl = currentTmdbIdRaw ? `https://www.themoviedb.org/movie/${currentTmdbIdRaw}` : "";
  const [name, setName] = useState(initialName);
  const [year, setYear] = useState(initialYear);
  const [results, setResults] = useState<TMDBSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TMDBSearchResult | null>(null);
  const [isEntered, setIsEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback(async () => {
    setError(null);
    setResults([]);
    setSelected(null);
    if (!name.trim()) {
      setError("Enter a movie name.");
      return;
    }
    setLoading(true);
    try {
      const data = await tmdbSearch(name.trim(), year.trim() || undefined);
      setResults(data.results ?? []);
      if (!(data.results?.length)) setError("No results from TMDB.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }, [name, year]);

  const handleClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    exitTimeoutRef.current = setTimeout(() => {
      exitTimeoutRef.current = null;
      onClose();
    }, MODAL_TRANSITION_MS);
  }, [isExiting, onClose]);

  const handleApply = useCallback(async () => {
    if (!selected) return;
    setError(null);
    setApplying(true);
    try {
      await movieApplyScrape(
        movie.item_id,
        selected.poster_url,
        selected.backdrop_url,
        selected.overview ?? "",
        selected.tmdb_id
      );
      onSuccess();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed.");
    } finally {
      setApplying(false);
    }
  }, [movie.item_id, selected, onSuccess, handleClose]);

  useEffect(() => {
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevLeft = document.body.style.left;
    const prevWidth = document.body.style.width;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.left = prevLeft;
      document.body.style.width = prevWidth;
      window.scrollTo(scrollX, scrollY);
    };
  }, []);

  useEffect(() => {
    const t = requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsEntered(true));
    });
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const overlayClass = [
    "movie-modal-overlay",
    "scrape-metadata-overlay",
    isEntered && !isExiting && "movie-modal-entered",
    isExiting && "movie-modal-exiting",
  ].filter(Boolean).join(" ");
  const panelClass = [
    "movie-modal-panel",
    "scrape-metadata-panel",
    isEntered && !isExiting && "movie-modal-entered",
    isExiting && "movie-modal-exiting",
  ].filter(Boolean).join(" ");

  const content = (
    <div
      className={overlayClass}
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
    >
      <div className={panelClass} onClick={(e) => e.stopPropagation()}>
        <div className="movie-modal-header">
          <h2 className="movie-modal-header-title">Scrape metadata</h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="movie-modal-close-btn"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
          <div className="movie-modal-split">
            <div className="movie-modal-left">
              <div className="movie-modal-left-header">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  <line x1="12" y1="11" x2="17" y2="11" />
                </svg>
                Current in Database
              </div>
              
              <div className="movie-modal-dataset-info">
                <div className="dataset-info-row">
                  <span className="dataset-info-label">ID</span>
                  <span className="dataset-info-value">{movie.item_id}</span>
                </div>
                <div className="dataset-info-row">
                  <span className="dataset-info-label">TMDB ID</span>
                  <span className="dataset-info-value">
                    {currentTmdbUrl ? (
                      <a
                        href={currentTmdbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dataset-info-link"
                      >
                        {currentTmdbId}
                      </a>
                    ) : (
                      currentTmdbId
                    )}
                  </span>
                </div>
                <div className="dataset-info-row">
                  <span className="dataset-info-label">Title</span>
                  <span className="dataset-info-value">{movie.title}</span>
                </div>
                <div className="dataset-info-row">
                  <span className="dataset-info-label">Genres</span>
                  <span className="dataset-info-value">{movie.genres ? movie.genres.split("|").join(", ") : "—"}</span>
                </div>
              </div>

              <div className="movie-modal-current-poster">
                {movie.poster_url ? (
                  <img src={movie.poster_url} alt={movie.title} />
                ) : (
                  <div className="movie-modal-poster-placeholder">No Poster</div>
                )}
                {movie.overview && (
                  <p className="movie-modal-current-overview">{movie.overview}</p>
                )}
              </div>
            </div>

            <div className="movie-modal-right">
              <section className="movie-modal-section movie-modal-search-section">
                <label className="movie-modal-label" htmlFor="scrape-name">Search TMDB</label>
                <div className="movie-modal-search-row">
                  <div className="movie-modal-search-input-wrap">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="movie-modal-search-icon" aria-hidden>
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      id="scrape-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Movie name..."
                      className="movie-modal-search-input"
                    />
                  </div>
                  <input
                    id="scrape-year"
                    type="text"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Year"
                    maxLength={4}
                    className="movie-modal-year-input"
                    aria-label="Year"
                  />
                  <button
                    type="button"
                    onClick={handleSearch}
                    disabled={loading}
                    className="btn-primary search-btn"
                  >
                    {loading ? "Searching…" : "Search"}
                  </button>
                </div>
              </section>

              {error && <p className="movie-modal-error">{error}</p>}

              <div className="movie-modal-results-container">
                {results.length > 0 ? (
                  <div className="movie-modal-results-list">
                    {results.map((r) => (
                      <button
                        type="button"
                        key={r.tmdb_id}
                        onClick={() => setSelected(r)}
                        className={`movie-modal-result-card${selected?.tmdb_id === r.tmdb_id ? " is-selected" : ""}`}
                      >
                        {r.poster_url ? (
                          <img src={r.poster_url} alt="" className="poster-thumb" />
                        ) : (
                          <div className="poster-thumb placeholder" />
                        )}
                        <div className="result-body">
                          <div className="result-header">
                            <div className="result-title">{r.title}</div>
                            <div className="result-meta">{r.release_date?.slice(0, 4) || "—"}</div>
                          </div>
                          <div className="result-tmdb-id">TMDB ID: {r.tmdb_id}</div>
                          {r.overview && (
                            <div className="result-overview">{r.overview}</div>
                          )}
                        </div>
                        <div className="result-check">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  !loading && !error && (
                    <div className="movie-modal-empty-state">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                      <p>Search for a movie to see results</p>
                    </div>
                  )
                )}
              </div>

              <div className="movie-modal-footer">
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!selected || applying}
                  className="movie-modal-btn movie-modal-btn-primary apply-btn"
                >
                  {applying ? "Applying..." : "Apply Selected Metadata"}
                </button>
              </div>
            </div>
          </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
