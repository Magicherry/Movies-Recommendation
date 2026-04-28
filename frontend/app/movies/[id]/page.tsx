import { getMovieDetail, displayMovieName } from "../../../lib/api";
import CollectionLimitGrid from "../../../components/collection-limit-grid";
import PredictionDisplay from "../../../components/prediction-display";
import RefreshOnEngineChange from "../../../components/refresh-on-engine-change";
import MovieDetailActions from "../../../components/movie-detail-actions";
import PersonList from "../../../components/person-list";
import MovieDetailWhyRecommended from "../../../components/movie-detail-why-recommended";
import { normalizeMovieDetailContext, parsePositiveIntParam } from "../../../lib/movie-detail-context";
import { notFound } from "next/navigation";

type MovieDetailPageProps = {
  params: {
    id: string;
  };
  searchParams: {
    context?: string | string[];
    user?: string | string[];
    source_item?: string | string[];
  };
};

function getGradient(id: number) {
  const hue1 = (id * 137) % 360;
  const hue2 = (id * 97) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 40%, 15%), hsl(${hue2}, 40%, 5%))`;
}

export default async function MovieDetailPage({ params, searchParams }: MovieDetailPageProps) {
  const itemId = Number(params.id);
  if (!Number.isFinite(itemId) || itemId <= 0) {
    notFound();
  }

  const detailMode = normalizeMovieDetailContext(
    typeof searchParams.context === "string" ? searchParams.context : undefined
  );
  const contextUserId = parsePositiveIntParam(searchParams.user);
  const referenceItemId = parsePositiveIntParam(searchParams.source_item);

  let data: Awaited<ReturnType<typeof getMovieDetail>>;
  try {
    data = await getMovieDetail(
      itemId,
      100,
      detailMode === "similar" && referenceItemId
        ? { mode: "similar", referenceItemId }
        : detailMode === "recommended" && contextUserId
          ? { userId: contextUserId }
          : { mode: "neutral" }
    );
  } catch (error) {
    const err = error as Error & { status?: number };
    if (err.status === 404 || err.message.toLowerCase().includes("not found")) {
      notFound();
    }
    throw error;
  }

  const cast = data.movie.cast || [];
  const directors = data.movie.directors || [];
  const movieName = displayMovieName(data.movie);

  return (
    <div className="page-transition">
      <RefreshOnEngineChange />
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
          <div className="hero-title-block">
            {data.movie.logo_url ? (
              <img className="hero-movie-logo" src={data.movie.logo_url} alt={`${movieName} logo`} />
            ) : (
              <h1 className="hero-title" style={{ margin: 0 }}>{movieName}</h1>
            )}
          </div>
          <div className="hero-meta" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px' }}>
            <span style={{ fontWeight: 'bold', color: 'white' }}>{data.movie.title.match(/\((\d{4})\)$/)?.[1] || "Movie"}</span>
            <span>•</span>
            <span>{data.movie.genres.replace(/\|/g, " • ")}</span>
          </div>
          <p className="hero-desc">
            {data.movie.overview || "A fantastic film to enjoy. Dive deep into this critically acclaimed piece."}
          </p>
          {detailMode === "recommended" ? (
            <PredictionDisplay itemId={itemId} userIdOverride={contextUserId} />
          ) : null}
        </div>
      </div>

      <section className="content-padding">
        <MovieDetailWhyRecommended
          itemId={itemId}
          initialReasons={data.why_recommended}
          mode={detailMode}
          contextUserId={contextUserId}
          referenceItemId={referenceItemId}
        />
        <PersonList directors={directors} cast={cast} tmdbId={data.movie.tmdb_id} movieTitle={movieName} />

        <CollectionLimitGrid
          settingKey="more-like-this"
          title="More Like This"
          items={data.similar}
          scoreLabel="Similarity"
          emptyMessage="No similar movies were found for this item."
          rowMode={true}
          detailContext="similar"
          detailSourceItemId={itemId}
        />
      </section>
    </div>
  );
}