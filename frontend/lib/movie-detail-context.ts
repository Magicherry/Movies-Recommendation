export type MovieDetailContextMode = "neutral" | "recommended" | "similar";

export type MovieDetailLinkOptions = {
  context?: MovieDetailContextMode;
  userId?: number;
  sourceItemId?: number;
};

export function normalizeMovieDetailContext(raw: string | null | undefined): MovieDetailContextMode {
  if (raw === "recommended" || raw === "similar") {
    return raw;
  }
  return "neutral";
}

export function parsePositiveIntParam(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function buildMovieDetailHref(
  itemId: number,
  options: MovieDetailLinkOptions = {}
): string {
  const params = new URLSearchParams();
  const context = normalizeMovieDetailContext(options.context);

  if (context !== "neutral") {
    params.set("context", context);
  }
  if (context === "recommended" && Number.isInteger(options.userId) && Number(options.userId) > 0) {
    params.set("user", String(options.userId));
  }
  if (context === "similar" && Number.isInteger(options.sourceItemId) && Number(options.sourceItemId) > 0) {
    params.set("source_item", String(options.sourceItemId));
  }

  const query = params.toString();
  return query ? `/movies/${itemId}?${query}` : `/movies/${itemId}`;
}
