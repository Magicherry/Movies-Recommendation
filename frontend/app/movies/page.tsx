import { getMovies } from "../../lib/api";
import MovieCardGrid from "../../components/movie-card-grid";
import Link from "next/link";

export default async function MoviesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const page = typeof searchParams.page === "string" ? parseInt(searchParams.page, 10) : 1;
  const q = typeof searchParams.q === "string" ? searchParams.q : undefined;
  const genre = typeof searchParams.genre === "string" ? searchParams.genre : undefined;
  const year = typeof searchParams.year === "string" ? searchParams.year : undefined;
  const sort = typeof searchParams.sort === "string" ? searchParams.sort : "item_id_asc";
  const sortOptions = new Set([
    "item_id_asc",
    "item_id_desc",
    "title_asc",
    "title_desc",
    "year_asc",
    "year_desc",
  ]);
  const currentSort = sortOptions.has(sort) ? sort : "item_id_asc";
  const sortSplitIdx = currentSort.lastIndexOf("_");
  const sortBy = currentSort.slice(0, sortSplitIdx);
  const sortOrder = currentSort.slice(sortSplitIdx + 1);

  const limit = 48;
  const offset = (page - 1) * limit;

  const data = await getMovies(limit, offset, q, genre, year, sortBy, sortOrder);
  const totalPages = Math.ceil(data.total / limit);

  // Common genres for the dropdown
  const allGenres = [
    "Action", "Adventure", "Animation", "Children", "Comedy", 
    "Crime", "Documentary", "Drama", "Fantasy", "Film-Noir", 
    "Horror", "Musical", "Mystery", "Romance", "Sci-Fi", 
    "Thriller", "War", "Western"
  ];

  return (
    <div className="content-padding" style={{ paddingTop: "60px", minHeight: "100vh" }}>
      <h1 className="row-header" style={{ fontSize: "2.5rem", marginBottom: "30px", paddingLeft: "0" }}>
        Browse Movies
      </h1>

      <form action="/movies" method="GET" className="filter-form">
        <div className="filter-group-main">
          <div className="search-input-wrapper">
            <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              name="q" 
              defaultValue={q} 
              placeholder="Search movies by title..." 
              className="search-input custom-search-input"
            />
          </div>
          <button type="submit" className="btn-primary search-btn">
            Search
          </button>
        </div>
        
        <div className="filter-group-secondary">
          <div className="select-wrapper">
            <select name="genre" defaultValue={genre || ""} className="filter-select">
              <option value="">All Genres</option>
              {allGenres.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <svg className="select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <div className="select-wrapper">
            <select key={currentSort} name="sort" defaultValue={currentSort} className="filter-select">
              <option value="item_id_asc">Default (Oldest ID)</option>
              <option value="item_id_desc">Newest ID</option>
              <option value="title_asc">Title A-Z</option>
              <option value="title_desc">Title Z-A</option>
              <option value="year_desc">Year New-Old</option>
              <option value="year_asc">Year Old-New</option>
            </select>
            <svg className="select-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>

          <div className="year-wrapper">
            <input 
              type="text" 
              name="year" 
              defaultValue={year} 
              placeholder="Year (e.g. 1995)" 
              className="search-input year-input"
              maxLength={4}
            />
          </div>
          
          {(q || genre || year || currentSort !== "item_id_asc") && (
            <Link href="/movies?page=1&sort=item_id_asc" className="btn-clear-filter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
              Clear
            </Link>
          )}
        </div>
      </form>

      <div style={{ marginTop: "40px" }}>
        <p style={{ color: "var(--text-subtle)", marginBottom: "20px" }}>
          Found {data.total} movies
        </p>
        <MovieCardGrid items={data.items} />
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <Link
            href={`/movies?page=${page > 1 ? page - 1 : 1}${q ? `&q=${q}` : ''}${genre ? `&genre=${genre}` : ''}${year ? `&year=${year}` : ''}&sort=${currentSort}`}
            className={`btn-secondary ${page <= 1 ? "disabled" : ""}`}
            style={{ pointerEvents: page <= 1 ? "none" : "auto" }}
          >
            Previous
          </Link>
          <span className="page-indicator">
            Page {page} of {totalPages}
          </span>
          <Link
            href={`/movies?page=${page < totalPages ? page + 1 : totalPages}${q ? `&q=${q}` : ''}${genre ? `&genre=${genre}` : ''}${year ? `&year=${year}` : ''}&sort=${currentSort}`}
            className={`btn-secondary ${page >= totalPages ? "disabled" : ""}`}
            style={{ pointerEvents: page >= totalPages ? "none" : "auto" }}
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}