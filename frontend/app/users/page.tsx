import Link from "next/link";
import { getUsers } from "../../lib/api";

type UsersPageProps = {
  searchParams: { page?: string };
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const limit = 48; // Items per page
  const currentPage = Number(searchParams.page) || 1;
  const offset = (currentPage - 1) * limit;

  const data = await getUsers(limit, offset);
  const totalPages = Math.ceil(data.total / limit);

  return (
    <section className="content-padding" style={{ paddingTop: "120px" }}>
      <div className="hero-panel" style={{ marginBottom: "32px" }}>
        <p className="eyebrow">Community</p>
        <h1 className="section-title">Browse Users</h1>
        <p className="helper-text">
          Select a user profile to see their highly rated movies and customized recommendations.
          ({data.total} users total)
        </p>
      </div>

      <div className="user-grid">
        {data.items.map((user) => (
          <Link key={user.user_id} href={`/users/${user.user_id}`} className="user-card">
            <div className="user-avatar">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className="user-info">
              <h3>User {user.user_id}</h3>
              <p>{user.history_count} ratings</p>
            </div>
          </Link>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          {currentPage > 1 ? (
            <Link href={`/users?page=${currentPage - 1}`} className="btn-secondary">
              Previous
            </Link>
          ) : (
            <button className="btn-secondary disabled" disabled>Previous</button>
          )}
          
          <span className="page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          
          {currentPage < totalPages ? (
            <Link href={`/users?page=${currentPage + 1}`} className="btn-secondary">
              Next
            </Link>
          ) : (
            <button className="btn-secondary disabled" disabled>Next</button>
          )}
        </div>
      )}
    </section>
  );
}