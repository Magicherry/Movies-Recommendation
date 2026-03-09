"use client";

import { useEffect, useState } from "react";
import { getMovies, getRecommendations, getUserHistory, Movie, Recommendation } from "../lib/api";
import MovieCardGrid from "../components/movie-card-grid";
import HeroCarousel from "../components/hero-carousel";
import { useUser } from "../context/user-context";

export default function HomePage() {
  const { userId } = useUser();
  const [loading, setLoading] = useState(true);
  
  const [featuredMovies, setFeaturedMovies] = useState<Movie[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [history, setHistory] = useState<Movie[]>([]);
  const [trending, setTrending] = useState<Movie[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Fetch recommendations for the current user
        const recs = await getRecommendations(userId).catch(() => []);
        setRecommendations(recs);

        // Fetch watch history
        const hist = await getUserHistory(userId).catch(() => []);
        setHistory(hist.map(h => ({
          item_id: h.item_id,
          title: h.title,
          genres: h.genres,
          // @ts-ignore
          poster_url: h.poster_url,
          // @ts-ignore
          backdrop_url: h.backdrop_url,
          // @ts-ignore
          overview: h.overview
        })));

        // Fetch some default movies for carousel and trending
        const moviesData = await getMovies(20, 0);
        const movies = moviesData.items;
        
        // If user has recommendations, use top ones for carousel, else fallback to trending
        if (recs.length > 0) {
          setFeaturedMovies(recs.slice(0, 5));
        } else {
          setFeaturedMovies(movies.slice(0, 5));
        }
        
        setTrending(movies.slice(0, 15));
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
