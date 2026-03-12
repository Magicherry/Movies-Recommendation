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

export default function HomePage() {
  const { userId } = useUser();
  
  // Use cached data if available for the current user
  const hasCache = globalUserId === userId && globalTrending.length > 0;
  const [loading, setLoading] = useState(!hasCache);
  
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>(hasCache ? globalFeatured : []);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<Movie[]>(hasCache ? globalHistory : []);
  const [trending, setTrending] = useState<Movie[]>(hasCache ? globalTrending : []);

  useEffect(() => {
    async function loadData() {
      // Read recCount from localStorage, default to 10
      const savedRecCount = localStorage.getItem("streamx-rec-count");
      const recCount = savedRecCount ? parseInt(savedRecCount, 10) : 10;
      const forceRefresh = localStorage.getItem("streamx-force-refresh");

      if (globalUserId === userId && globalTrending.length > 0 && globalRecs.length === recCount && globalLastRefresh === forceRefresh) {
        // Data is already loaded and cached for this user with the correct count and model
        setRecommendations(globalRecs);
        setLoading(false);
        return;
      }
      
      setLoading(true);
      try {
        // Fetch recommendations for the current user
        const recs = await getRecommendations(userId, recCount).catch(() => []);
        setRecommendations(recs);
        globalRecs = recs;

        // Fetch watch history
        const hist = await getUserHistory(userId).catch(() => []);
        const formattedHist = hist.map(h => ({
          item_id: h.item_id,
          title: h.title,
          genres: h.genres,
          // @ts-ignore
          poster_url: h.poster_url,
          // @ts-ignore
          backdrop_url: h.backdrop_url,
          // @ts-ignore
          overview: h.overview
        }));
        setHistory(formattedHist);
        globalHistory = formattedHist;

        // Fetch some default movies for carousel and trending
        const moviesData = await getMovies(20, 0);
        const movies = moviesData.items;
        
        // If user has recommendations, use top ones for carousel, else fallback to trending
        if (recs.length > 0) {
          setFeaturedMovies(recs.slice(0, 5));
          globalFeatured = recs.slice(0, 5);
        } else {
          setFeaturedMovies(movies.slice(0, 5));
          globalFeatured = movies.slice(0, 5);
        }
        
        setTrending(movies.slice(0, 15));
        globalTrending = movies.slice(0, 15);
        globalUserId = userId;
        globalLastRefresh = forceRefresh;
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    
    loadData();
  }, [userId]);

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
