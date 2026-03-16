import { getMovieDetail, displayMovieName } from "../../../lib/api";
import CollectionLimitGrid from "../../../components/collection-limit-grid";
import BackButton from "../../../components/back-button";
import PredictionDisplay from "../../../components/prediction-display";
import RefreshOnEngineChange from "../../../components/refresh-on-engine-change";
import MovieDetailActions from "../../../components/movie-detail-actions";
import PersonList from "../../../components/person-list";
import Link from "next/link";

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

  const cast = data.movie.cast || [];
  const directors = data.movie.directors || [];

  return (
    <div className="page-transition">
      <RefreshOnEngineChange />
      <BackButton top="110px" />
      <MovieDetailActions movie={data.movie} />
      <div className="hero-banner">
        <div
          className="hero-banner-bg"
          style={{ 
            backgroundImage: data.movie.backdrop_url ? `url('${data.movie.backdrop_url}')` : getGradient(itemId),
            backgroundSize: 'cover',
            backgroundPosition: 'top',
            backgroundRepeat: 'no-repeat'
          }}
        />
        <div className="hero-banner-gradient" />
        
        <div className="hero-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <h1 className="hero-title" style={{ margin: 0 }}>{displayMovieName(data.movie)}</h1>
          </div>
          <div className="hero-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{ fontWeight: 'bold', color: 'white' }}>{data.movie.title.match(/\((\d{4})\)$/)?.[1] || "Movie"}</span>
            <span>•</span>
            <span>{data.movie.genres.replace(/\|/g, " • ")}</span>
          </div>
          <p className="hero-desc">
            {data.movie.overview || "A fantastic film to enjoy. Dive deep into this critically acclaimed piece."}
          </p>
          <PredictionDisplay itemId={itemId} />
        </div>
      </div>

      <section className="content-padding">
        <PersonList directors={directors} cast={cast} tmdbId={data.movie.tmdb_id} movieTitle={displayMovieName(data.movie)} />

        <CollectionLimitGrid
          settingKey="more-like-this"
          title="More Like This"
          items={data.similar}
          scoreLabel="Similarity"
          emptyMessage="No similar movies were found for this item."
          rowMode={true}
        />
      </section>
    </div>
  );
}