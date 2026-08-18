import type { ContextItem } from "./types";

/** Spec §18's weighted ranking formula. Configurable, not hardcoded magic numbers inline. */
export const RANKING_WEIGHTS = {
  semanticSimilarity: 0.3,
  entityRelevance: 0.2,
  recency: 0.15,
  importance: 0.15,
  confidence: 0.1,
  temporalRelevance: 0.1,
};

const RECENCY_HALF_LIFE_DAYS = 14;

function recencyScore(timestamp: Date | null): number {
  if (!timestamp) return 0;
  const ageDays = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

export function scoreContextItem(item: ContextItem): number {
  const recency = recencyScore(item.timestamp);
  // Temporal relevance and recency both derive from age today (no separate
  // "does this fall inside the query's time window" signal yet — that
  // requires threading the query's timeRange into scoring, deferred until
  // a caller actually needs to distinguish the two).
  const temporalRelevance = recency;

  return (
    item.semanticSimilarity * RANKING_WEIGHTS.semanticSimilarity +
    item.entityRelevance * RANKING_WEIGHTS.entityRelevance +
    recency * RANKING_WEIGHTS.recency +
    item.importance * RANKING_WEIGHTS.importance +
    item.confidence * RANKING_WEIGHTS.confidence +
    temporalRelevance * RANKING_WEIGHTS.temporalRelevance
  );
}

/** Ranks items highest-score-first. Pure function — no I/O, no dedupe (that's the caller's job). */
export function rankContextItems(items: ContextItem[]): Array<ContextItem & { score: number }> {
  return items
    .map((item) => ({ ...item, score: scoreContextItem(item) }))
    .sort((a, b) => b.score - a.score);
}
