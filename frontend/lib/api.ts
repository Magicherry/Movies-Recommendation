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

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api";

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
  return { items: data.items ?? [], total: data.total ?? 0 };
}

export async function getMovieDetail(itemId: number): Promise<{ movie: Movie; similar: Recommendation[] }> {
  const res = await fetch(`${API_BASE}/movie/${itemId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch movie detail.");
  return await res.json();
}

export async function getUsers(limit = 50, offset = 0): Promise<{ items: { user_id: number; history_count: number }[]; total: number }> {
  const res = await fetch(`${API_BASE}/users?limit=${limit}&offset=${offset}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch users.");
  return await res.json();
}

export async function getUserHistory(userId: number): Promise<{ item_id: number; title: string; genres: string; rating: number }[]> {
  const res = await fetch(`${API_BASE}/user/${userId}/history`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch user history.");
  const data = await res.json();
  return data.history ?? [];
}

export async function getRecommendations(userId: number): Promise<Recommendation[]> {
  const res = await fetch(`${API_BASE}/recommend/${userId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch recommendations.");
  const data = await res.json();
  return data.recommendations ?? [];
}

export async function searchMovies(query: string): Promise<Movie[]> {
  const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to search movies.");
  const data = await res.json();
  return data.items ?? [];
}
