export type Movie = {
  item_id: number;
  title: string;
  scraped_title?: string;
  genres: string;
  poster_url?: string;
  backdrop_url?: string;
  logo_url?: string;
  overview?: string;
  tmdb_id?: number | string;
  cast?: any[];
  directors?: any[];
};

export type Recommendation = Movie & {
  score: number;
  score_source?: "model" | "fallback_rating" | "fallback_similarity" | "fallback_behavior" | string;
  is_fallback_score?: boolean;
};

export type RecommendationReasonMention = {
  item_id: number;
  title: string;
};

export type RecommendationReason = {
  id: string;
  source: "collaborative_similarity" | "content_match" | "behavior_signal" | "personal_match" | string;
  title: string;
  short_explanation: string;
  score?: number;
  metadata?: Record<string, unknown>;
};

export type MovieDetailResponse = {
  movie: Movie;
  similar: Recommendation[];
  why_recommended: RecommendationReason[];
};

export type MovieReasonRequestOptions = {
  userId?: number;
  mode?: "recommended" | "similar" | "neutral";
  referenceItemId?: number;
};

const DEFAULT_API_BASE = "http://127.0.0.1:8001/api";
const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE;

function resolveApiBase(rawBase: string): string {
  const normalizedBase = (rawBase || DEFAULT_API_BASE).trim().replace(/\/+$/, "") || DEFAULT_API_BASE;
  // On Windows + Node SSR, localhost may resolve to ::1 while Django listens on 127.0.0.1.
  if (typeof window === "undefined") {
    return normalizedBase.replace(/^http:\/\/localhost(?=[:/]|$)/i, "http://127.0.0.1");
  }
  return normalizedBase;
}

const API_BASE = resolveApiBase(RAW_API_BASE);

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
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown network error";
    const target = endpoint ?? url;
    throw new Error(
      `Cannot reach backend API at ${API_BASE}. Check that backend is running and NEXT_PUBLIC_API_BASE_URL is correct. Request: ${target}. Cause: ${reason}`
    );
  }
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
  sortBy = "year",
  sortOrder = "desc"
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

export async function getMovieDetail(
  itemId: number,
  similarLimit: number = 100,
  options: MovieReasonRequestOptions = {}
): Promise<MovieDetailResponse> {
  const safeLimit = Number.isFinite(similarLimit) ? Math.max(1, Math.min(200, Math.floor(similarLimit))) : 100;
  const params = new URLSearchParams({ n: safeLimit.toString() });
  if (options.mode === "neutral") {
    params.set("mode", "neutral");
  } else if (options.mode === "similar" && Number.isInteger(options.referenceItemId) && Number(options.referenceItemId) > 0) {
    params.set("mode", "similar");
    params.set("reference_item_id", String(options.referenceItemId));
  } else if (Number.isInteger(options.userId) && Number(options.userId) > 0) {
    params.set("user_id", String(options.userId));
  }
  const res = await devFetch(
    `${API_BASE}/movie/${itemId}?${params.toString()}`,
    { cache: "no-store" },
    `/movie/${itemId}`,
    options.mode === "neutral"
      ? { n: safeLimit, mode: "neutral" }
      : options.mode === "similar" && options.referenceItemId
      ? { n: safeLimit, mode: "similar", reference_item_id: options.referenceItemId }
      : options.userId
        ? { n: safeLimit, user_id: options.userId }
        : { n: safeLimit }
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message =
      (errBody as { error?: string; message?: string }).error ||
      (errBody as { error?: string; message?: string }).message ||
      (res.status === 404 ? `Movie ${itemId} not found.` : "Failed to fetch movie detail.");
    const error = new Error(message) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
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
  data.why_recommended = Array.isArray(data.why_recommended) ? data.why_recommended : [];
  return data;
}

export async function getMovieRecommendationReasons(
  itemId: number,
  options: MovieReasonRequestOptions = {}
): Promise<RecommendationReason[]> {
  const params = new URLSearchParams();
  if (options.mode === "neutral") {
    params.set("mode", "neutral");
  } else if (options.mode === "similar" && Number.isInteger(options.referenceItemId) && Number(options.referenceItemId) > 0) {
    params.set("mode", "similar");
    params.set("reference_item_id", String(options.referenceItemId));
  } else if (Number.isInteger(options.userId) && Number(options.userId) > 0) {
    params.set("user_id", String(options.userId));
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await devFetch(
    `${API_BASE}/movie/${itemId}/why-recommended${suffix}`,
    { cache: "no-store" },
    `/movie/${itemId}/why-recommended`,
    options.mode === "neutral"
      ? { mode: "neutral" }
      : options.mode === "similar" && options.referenceItemId
      ? { mode: "similar", reference_item_id: options.referenceItemId }
      : options.userId
        ? { user_id: options.userId }
        : undefined
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const message =
      (errBody as { error?: string; message?: string }).error ||
      (errBody as { error?: string; message?: string }).message ||
      "Failed to fetch recommendation reasons.";
    throw new Error(message);
  }

  const data = await res.json();
  return Array.isArray(data.why_recommended) ? data.why_recommended : [];
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

export type ModelPreloadResponse = {
  active_model: string;
  active_model_load_status: "ready" | "error";
  active_model_ready: boolean;
};

export async function preloadActiveModel(): Promise<ModelPreloadResponse> {
  const res = await devFetch(`${API_BASE}/model-preload`, { cache: "no-store" }, "/model-preload");
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || "Failed to preload active model.");
  }
  return res.json();
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
  logo_url?: string;
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

export async function tmdbMovieImages(tmdbId: number): Promise<{ posters: TMDBImageItem[]; backdrops: TMDBImageItem[]; logos: TMDBImageItem[] }> {
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

export async function movieUpdateImages(itemId: number, posterUrl?: string, backdropUrl?: string, logoUrl?: string): Promise<void> {
  const body: { poster_url?: string; backdrop_url?: string; logo_url?: string } = {};
  if (posterUrl !== undefined) body.poster_url = posterUrl;
  if (backdropUrl !== undefined) body.backdrop_url = backdropUrl;
  if (logoUrl !== undefined) body.logo_url = logoUrl;
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
