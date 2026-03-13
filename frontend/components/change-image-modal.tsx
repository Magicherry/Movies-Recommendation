"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { MovieCardItem } from "./movie-card-grid";
import { movieUpdateImages, tmdbMovieImages } from "../lib/api";
import type { TMDBImageItem } from "../lib/api";

type ChangeImageModalProps = {
  movie: MovieCardItem;
  onClose: () => void;
  onSuccess: (payload: { itemId: number; posterUrl: string; backdropUrl: string }) => void;
};

const MODAL_TRANSITION_MS = 250;

type Level2Mode = "poster" | "backdrop";

export default function ChangeImageModal({ movie, onClose, onSuccess }: ChangeImageModalProps) {
  const currentPoster = movie.poster_url ?? "";
  const currentBackdrop = movie.backdrop_url ?? "";
  const [selectedPosterUrl, setSelectedPosterUrl] = useState<string | null>(null);
  const [selectedBackdropUrl, setSelectedBackdropUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEntered, setIsEntered] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const exitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [level, setLevel] = useState<1 | 2>(1);
  const [level2Mode, setLevel2Mode] = useState<Level2Mode>("poster");
  const [posters, setPosters] = useState<TMDBImageItem[]>([]);
  const [backdrops, setBackdrops] = useState<TMDBImageItem[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [posterSize, setPosterSize] = useState<{ w: number; h: number } | null>(null);
  const [backdropSize, setBackdropSize] = useState<{ w: number; h: number } | null>(null);
  const [posterLoadError, setPosterLoadError] = useState(false);
  const [backdropLoadError, setBackdropLoadError] = useState(false);

  const displayPoster = selectedPosterUrl !== null ? selectedPosterUrl : currentPoster;
  const displayBackdrop = selectedBackdropUrl !== null ? selectedBackdropUrl : currentBackdrop;
  const movieTmdbId = movie.tmdb_id != null && movie.tmdb_id !== "" ? Number(movie.tmdb_id) : NaN;
  const hasStoredTmdbId = Number.isInteger(movieTmdbId) && movieTmdbId > 0;

  const handleClose = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    exitTimeoutRef.current = setTimeout(() => {
      exitTimeoutRef.current = null;
      onClose();
    }, MODAL_TRANSITION_MS);
  }, [isExiting, onClose]);

  const handleSave = useCallback(async () => {
    setError(null);
    const posterToSend = selectedPosterUrl !== null ? selectedPosterUrl : currentPoster;
    const backdropToSend = selectedBackdropUrl !== null ? selectedBackdropUrl : currentBackdrop;
    if (!posterToSend.trim() && !backdropToSend.trim()) {
      setError("At least one image is required.");
      return;
    }
    setSaving(true);
    try {
      await movieUpdateImages(movie.item_id, posterToSend, backdropToSend);
      onSuccess({ itemId: movie.item_id, posterUrl: posterToSend, backdropUrl: backdropToSend });
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }, [movie.item_id, currentPoster, currentBackdrop, selectedPosterUrl, selectedBackdropUrl, onSuccess, handleClose]);

  const openLevel2Poster = useCallback(() => {
    if (!hasStoredTmdbId) {
      setError("No TMDB ID found. Please scrape metadata first.");
      return;
    }
    if (imagesLoading) return;
    if (posters.length === 0) {
      setError("No posters found for this movie.");
      return;
    }
    setLevel(2);
    setLevel2Mode("poster");
    setError(null);
  }, [hasStoredTmdbId, posters.length, imagesLoading]);

  const openLevel2Backdrop = useCallback(() => {
    if (!hasStoredTmdbId) {
      setError("No TMDB ID found. Please scrape metadata first.");
      return;
    }
    if (imagesLoading) return;
    if (backdrops.length === 0) {
      setError("No backdrops found for this movie.");
      return;
    }
    setLevel(2);
    setLevel2Mode("backdrop");
    setError(null);
  }, [hasStoredTmdbId, backdrops.length, imagesLoading]);

  const handlePickImage = useCallback((url: string) => {
    if (level2Mode === "poster") setSelectedPosterUrl(url);
    else setSelectedBackdropUrl(url);
    setLevel(1);
  }, [level2Mode]);

  const handleDiscardPoster = useCallback(() => {
    setSelectedPosterUrl("");
    setPosterSize(null);
  }, []);
  const handleDiscardBackdrop = useCallback(() => {
    setSelectedBackdropUrl("");
    setBackdropSize(null);
  }, []);

  const onPosterLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setPosterLoadError(false);
    if (img.naturalWidth && img.naturalHeight) setPosterSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);
  const onBackdropLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setBackdropLoadError(false);
    if (img.naturalWidth && img.naturalHeight) setBackdropSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  useEffect(() => {
    setPosterLoadError(false);
    if (!displayPoster.trim()) setPosterSize(null);
  }, [displayPoster]);

  useEffect(() => {
    setBackdropLoadError(false);
    if (!displayBackdrop.trim()) setBackdropSize(null);
  }, [displayBackdrop]);

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

  useEffect(() => {
    let cancelled = false;
    if (!hasStoredTmdbId) {
      setPosters([]);
      setBackdrops([]);
      setImagesLoading(false);
      return;
    }
    setImagesLoading(true);
    setError(null);
    tmdbMovieImages(movieTmdbId)
      .then((data) => {
        if (cancelled) return;
        setPosters(data.posters ?? []);
        setBackdrops(data.backdrops ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load TMDB images for this movie.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setImagesLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [hasStoredTmdbId, movieTmdbId]);

  const onOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  const overlayClass = [
    "movie-modal-overlay",
    isEntered && !isExiting && "movie-modal-entered",
    isExiting && "movie-modal-exiting",
  ].filter(Boolean).join(" ");
  const panelClass = [
    "movie-modal-panel",
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
          {level === 2 && (
            <button
              type="button"
              onClick={() => setLevel(1)}
              className="btn-back movie-modal-header-back"
              aria-label="Go back"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <h2 className="movie-modal-header-title">
            {level === 1 ? "Change image" : level2Mode === "poster" ? "Choose cover" : "Choose backdrop"}
          </h2>
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
        <div className="movie-modal-body-simple change-image-body">
          <div className="change-image-slider-wrap">
            <div className={`change-image-slider change-image-slider--level-${level}`}>
              <div className="change-image-panel change-image-panel--1">
              <div className="change-image-body-scroll">
              <p className="movie-modal-intro">
                Change cover or backdrop below. Images are loaded directly from TMDB using the saved TMDB ID.
              </p>

              <section className="movie-modal-section change-image-level1-cards">
                <h3 className="movie-modal-section-title">Image Preview</h3>
                <div className="change-image-cards-grid">
                  <div className="change-image-card change-image-card-ref">
                    <div className="change-image-card-preview change-image-card-poster">
                      {displayPoster && !posterLoadError ? (
                        <img src={displayPoster} alt="Cover" onLoad={onPosterLoad} onError={() => { setPosterLoadError(true); setPosterSize(null); }} />
                      ) : (
                        <span className="change-image-card-empty">No cover</span>
                      )}
                    </div>
                    <span className="change-image-card-label">Cover</span>
                    <span className="change-image-card-resolution">{posterSize ? `${posterSize.w} × ${posterSize.h}` : "\u00A0"}</span>
                    <div className="change-image-card-actions change-image-card-actions-icons">
                      <button
                        type="button"
                        onClick={openLevel2Poster}
                        disabled={imagesLoading || !hasStoredTmdbId || posters.length === 0}
                        className="change-image-card-icon-btn"
                        title="Choose image"
                        aria-label="Choose image"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </button>
                      <button type="button" onClick={handleDiscardPoster} className="change-image-card-icon-btn" title="Remove cover" aria-label="Remove cover">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="change-image-card change-image-card-ref">
                    <div className="change-image-card-preview change-image-card-backdrop">
                      {displayBackdrop && !backdropLoadError ? (
                        <img src={displayBackdrop} alt="Backdrop" onLoad={onBackdropLoad} onError={() => { setBackdropLoadError(true); setBackdropSize(null); }} />
                      ) : (
                        <span className="change-image-card-empty">No backdrop</span>
                      )}
                    </div>
                    <span className="change-image-card-label">Backdrop</span>
                    <span className="change-image-card-resolution">{backdropSize ? `${backdropSize.w} × ${backdropSize.h}` : "\u00A0"}</span>
                    <div className="change-image-card-actions change-image-card-actions-icons">
                      <button
                        type="button"
                        onClick={openLevel2Backdrop}
                        disabled={imagesLoading || !hasStoredTmdbId || backdrops.length === 0}
                        className="change-image-card-icon-btn"
                        title="Choose image"
                        aria-label="Choose image"
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </button>
                      <button type="button" onClick={handleDiscardBackdrop} className="change-image-card-icon-btn" title="Remove backdrop" aria-label="Remove backdrop">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="movie-modal-section">
                <h3 className="movie-modal-section-title">TMDB source</h3>
                {hasStoredTmdbId ? (
                  <p className="movie-modal-intro">Using saved TMDB ID: {movieTmdbId}</p>
                ) : (
                  <p className="movie-modal-error">No TMDB ID found for this movie. Please run metadata scrape first.</p>
                )}
              </section>

              {error && <p className="movie-modal-error">{error}</p>}
              </div>

              <div className="movie-modal-footer movie-modal-footer--actions change-image-footer-fixed">
                <button type="button" onClick={handleClose} className="movie-modal-btn movie-modal-btn-secondary">Cancel</button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !(displayPoster?.trim() || displayBackdrop?.trim())}
                  className="movie-modal-btn movie-modal-btn-primary"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
              </div>

              <div className="change-image-panel change-image-panel--2">
            <div className="change-image-body-scroll">
              <p className="movie-modal-intro">
                {level2Mode === "poster" ? "Select a cover image to use." : "Select a backdrop image to use."}
              </p>
              <div className={`change-image-picker-grid${level2Mode === "backdrop" ? " change-image-backdrop-grid" : ""}`}>
                {(level2Mode === "poster" ? posters : backdrops).map((item) => (
                  <div key={item.file_path} className="change-image-picker-item">
                    <button
                      type="button"
                      className="change-image-picker-thumb"
                      onClick={() => handlePickImage(item.url)}
                      title={`Vote: ${item.vote_average.toFixed(1)}`}
                    >
                      <img src={item.url} alt="" />
                    </button>
                    {item.width && item.height && (
                      <div className="change-image-picker-resolution">
                        {item.width} × {item.height}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {error && <p className="movie-modal-error">{error}</p>}
            </div>
              </div>
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
