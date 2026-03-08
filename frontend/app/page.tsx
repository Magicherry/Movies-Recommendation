import { getMovies } from "../lib/api";
import MovieCardGrid from "../components/movie-card-grid";
import HeroCarousel from "../components/hero-carousel";

export default async function HomePage() {
  const moviesData = await getMovies(120, 0);
  const movies = moviesData.items;
  // Use the top 5 movies for the carousel
  const featuredMovies = movies.slice(0, 5);
  const trending = movies.slice(0, 15);
  const actionMovies = movies.filter(m => m.genres.includes('Action')).slice(0, 15);
  const comedyMovies = movies.filter(m => m.genres.includes('Comedy')).slice(0, 15);
  const dramaMovies = movies.filter(m => m.genres.includes('Drama')).slice(0, 15);

  return (
    <>
      <HeroCarousel movies={featuredMovies} />

      <section id="browse" className="content-padding" style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
        <div>
          <MovieCardGrid title="Trending Now" items={trending} rowMode={true} />
        </div>
        
        {actionMovies.length > 0 && (
          <div>
            <MovieCardGrid title="Action & Adventure" items={actionMovies} rowMode={true} />
          </div>
        )}

        {comedyMovies.length > 0 && (
          <div>
            <MovieCardGrid title="Comedies" items={comedyMovies} rowMode={true} />
          </div>
        )}

        {dramaMovies.length > 0 && (
          <div>
            <MovieCardGrid title="Critically Acclaimed Dramas" items={dramaMovies} rowMode={true} />
          </div>
        )}
      </section>
    </>
  );
}