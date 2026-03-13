import Link from "next/link";
import { getUserHistory, getRecommendations, displayMovieTitle } from "../../../lib/api";
import MovieCardGrid from "../../../components/movie-card-grid";
import BackButton from "../../../components/back-button";
import UserProfileActions from "../../../components/user-profile-actions";
import ClientRecommendations from "./client-recommendations";

type UserDetailPageProps = {
  params: {
    id: string;
  };
};

export default async function UserDetailPage({ params }: UserDetailPageProps) {
  const userId = Number(params.id);
  
  // Use Promise.all to fetch concurrently for performance
  // We fetch ALL history to calculate accurate stats, even if we only display the top few later.
  const [history, recommendations] = await Promise.all([
    getUserHistory(userId, true),
    getRecommendations(userId, 50)
  ]);

  // Calculate preferred genres based on history
  const genreCounts: Record<string, number> = {};
  const eraCounts: Record<string, number> = {};
  let totalRating = 0;
  let ratingCount = 0;
  
  // For rating distribution
  const ratingDist: Record<string, number> = {
    "5": 0, "4": 0, "3": 0, "2": 0, "1": 0
  };

  history.forEach(movie => {
    // 1. Genre calculation
    if (movie.genres && movie.genres !== "(no genres listed)") {
      const genresList = movie.genres.split("|");
      genresList.forEach(g => {
        const weight = movie.rating ? Number(movie.rating) : 1; 
        genreCounts[g] = (genreCounts[g] || 0) + weight;
      });
    }

    // 2. Average rating & Distribution
    if (movie.rating) {
      const r = Number(movie.rating);
      totalRating += r;
      ratingCount++;
      
      const rounded = Math.round(r).toString();
      if (ratingDist[rounded] !== undefined) {
        ratingDist[rounded]++;
      } else if (r < 1) {
        ratingDist["1"]++;
      }
    }

    // 3. Era calculation from title (e.g., "(1994)")
    const yearMatch = movie.title.match(/\((\d{4})\)$/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10);
      const decade = Math.floor(year / 10) * 10;
      eraCounts[`${decade}s`] = (eraCounts[`${decade}s`] || 0) + 1;
    }
  });

  const preferredGenres = Object.entries(genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8) // Top 8 genres
    .map(entry => entry[0]);

  const avgRating = ratingCount > 0 ? (totalRating / ratingCount).toFixed(1) : "N/A";
  
  const favoriteEra = Object.entries(eraCounts).length > 0 
    ? Object.entries(eraCounts).sort((a, b) => b[1] - a[1])[0][0]
    : "N/A";

  const maxDistCount = Math.max(...Object.values(ratingDist), 1);

  // Find user's favorite movie
  const topMovie = history.length > 0 
    ? [...history].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))[0]
    : null;

  return (
    <div className="page-transition" style={{ position: "relative" }}>
      <BackButton top="30px" />
      <div className="content-padding" style={{ paddingTop: "90px", paddingBottom: "80px" }}>
        <div className="user-profile-glass-card">
          
          {/* Section 1: User Identity (Full Width) */}
          <div className="user-profile-header">
            <div className="user-profile-avatar">
              <img 
                src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${userId}`} 
                alt={`User ${userId}`}
                className="img-round"
              />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ margin: "0 0 8px 0", fontSize: "clamp(1.8rem, 5vw, 2.5rem)", fontWeight: 800 }}>User {userId}'s Profile</h1>
              <p style={{ color: "var(--text-subtle)", margin: 0, fontSize: "clamp(0.9rem, 3vw, 1.05rem)" }}>
                Explore this user's top-rated history and customized recommendations.
              </p>
            </div>
            <UserProfileActions profileUserId={userId} />
          </div>

          {/* Section 2: Movie Stats & Genres */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-main)", fontWeight: 700 }}>Viewing Stats</h3>
            <div style={{ display: "flex", gap: "16px" }}>
              <div className="user-profile-stat-card" style={{ flex: 1 }}>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "var(--text-main)", lineHeight: 1 }}>{history.length}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)", marginTop: "8px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Movies Rated</div>
              </div>
              <div className="user-profile-stat-card" style={{ flex: 1 }}>
                <div style={{ fontSize: "2rem", fontWeight: 800, color: "#4ade80", lineHeight: 1 }}>{avgRating}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-subtle)", marginTop: "8px", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>Avg Score</div>
              </div>
            </div>
            
            {/* Top Genres */}
            {preferredGenres.length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <span style={{ display: "block", fontSize: "0.85rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "12px" }}>
                  Top Genres
                </span>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {preferredGenres.map(g => (
                    <span key={g} className="user-profile-genre-tag">
                      {g}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Cinematic Preferences */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-main)", fontWeight: 700 }}>Cinematic Tastes</h3>
            
            {favoriteEra !== "N/A" && (
              <div className="user-profile-stat-card">
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "8px" }}>
                  Favorite Era
                </span>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "var(--text-main)" }}>
                  {favoriteEra} Movies
                </div>
              </div>
            )}

            {topMovie && (
              <div className="user-profile-stat-card" style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-subtle)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, marginBottom: "8px" }}>
                  Highest Rated Masterpiece
                </span>
                <Link href={`/movies/${topMovie.item_id}`} style={{ textDecoration: "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span className="hover-underline-dashed" style={{ 
                      fontSize: "1.2rem", 
                      fontWeight: 700, 
                      color: "var(--text-main)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      borderBottom: "1px dashed rgba(255,255,255,0.3)",
                      transition: "border-color 0.2s",
                      width: "fit-content"
                    }}>
                      {displayMovieTitle(topMovie.title)}
                    </span>
                    <span style={{ color: "#facc15", fontWeight: 700, fontSize: "1.1rem" }}>★ {topMovie.rating}</span>
                  </div>
                </Link>
              </div>
            )}
          </div>

          {/* Section 4: Rating Distribution */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <h3 style={{ margin: 0, fontSize: "1.1rem", color: "var(--text-main)", fontWeight: 700 }}>Rating Distribution</h3>
            <div className="user-profile-stat-card" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {["5", "4", "3", "2", "1"].map((star) => {
                  const count = ratingDist[star];
                  const percentage = Math.max((count / maxDistCount) * 100, 2); // At least 2% to show the bar
                  return (
                    <div key={star} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9rem" }}>
                      <span style={{ width: "16px", color: "var(--text-subtle)", fontWeight: 600, textAlign: "center" }}>{star}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-subtle)" stroke="var(--text-subtle)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "translateY(-1px)" }}>
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                      <div className="progress-track">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${percentage}%`, background: count > 0 ? "var(--brand)" : "transparent" }} 
                        />
                      </div>
                      <span style={{ width: "30px", textAlign: "right", color: "var(--text-main)", fontWeight: 600, fontSize: "0.85rem" }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          
        </div>
      </div>

        <section className="content-padding">
          <ClientRecommendations initialRecommendations={recommendations} userId={userId} />
        </section>

      {history.length > 0 && (
        <section className="content-padding" style={{ marginTop: "-20px" }}>
          <MovieCardGrid
            title={`Recently Highly Rated by User ${userId}`}
            items={history.slice(0, 18).map(h => ({...h, score: h.rating}))} 
            scoreLabel="Rating"
            emptyMessage="No rating history available."
            rowMode={true}
          />
        </section>
      )}
    </div>
  );
}