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
    <section className="content-padding" style={{ paddingTop: "60px" }}>
      <div className="results-header" style={{ marginTop: 0, marginBottom: "30px" }}>
        <div>
          <h1 className="row-header" style={{ fontSize: "2.5rem", paddingLeft: "0", marginBottom: "16px" }}>Browse Users</h1>
          <p className="helper-text" style={{ color: "var(--text-subtle)", margin: 0 }}>
            Select a user profile to see their highly rated movies and customized recommendations.
            ({data.total} users total)
          </p>
        </div>

        {totalPages > 1 && (
          <div className="pagination pagination-top">
            {currentPage > 1 ? (
              <Link href={`/users?page=${currentPage - 1}`} className="btn-secondary">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Prev
              </Link>
            ) : (
              <button className="btn-secondary disabled" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
                Prev
              </button>
            )}
            
            <form action="/users" method="GET" style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "nowrap" }}>
              <span className="page-indicator">Page</span>
              <input 
                type="number" 
                name="page" 
                defaultValue={currentPage} 
                min={1}
                max={totalPages}
              />
              <span className="page-indicator">of {totalPages}</span>
              <button type="submit" style={{ display: "none" }}>Go</button>
            </form>
            
            {currentPage < totalPages ? (
              <Link href={`/users?page=${currentPage + 1}`} className="btn-secondary">
                Next
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </Link>
            ) : (
              <button className="btn-secondary disabled" disabled>
                Next
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="user-grid">
        {data.items.map((user) => (
          <Link key={user.user_id} href={`/users/${user.user_id}`} className="user-card">
            <div className="user-avatar">
              <img 
                src={`https://api.dicebear.com/7.x/adventurer/svg?seed=${user.user_id}`} 
                alt={`User ${user.user_id}`}
                style={{ width: '100%', height: '100%', borderRadius: '50%' }}
              />
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
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Prev
            </Link>
          ) : (
            <button className="btn-secondary disabled" disabled>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              Prev
            </button>
          )}
          
          <form action="/users" method="GET" style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "nowrap" }}>
            <span className="page-indicator">Page</span>
            <input 
              type="number" 
              name="page" 
              defaultValue={currentPage} 
              min={1}
              max={totalPages}
            />
            <span className="page-indicator">of {totalPages}</span>
            <button type="submit" style={{ display: "none" }}>Go</button>
          </form>
          
          {currentPage < totalPages ? (
            <Link href={`/users?page=${currentPage + 1}`} className="btn-secondary">
              Next
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </Link>
          ) : (
            <button className="btn-secondary disabled" disabled>
              Next
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          )}
        </div>
      )}
    </section>
  );
}