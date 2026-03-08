import { getMovieDetail } from "../../../lib/api";
import MovieCardGrid from "../../../components/movie-card-grid";

type MovieDetailPageProps = {
  params: {
    id: string;
  };
};

function getGradient(id: number) {
  const hue1 = (id * 137) % 360;
  const hue2 = (id * 97) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 40%, 15%), hsl(${hue2}, 40%, 5%))`;
}

export default async function MovieDetailPage({ params }: MovieDetailPageProps) {
  const itemId = Number(params.id);
  const data = await getMovieDetail(itemId);

  return (
    <>
      <div className="hero-banner">
        <div
          className="hero-banner-bg"
          style={{ 
            backgroundImage: data.movie.backdrop_url ? `url('${data.movie.backdrop_url}')` : getGradient(itemId),
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        />
        <div className="hero-banner-gradient" />
        
        <div className="hero-content">
          <h1 className="hero-title">{data.movie.title}</h1>
          <div className="hero-meta">
            <span>{data.movie.genres.replace(/\|/g, " • ")}</span>
          </div>
          <p className="hero-desc">
            {data.movie.overview || "A fantastic film to enjoy. Dive deep into this critically acclaimed piece."}
          </p>
          <div className="hero-actions">
            <button className="btn-primary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              Rate Movie
            </button>
            <button className="btn-secondary">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5v14"/>
              </svg>
              Add to Watchlist
            </button>
          </div>
        </div>
      </div>

      <section className="content-padding">
        <MovieCardGrid
          title="More Like This"
          items={data.similar}
          scoreLabel="Similarity"
          emptyMessage="No similar movies were found for this item."
          rowMode={true}
        />
      </section>
    </>
  );
}