import Link from "next/link";
import { getUserHistory, getRecommendations } from "../../../lib/api";
import MovieCardGrid from "../../../components/movie-card-grid";

type UserDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const userId = Number(params.id);
  
  // Use Promise.all to fetch concurrently for performance
  const [history, recommendations] = await Promise.all([
    getUserHistory(userId),
    getRecommendations(userId)
  ]);

  return (
    <>
      <div className="recommend-hero">
        <h1>User {userId}'s Profile</h1>
        <p>Explore this user's top-rated history and Matrix Factorization generated recommendations.</p>
        
        <div className="stats-row">
          <div className="stat-pill">
            <span className="stat-value">{history.length}</span>
            <span className="stat-label">Movies Rated</span>
          </div>
          <div className="stat-pill">
            <span className="stat-value">{recommendations.length}</span>
            <span className="stat-label">Recommendations</span>
          </div>
        </div>
      </div>

      <section className="content-padding">
        <MovieCardGrid
          title={`Recommended for User ${userId}`}
          items={recommendations}
          scoreLabel="Match Score"
          emptyMessage="No recommendations generated for this user."
          rowMode={true}
        />
      </section>

      {history.length > 0 && (
        <section className="content-padding" style={{ marginTop: "40px" }}>
          <MovieCardGrid
            title={`Recently Highly Rated by User ${userId}`}
            items={history.slice(0, 18).map(h => ({...h, score: h.rating}))} 
            scoreLabel="Rating"
            emptyMessage="No rating history available."
            rowMode={true}
          />
        </section>
      )}
    </>
  );
}