import { getMovieDetail } from "../../../lib/api";
import MovieCardGrid from "../../../components/movie-card-grid";
import BackButton from "../../../components/back-button";
import PredictionDisplay from "../../../components/prediction-display";

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
      <BackButton />
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
          <h1 className="hero-title">{data.movie.title.replace(/\s*\(\d{4}\)$/, '')}</h1>
          <div className="hero-meta">
            <span style={{ fontWeight: 'bold', color: 'white' }}>{data.movie.title.match(/\((\d{4})\)$/)?.[1] || "Movie"}</span>
            <span>{data.movie.genres.replace(/\|/g, " • ")}</span>
          </div>
          <p className="hero-desc">
            {data.movie.overview || "A fantastic film to enjoy. Dive deep into this critically acclaimed piece."}
          </p>
          <PredictionDisplay itemId={itemId} />
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