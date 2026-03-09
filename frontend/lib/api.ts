export type Movie = {
  item_id: number;
  title: string;
  genres: string;
  poster_url?: string;
  backdrop_url?: string;
  overview?: string;
};

export type Recommendation = Movie & {
  score: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8001/api";

function formatTitle(title: string): string {
  if (!title) return title;
  // Moves ", The", ", A", or ", An" from the end (before the year) to the front
  // E.g., "Lion King, The (1994)" -> "The Lion King (1994)"
  return title.replace(/^(.*?)(, (The|A|An))(\s*\(\d{4}\))?$/i, (match, baseTitle, _, article, year) => {
    return `${article} ${baseTitle}${year || ""}`;
  });
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

  const res = await fetch(`${API_BASE}/movies?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch movies.");
  const data = await res.json();
  const items = (data.items ?? []).map((m: Movie) => ({ ...m, title: formatTitle(m.title) }));
  return { items, total: data.total ?? 0 };
}

export async function getMovieDetail(itemId: number): Promise<{ movie: Movie; similar: Recommendation[] }> {
  const res = await fetch(`${API_BASE}/movie/${itemId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch movie detail.");
  const data = await res.json();
  if (data.movie) data.movie.title = formatTitle(data.movie.title);
  if (data.similar) data.similar = data.similar.map((m: Recommendation) => ({ ...m, title: formatTitle(m.title) }));
  return data;
}

export async function getUsers(limit = 50, offset = 0): Promise<{ items: { user_id: number; history_count: number }[]; total: number }> {
  const res = await fetch(`${API_BASE}/users?limit=${limit}&offset=${offset}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch users.");
  return await res.json();
}

export async function getUserHistory(userId: number, fetchAll: boolean = false): Promise<{ item_id: number; title: string; genres: string; rating: number }[]> {
  const url = fetchAll ? `${API_BASE}/user/${userId}/history?all=1` : `${API_BASE}/user/${userId}/history`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || "Failed to fetch user history.");
  }
  const data = await res.json();
  const history = data.history ?? [];
  return history.map((h: any) => ({ ...h, title: formatTitle(h.title) }));
}

export async function getRecommendations(userId: number): Promise<Recommendation[]> {
  const res = await fetch(`${API_BASE}/recommend/${userId}`, { cache: "no-store" });
  if (!res.ok) {
    const errData = await res.json().catch(() => null);
    throw new Error(errData?.error || "Failed to fetch recommendations.");
  }
  const data = await res.json();
  const recs = data.recommendations ?? [];
  return recs.map((r: Recommendation) => ({ ...r, title: formatTitle(r.title) }));
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to search movies.");
  const data = await res.json();
  const items = data.items ?? [];
  return items.map((m: Movie) => ({ ...m, title: formatTitle(m.title) }));
}
