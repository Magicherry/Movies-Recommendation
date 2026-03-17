export type Movie = {
  item_id: number;
  title: string;
  scraped_title?: string;
  genres: string;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
  tmdb_id?: number | string;
  cast?: any[];
  directors?: any[];
};

export type Recommendation = Movie & {
  score: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

function isDevMode(): boolean {
  return typeof window !== "undefined" && localStorage.getItem("streamx-dev-mode") === "true";
}

/** When dev mode is on, logs request endpoint and duration after fetch completes. */
async function devFetch(
  url: string,
  options?: RequestInit,
  endpoint?: string,
  params?: unknown
): Promise<Response> {
  const start = performance.now();
  const res = await fetch(url, options);
  if (isDevMode() && endpoint !== undefined) {
    const ms = Math.round(performance.now() - start);
    const paramStr = params !== undefined && params !== "" ? ` ${JSON.stringify(params)}` : "";
    console.log(`[StreamX API] ${endpoint}${paramStr} — ${ms}ms`);
  }
  return res;
}

function formatTitle(title: string): string {
  if (!title) return title;
  // Moves ", The", ", A", or ", An" from the end (before the year) to the front
  // E.g., "Lion King, The (1994)" -> "The Lion King (1994)"
  return title.replace(/^(.*?)(, (The|A|An))(\s*\(\d{4}\))?$/i, (match, baseTitle, _, article, year) => {
    return `${article} ${baseTitle}${year || ""}`;
  });
}

/** Display title: strip non-year parentheticals (e.g. original language), trailing ", The", and the year. */
export function displayMovieTitle(title: string): string {
  if (!title) return title;
  let s = title.replace(/\s*\(([^)]+)\)/g, (_, c) => (/^\d{4}$/.test(c.trim()) ? ` (${c})` : "")).trim();
  // Strip ", The" / ", A" / ", An" even when followed by " (YYYY)" at end
  s = s.replace(/\s*,\s*(The|A|An)(\s*\(\d{4}\))?$/i, (_, __, year) => (year || "").trim()).trim();
  s = s.replace(/\s*\(\d{4}\)$/, "").trim();
  return s;
}

type MovieTitleLike = Pick<Movie, "title" | "scraped_title">;

export function preferredMovieTitle(movie: MovieTitleLike): string {
  const scraped = (movie.scraped_title ?? "").trim();
  return scraped || movie.title;
}

export function displayMovieName(movie: MovieTitleLike): string {
  return displayMovieTitle(preferredMovieTitle(movie));
}

export async function getMovies(
  limit = 50,
  offset = 0,
  query?: string,
  genre?: string,
  year?: string,
  sortBy = "item_id",
  sortOrder = "asc"
): Promise<{ items: Movie[]; total: number }> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  if (query) params.append("q", query);
  if (genre) params.append("genre", genre);
  if (year) params.append("year", year);
  params.append("sort_by", sortBy);
  params.append("sort_order", sortOrder);

  const res = await devFetch(`${API_BASE}/movies?${params.toString()}`, { cache: "no-store" }, "/movies", params.toString());
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg = (errBody as { error?: string }).error || res.statusText || `HTTP ${res.status}`;
    throw new Error(`Failed to fetch movies: ${msg}`);
  }
  const data = await res.json();
  const items = (data.items ?? []).map((m: Movie) => ({
    ...m,
    title: formatTitle(m.title),
    scraped_title: m.scraped_title ? formatTitle(m.scraped_title) : "",
  }));
  return { items, total: data.total ?? 0 };
}

export async function getMovieDetail(itemId: number): Promise<{ movie: Movie; similar: Recommendation[] }> {
  const res = await devFetch(`${API_BASE}/movie/${itemId}`, { cache: "no-store" }, `/movie/${itemId}`);
  if (!res.ok) throw new Error("Failed to fetch movie detail.");
  const data = await res.json();
  if (data.movie) {
    data.movie.title = formatTitle(data.movie.title);
    data.movie.scraped_title = data.movie.scraped_title ? formatTitle(data.movie.scraped_title) : "";
  }
  if (data.similar) {
    data.similar = data.similar.map((m: Recommendation) => ({
      ...m,
      title: formatTitle(m.title),
      scraped_title: m.scraped_title ? formatTitle(m.scraped_title) : "",
    }));
  }
  return data;
}

export async function getUsers(limit = 50, offset = 0): Promise<{ items: { user_id: number; history_count: number }[]; total: number }> {
  const res = await devFetch(`${API_BASE}/users?limit=${limit}&offset=${offset}`, { cache: "no-store" }, "/users", { limit, offset });
  if (!res.ok) throw new Error("Failed to fetch users.");
  return await res.json();
}

export type HistoryItem = Movie & {
  rating: number;
};

export async function getUserHistory(userId: number, fetchAll: boolean = false): Promise<HistoryItem[]> {
  const url = fetchAll ? `${API_BASE}/user/${userId}/history?all=1` : `${API_BASE}/user/${userId}/history`;
  const res = await devFetch(url, { cache: "no-store" }, `/user/${userId}/history`, { fetchAll });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || "Failed to fetch user history.");
  }
  const data = await res.json();
  const history = data.history ?? [];
  return history.map((h: any) => ({
    ...h,
    title: formatTitle(h.title),
    scraped_title: h.scraped_title ? formatTitle(h.scraped_title) : "",
  }));
}

export async function getRecommendations(userId: number, n: number = 10): Promise<Recommendation[]> {
  const res = await devFetch(`${API_BASE}/recommend/${userId}?n=${n}`, { cache: "no-store" }, `/recommend/${userId}`, { n });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || "Failed to fetch recommendations.");
  }
  const data = await res.json();
  const recs = data.recommendations ?? [];
  return recs.map((r: Recommendation) => ({
    ...r,
    title: formatTitle(r.title),
    scraped_title: r.scraped_title ? formatTitle(r.scraped_title) : "",
  }));
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const res = await devFetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, { cache: "no-store" }, "/search", { q: query });
  if (!res.ok) throw new Error("Failed to search movies.");
  const data = await res.json();
  const items = data.items ?? [];
  return items.map((m: Movie) => ({
    ...m,
    title: formatTitle(m.title),
    scraped_title: m.scraped_title ? formatTitle(m.scraped_title) : "",
  }));
}

export async function getPersonMovies(name: string): Promise<Movie[]> {
  const res = await devFetch(`${API_BASE}/person/movies?name=${encodeURIComponent(name)}`, { cache: "no-store" }, "/person/movies", { name });
  if (!res.ok) throw new Error("Failed to fetch person movies.");
  const data = await res.json();
  const items = data.items ?? [];
  return items.map((m: Movie) => ({
    ...m,
    title: formatTitle(m.title),
    scraped_title: m.scraped_title ? formatTitle(m.scraped_title) : "",
  }));
}

export async function getTmdbPerson(personId: number): Promise<any> {
  const res = await devFetch(`${API_BASE}/tmdb/person/${personId}`, { cache: "no-store" }, `/tmdb/person/${personId}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error("Failed to fetch TMDB person details.");
  }
  return res.json();
}

export type TMDBSearchResult = {
  tmdb_id: number;
  title: string;
  release_date: string;
  overview: string;
  poster_url: string;
  backdrop_url: string;
};

export async function tmdbSearch(query: string, year?: string): Promise<{ results: TMDBSearchResult[] }> {
  const params = new URLSearchParams({ q: query });
  if (year) params.append("year", year);
  const res = await devFetch(`${API_BASE}/tmdb/search?${params.toString()}`, { cache: "no-store" }, "/tmdb/search", year ? { q: query, year } : { q: query });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "TMDB search failed.");
  }
  return res.json();
}

export type TMDBImageItem = { file_path: string; url: string; vote_average: number; width: number; height: number };

export async function tmdbMovieImages(tmdbId: number): Promise<{ posters: TMDBImageItem[]; backdrops: TMDBImageItem[] }> {
  const res = await devFetch(`${API_BASE}/tmdb/movie/${tmdbId}/images`, { cache: "no-store" }, `/tmdb/movie/${tmdbId}/images`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Failed to load images.");
  }
  return res.json();
}

export async function movieApplyScrape(
  itemId: number,
  posterUrl: string,
  backdropUrl: string,
  overview: string,
  tmdbId?: number,
  scrapedTitle?: string
): Promise<void> {
  const body: {
    poster_url: string;
    backdrop_url: string;
    overview: string;
    tmdb_id?: number;
    scraped_title?: string;
  } = {
    poster_url: posterUrl,
    backdrop_url: backdropUrl,
    overview,
  };
  if (tmdbId != null && tmdbId !== 0) body.tmdb_id = tmdbId;
  if (scrapedTitle && scrapedTitle.trim()) body.scraped_title = scrapedTitle.trim();
  const res = await devFetch(`${API_BASE}/movie/${itemId}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, `POST /movie/${itemId}/scrape`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Failed to apply metadata.");
  }
}

export async function movieRefreshMetadata(itemId: number): Promise<void> {
  const res = await devFetch(`${API_BASE}/movie/${itemId}/refresh-metadata`, { method: "POST" }, `POST /movie/${itemId}/refresh-metadata`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string; message?: string }).message || (data as { error?: string }).error || "Refresh failed.");
  }
}

export async function movieUpdateImages(itemId: number, posterUrl?: string, backdropUrl?: string): Promise<void> {
  const body: { poster_url?: string; backdrop_url?: string } = {};
  if (posterUrl !== undefined) body.poster_url = posterUrl;
  if (backdropUrl !== undefined) body.backdrop_url = backdropUrl;
  const res = await devFetch(`${API_BASE}/movie/${itemId}/images`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, `POST /movie/${itemId}/images`, Object.keys(body));
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "Failed to update images.");
  }
}
