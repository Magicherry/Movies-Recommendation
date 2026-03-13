"use client";

import { useEffect, useState } from "react";
import { getMovies, getRecommendations, getUserHistory, Movie, Recommendation } from "../lib/api";
import MovieCardGrid from "../components/movie-card-grid";
import HeroCarousel from "../components/hero-carousel";
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

export default function HomePage() {
  const { userId } = useUser();
  const [metadataVersion, setMetadataVersion] = useState(0);
  const hasCache = globalUserId === userId && globalTrending.length > 0;
  const [loading, setLoading] = useState(!hasCache);
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>(hasCache ? globalFeatured : []);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<Movie[]>(hasCache ? globalHistory : []);
  const [trending, setTrending] = useState<Movie[]>(hasCache ? globalTrending : []);

  useEffect(() => {
    const handler = () => {
      globalFeatured = [];
      globalRecs = [];
      globalHistory = [];
      globalTrending = [];
      globalLastRefresh = null;
      setMetadataVersion((v) => v + 1);
    };
    window.addEventListener("streamx-metadata-updated", handler);
    return () => window.removeEventListener("streamx-metadata-updated", handler);
  }, []);

  useEffect(() => {
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
      const forceRefresh = localStorage.getItem("streamx-force-refresh");

      if (globalUserId === userId && globalTrending.length > 0 && globalRecs.length === recCount && globalLastRefresh === forceRefresh && globalWatchAgainCount === watchAgainCount && globalTrendingCount === trendingCount) {
        // Data is already loaded and cached for this user with the correct count and model
        setRecommendations(globalRecs);
        setLoading(false);
        return;
      }
      
      // Keep existing content visible during metadata refresh to preserve scroll position.
      if (!hasVisibleContent) {
        setLoading(true);
      }
      try {
        const trendingLimit = Math.max(20, trendingCount);
        const [recs, hist, moviesData] = await Promise.all([
          getRecommendations(userId, recCount).catch(() => []),
          getUserHistory(userId).catch(() => []),
          getMovies(trendingLimit, 0),
        ]);

        setRecommendations(recs);
        globalRecs = recs;

        const formattedHist = hist.map(h => ({
          item_id: h.item_id,
          title: h.title,
          genres: h.genres,
          poster_url: h.poster_url,
          backdrop_url: h.backdrop_url,
          overview: h.overview,
          tmdb_id: h.tmdb_id,
        }));
        const historySlice = formattedHist.slice(0, watchAgainCount);
        setHistory(historySlice);
        globalHistory = historySlice;

        const movies = moviesData.items;
        if (recs.length > 0) {
          setFeaturedMovies(recs.slice(0, 5));
          globalFeatured = recs.slice(0, 5);
        } else {
          setFeaturedMovies(movies.slice(0, 5));
          globalFeatured = movies.slice(0, 5);
        }

        setTrending(movies.slice(0, trendingCount));
        globalTrending = movies.slice(0, trendingCount);
        globalUserId = userId;
        globalLastRefresh = forceRefresh;
        globalWatchAgainCount = watchAgainCount;
        globalTrendingCount = trendingCount;
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [userId, metadataVersion, featuredMovies.length, recommendations.length, history.length, trending.length]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'white' }}>
        Loading personalized content...
      </div>
    );
  }

  return (
    <>
      <HeroCarousel movies={featuredMovies} />

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
