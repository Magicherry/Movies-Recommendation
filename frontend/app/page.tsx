"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getMovies, getRecommendations, getUserHistory, Movie, Recommendation } from "../lib/api";
import MovieCardGrid from "../components/movie-card-grid";
import HeroCarousel, { type HeroCarouselSource } from "../components/hero-carousel";
import { useUser } from "../context/user-context";

// Global cache to maintain state across navigations, enabling Next.js scroll restoration
let globalFeatured: Movie[] = [];
let globalRecs: Recommendation[] = [];
let globalHistory: Movie[] = [];
let globalTrending: Movie[] = [];
let globalUserId: number | null = null;
let globalLastRefresh: string | null = null;
let globalWatchAgainCount: number = 15;
let globalTrendingCount: number = 15;
let globalCarouselCount: number = 5;
let globalCarouselIntervalMs: number = 30000;
let globalCarouselSource: HeroCarouselSource = "trending";
let globalCarouselSourceNote = "Personalized feed unavailable. Showing trending picks.";

export default function HomePage() {
  const { userId } = useUser();
  const router = useRouter();
  const [metadataVersion, setMetadataVersion] = useState(0);
  const hasCache = globalUserId === userId && globalTrending.length > 0;
  const [loading, setLoading] = useState(!hasCache);
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>(hasCache ? globalFeatured : []);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<Movie[]>(hasCache ? globalHistory : []);
  const [trending, setTrending] = useState<Movie[]>(hasCache ? globalTrending : []);
  const [carouselIntervalMs, setCarouselIntervalMs] = useState(hasCache ? globalCarouselIntervalMs : 30000);
  const [carouselSource, setCarouselSource] = useState<HeroCarouselSource>(hasCache ? globalCarouselSource : "trending");
  const [carouselSourceNote, setCarouselSourceNote] = useState(hasCache ? globalCarouselSourceNote : "Loading recommendations...");

  useEffect(() => {
    const handler = () => {
      globalFeatured = [];
      globalRecs = [];
      globalHistory = [];
      globalTrending = [];
      globalLastRefresh = null;
      globalCarouselCount = 5;
      globalCarouselIntervalMs = 30000;
      globalCarouselSource = "trending";
      globalCarouselSourceNote = "Personalized feed unavailable. Showing trending picks.";
      setMetadataVersion((v) => v + 1);
    };
    
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'streamx-force-refresh') {
        handler();
      }
    };

    window.addEventListener("streamx-metadata-updated", handler);
    window.addEventListener("streamx-engine-changed", handler);
    window.addEventListener("storage", handleStorageChange);
    
    return () => {
      window.removeEventListener("streamx-metadata-updated", handler);
      window.removeEventListener("streamx-engine-changed", handler);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      const hasVisibleContent =
        featuredMovies.length > 0 ||
        recommendations.length > 0 ||
        history.length > 0 ||
        trending.length > 0;

      // Read recCount and collection counts from localStorage
      const savedRecCount = localStorage.getItem("streamx-rec-count");
      const recCount = savedRecCount ? parseInt(savedRecCount, 10) : 10;
      const savedWatchAgain = localStorage.getItem("streamx-watch-again-count");
      const watchAgainCount = Math.min(100, Math.max(5, savedWatchAgain ? parseInt(savedWatchAgain, 10) : 15));
      const savedTrending = localStorage.getItem("streamx-trending-count");
      const trendingCount = Math.min(100, Math.max(5, savedTrending ? parseInt(savedTrending, 10) : 15));
      const savedCarouselCount = localStorage.getItem("streamx-carousel-count");
      const carouselCount = Math.min(15, Math.max(1, savedCarouselCount ? parseInt(savedCarouselCount, 10) : 5));
      const savedCarouselInterval = localStorage.getItem("streamx-carousel-interval-seconds");
      const carouselIntervalMsValue = Math.min(120000, Math.max(5000, (savedCarouselInterval ? parseInt(savedCarouselInterval, 10) : 30) * 1000));
      const forceRefresh = localStorage.getItem("streamx-force-refresh");
      setCarouselIntervalMs(carouselIntervalMsValue);

      if (
        globalUserId === userId &&
        globalTrending.length > 0 &&
        globalRecs.length === recCount &&
        globalLastRefresh === forceRefresh &&
        globalWatchAgainCount === watchAgainCount &&
        globalTrendingCount === trendingCount &&
        globalCarouselCount === carouselCount &&
        globalCarouselIntervalMs === carouselIntervalMsValue
      ) {
        // Data is already loaded and cached for this user with the correct count and model
        if (cancelled) return;
        setRecommendations(globalRecs);
        setCarouselIntervalMs(globalCarouselIntervalMs);
        setCarouselSource(globalCarouselSource);
        setCarouselSourceNote(globalCarouselSourceNote);
        setLoading(false);
        return;
      }
      
      // Keep existing content visible during metadata refresh to preserve scroll position.
      if (!hasVisibleContent) {
        if (cancelled) return;
        setLoading(true);
      }
      try {
        const trendingLimit = Math.max(20, trendingCount);
        const [recommendationResult, hist, moviesData] = await Promise.all([
          getRecommendations(userId, recCount)
            .then((items) => ({ items, errorMessage: null as string | null }))
            .catch((error: unknown) => {
              console.error(error);
              return {
                items: [],
                errorMessage: error instanceof Error ? error.message : "Unknown recommendation error",
              };
            }),
          getUserHistory(userId).catch(() => []),
          getMovies(trendingLimit, 0, undefined, undefined, undefined, "behavior_score", "desc"),
        ]);
        if (cancelled) return;

        const recs = recommendationResult.items;
        setRecommendations(recs);
        globalRecs = recs;

        const formattedHist = hist.map(h => ({
          item_id: h.item_id,
          title: h.title,
          scraped_title: h.scraped_title,
          genres: h.genres,
          poster_url: h.poster_url,
          backdrop_url: h.backdrop_url,
          overview: h.overview,
          tmdb_id: h.tmdb_id,
        }));
        const historySlice = formattedHist.slice(0, watchAgainCount);
        setHistory(historySlice);
        globalHistory = historySlice;

        let nextCarouselSource: HeroCarouselSource = "trending";
        let nextCarouselSourceNote = "No personalized results found. Showing trending picks.";
        if (recs.length > 0) {
          nextCarouselSource = "personalized";
          nextCarouselSourceNote = "Tailored for your active profile.";
        } else if (recommendationResult.errorMessage) {
          const normalizedError = recommendationResult.errorMessage.toLowerCase();
          nextCarouselSourceNote = normalizedError.includes("not found")
            ? "User profile is not in training data. Showing trending picks."
            : "Personalized feed is temporarily unavailable. Showing trending picks.";
        }

        const movies = moviesData.items;
        if (recs.length > 0) {
          setFeaturedMovies(recs.slice(0, carouselCount));
          globalFeatured = recs.slice(0, carouselCount);
        } else {
          setFeaturedMovies(movies.slice(0, carouselCount));
          globalFeatured = movies.slice(0, carouselCount);
        }
        globalCarouselCount = carouselCount;
        globalCarouselIntervalMs = carouselIntervalMsValue;
        setCarouselSource(nextCarouselSource);
        setCarouselSourceNote(nextCarouselSourceNote);
        globalCarouselSource = nextCarouselSource;
        globalCarouselSourceNote = nextCarouselSourceNote;

        setTrending(movies.slice(0, trendingCount));
        globalTrending = movies.slice(0, trendingCount);
        globalUserId = userId;
        globalLastRefresh = forceRefresh;
        globalWatchAgainCount = watchAgainCount;
        globalTrendingCount = trendingCount;
      } catch (err) {
        if (cancelled) return;
        console.error(err);
      } finally {
        if (cancelled) return;
        setLoading(false);
        window.dispatchEvent(new Event("streamx-recs-updated"));
      }
    }
    
    loadData();
    return () => {
      cancelled = true;
    };
  }, [userId, metadataVersion, featuredMovies.length, recommendations.length, history.length, trending.length]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>
        Loading personalized content...
      </div>
    );
  }

  const handleExploreMore = () => {
    if (typeof window !== "undefined") {
      if (recommendations.length > 0) {
        sessionStorage.setItem("collectionData", JSON.stringify({ title: "Top Picks for You", items: recommendations, scoreLabel: "Match" }));
      } else {
        sessionStorage.setItem("collectionData", JSON.stringify({ title: "Trending Now", items: trending, scoreLabel: undefined }));
      }
      router.push("/collection?from=/");
    }
  };

  return (
    <>
      <HeroCarousel 
        movies={featuredMovies} 
        source={carouselSource} 
        sourceNote={carouselSourceNote} 
        autoAdvanceMs={carouselIntervalMs} 
        onExploreMore={handleExploreMore}
      />

      <section id="browse" className="content-padding" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        
        {recommendations.length > 0 && (
          <div>
            <MovieCardGrid 
              title="Top Picks for You" 
              items={recommendations} 
              scoreLabel="Match" 
              rowMode={true} 
            />
          </div>
        )}

        {history.length > 0 && (
          <div>
            <MovieCardGrid 
              title="Watch It Again" 
              items={history} 
              rowMode={true} 
            />
          </div>
        )}

        <div>
          <MovieCardGrid title="Trending Now" items={trending} rowMode={true} />
        </div>
        
      </section>
    </>
  );
}
