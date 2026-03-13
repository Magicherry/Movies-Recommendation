"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Movie } from "../lib/api";

type HeroCarouselProps = {
  movies: Movie[];
};

export default function HeroCarousel({ movies }: HeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
      if (isPaused) return;
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % movies.length);
      }, 30000);
      return () => clearInterval(interval);
    }, [isPaused, movies.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev === 0 ? movies.length - 1 : prev - 1));
  }, [movies.length]);
  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % movies.length);
  }, [movies.length]);
  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  if (!movies || movies.length === 0) return null;

  const featured = movies[currentIndex];

  // We can use a deterministic gradient for background based on item_id to make each slide look unique
  const getGradient = (id: number) => {
    const hue1 = (id * 137) % 360;
    const hue2 = (id * 97) % 360;
    return `linear-gradient(135deg, hsl(${hue1}, 40%, 25%), hsl(${hue2}, 60%, 10%))`;
  };

  const getAgeRating = (genres: string) => {
    if (genres.includes('Children') || genres.includes('Animation')) return 'PG';
    if (genres.includes('Horror') || genres.includes('Crime') || genres.includes('Thriller')) return '18+';
    return '13+';
  };

  return (
    <div className="hero-banner">
      {/* Background */}
      <div
        className="hero-banner-bg"
        style={{
          backgroundImage: featured.backdrop_url ? `url('${featured.backdrop_url}')` : getGradient(featured.item_id),
          backgroundSize: 'cover',
          backgroundPosition: 'top',
          backgroundRepeat: 'no-repeat',
          transition: "background-image 0.8s ease"
        }}
      />
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
        <h1 className="hero-title">{featured.title.replace(/\s*\(\d{4}\)$/, '')}</h1>
        <div className="hero-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 'bold', color: 'white' }}>{featured.title.match(/\((\d{4})\)$/)?.[1] || "Movie"}</span>
          <span>•</span>
          <span>{getAgeRating(featured.genres)}</span>
          <span>•</span>
          <span>{featured.genres.split('|')[0] || "Drama"}</span>
        </div>
        <p className="hero-desc">
          {featured.overview || "Experience the magic of cinema with our personalized recommendations. Powered by advanced Matrix Factorization algorithms to find exactly what you want to watch."}
        </p>
        <div className="hero-actions">
          <Link href={`/movies/${featured.item_id}`} className="btn-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
            View Details
          </Link>
          <a href="#browse" className="btn-secondary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            Explore More
          </a>
        </div>
      </div>
      
      {/* Indicators */}
      <div className="hero-carousel-indicators">
        {movies.map((_, idx) => (
          <button
            key={idx}
            className={`hero-indicator ${idx === currentIndex ? "active" : ""}`}
            onClick={() => setCurrentIndex(idx)}
            aria-label={`Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}