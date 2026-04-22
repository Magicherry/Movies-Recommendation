import NextLink from "next/link";
import type { ReactNode } from "react";
import type { RecommendationReason, RecommendationReasonMention } from "../lib/api";
import { buildMovieDetailHref, type MovieDetailContextMode } from "../lib/movie-detail-context";

const SOURCE_LABELS: Record<string, string> = {
  collaborative_similarity: "Collaborative",
  content_match: "Content",
  behavior_signal: "Behavior",
  personal_match: "Personalized",
};

type WhyRecommendedSectionProps = {
  reasons: RecommendationReason[];
  eyebrow?: string;
  title?: string;
  summary?: string;
  currentItemId?: number;
  detailContext?: MovieDetailContextMode;
  detailUserId?: number;
  detailSourceItemId?: number;
};

function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? "Insight";
}

function getSourceClassName(source: string): string {
  return source.replace(/_/g, "-");
}

function getSourceIcon(source: string): ReactNode {
  if (source === "collaborative_similarity") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 18a4 4 0 0 0-8 0"></path>
        <circle cx="12" cy="11" r="3"></circle>
        <path d="M19 18a3 3 0 0 0-2.2-2.88"></path>
        <path d="M7.2 15.12A3 3 0 0 0 5 18"></path>
      </svg>
    );
  }

  if (source === "content_match") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H20"></path>
        <path d="M4 12.5A2.5 2.5 0 0 1 6.5 10H20"></path>
        <path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"></path>
      </svg>
    );
  }

  if (source === "behavior_signal") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19h16"></path>
        <path d="M7 16V9"></path>
        <path d="M12 16V5"></path>
        <path d="M17 16v-3"></path>
      </svg>
    );
  }

  if (source === "personal_match") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.35l6.03-.88Z"></path>
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8"></circle>
      <path d="M12 8v4"></path>
      <path d="M12 16h.01"></path>
    </svg>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getGenreTerms(reason: RecommendationReason): string[] {
  const rawGenres = reason.metadata?.genres;
  if (typeof rawGenres !== "string") {
    return [];
  }

  return rawGenres
    .split(/\s*,\s*|\s+and\s+/i)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .sort((left, right) => right.length - left.length);
}

function getMentionedItems(reason: RecommendationReason): RecommendationReasonMention[] {
  const rawMentions = reason.metadata?.mentioned_items;
  if (!Array.isArray(rawMentions)) {
    return [];
  }

  return rawMentions.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const itemId = "item_id" in entry ? Number(entry.item_id) : NaN;
    const title = "title" in entry ? String(entry.title).trim() : "";
    if (!Number.isInteger(itemId) || itemId <= 0 || !title) {
      return [];
    }

    return [{ item_id: itemId, title }];
  });
}

function extractMovieTitleTerms(text: string): string[] {
  const matchers = [
    /(?:sits close to|overlaps with)\s+(.+?)\s+(?:in the model's learned item space|which helps the system place it near related movies)/i,
    /(?:rated both|interacted with both)\s+(.+?)\s*,/i,
    /places\s+(.+?)\s+close to\s+(.+?)\s+in item space/i,
    /(.+?)\s+overlaps with\s+(.+?)\s+on\s+.+?,/i,
  ];
  const titles = new Set<string>();

  for (const matcher of matchers) {
    const match = text.match(matcher);
    if (!match) {
      continue;
    }

    for (const group of match.slice(1)) {
      if (!group) {
        continue;
      }

      for (const part of group.split(/\s+and\s+/i)) {
        const cleaned = part.trim().replace(/^[,.\s]+|[,.\s]+$/g, "");
        if (cleaned.length >= 2) {
          titles.add(cleaned);
        }
      }
    }
  }

  return Array.from(titles).sort((left, right) => right.length - left.length);
}

function buildMentionHref(
  mentionedItemId: number,
  detailContext: MovieDetailContextMode,
  detailUserId?: number,
  detailSourceItemId?: number,
  currentItemId?: number
): string {
  if (detailContext === "recommended") {
    return buildMovieDetailHref(mentionedItemId, {
      context: "recommended",
      userId: detailUserId,
    });
  }

  if (detailContext === "similar") {
    const resolvedSourceItemId =
      mentionedItemId === detailSourceItemId && Number.isInteger(currentItemId) && Number(currentItemId) > 0
        ? currentItemId
        : detailSourceItemId;

    return buildMovieDetailHref(mentionedItemId, {
      context: "similar",
      sourceItemId: resolvedSourceItemId,
    });
  }

  return buildMovieDetailHref(mentionedItemId, { context: "neutral" });
}

function renderReasonText(
  reason: RecommendationReason,
  detailContext: MovieDetailContextMode,
  detailUserId?: number,
  detailSourceItemId?: number,
  currentItemId?: number
): ReactNode {
  const text = reason.short_explanation;
  const genreTerms = getGenreTerms(reason);
  const mentionedItems = getMentionedItems(reason);
  const movieTitleTerms =
    mentionedItems.length > 0
      ? mentionedItems.map((item) => item.title).sort((left, right) => right.length - left.length)
      : extractMovieTitleTerms(text);
  const genreSet = new Set(genreTerms.map((term) => term.toLowerCase()));
  const movieTitleMap = new Map(mentionedItems.map((item) => [item.title.toLowerCase(), item]));
  const tokenPatterns: string[] = [];

  if (movieTitleTerms.length > 0) {
    tokenPatterns.push(`(${movieTitleTerms.map((term) => escapeRegExp(term)).join("|")})`);
  }
  if (genreTerms.length > 0) {
    tokenPatterns.push(`(${genreTerms.map((term) => escapeRegExp(term)).join("|")})`);
  }
  tokenPatterns.push(String.raw`(\b\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?\b)`);

  const tokenRegex = new RegExp(tokenPatterns.join("|"), "gi");
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of text.matchAll(tokenRegex)) {
    const value = match[0];
    const start = match.index ?? 0;

    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    const normalizedValue = value.toLowerCase();
    const mentionedItem = movieTitleMap.get(normalizedValue);
    const isMovieTitleToken = movieTitleTerms.some((term) => term.toLowerCase() === normalizedValue);
    const isGenreToken = genreSet.has(normalizedValue);
    if (mentionedItem) {
      parts.push(
        <NextLink
          key={`highlight-${reason.id}-${tokenIndex}`}
          href={buildMentionHref(
            mentionedItem.item_id,
            detailContext,
            detailUserId,
            detailSourceItemId,
            currentItemId
          )}
          className="why-recommended-inline-highlight why-recommended-inline-highlight--title why-recommended-inline-highlight--title-link"
        >
          {value}
        </NextLink>
      );
    } else {
      parts.push(
        <span
          key={`highlight-${reason.id}-${tokenIndex}`}
          className={
            isMovieTitleToken
              ? "why-recommended-inline-highlight why-recommended-inline-highlight--title"
              : isGenreToken
              ? "why-recommended-inline-highlight why-recommended-inline-highlight--genre"
              : "why-recommended-inline-highlight why-recommended-inline-highlight--metric"
          }
        >
          {value}
        </span>
      );
    }

    lastIndex = start + value.length;
    tokenIndex += 1;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function WhyRecommendedSection({
  reasons,
  eyebrow = "Recommendation Signals",
  title = "Why Recommended",
  summary,
  currentItemId,
  detailContext = "neutral",
  detailUserId,
  detailSourceItemId,
}: WhyRecommendedSectionProps) {
  const visibleReasons = reasons.filter((reason) => reason.title && reason.short_explanation);

  if (visibleReasons.length === 0) {
    return null;
  }

  return (
    <section className="why-recommended-section" aria-labelledby="why-recommended-heading">
      <div className="why-recommended-header">
        <div>
          <p className="why-recommended-eyebrow">{eyebrow}</p>
          <h2 id="why-recommended-heading" className="why-recommended-title">
            {title}
          </h2>
        </div>
        <p className="why-recommended-summary">
          {summary || "A quick view of the strongest signals that help this title stand out in the current recommendation system."}
        </p>
      </div>

      <div className="why-recommended-grid">
        {visibleReasons.map((reason) => {
          const sourceClassName = getSourceClassName(reason.source);

          return (
            <article
              key={reason.id}
              className={`why-recommended-card why-recommended-card--${sourceClassName}`}
            >
              <div className="why-recommended-card-top">
                <span
                  className={`why-recommended-badge why-recommended-badge--${sourceClassName}`}
                >
                  {getSourceLabel(reason.source)}
                </span>
                <span className="why-recommended-card-index" aria-hidden="true">
                  {getSourceIcon(reason.source)}
                </span>
              </div>
              <div className="why-recommended-card-body">
                <h3 className="why-recommended-card-title">{reason.title}</h3>
                <p className="why-recommended-card-text">
                  {renderReasonText(
                    reason,
                    detailContext,
                    detailUserId,
                    detailSourceItemId,
                    currentItemId
                  )}
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
