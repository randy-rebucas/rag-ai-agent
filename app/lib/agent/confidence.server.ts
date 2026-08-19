import type { ContextPackage } from "../context/types";

const EVIDENCE_SATURATION_COUNT = 6;

/**
 * Heuristic confidence derived from the context package itself (spec §33:
 * data completeness, evidence count/quality), not self-reported by the LLM —
 * an LLM grading its own answer is a weaker signal than deriving it from
 * what evidence it was actually given.
 */
export function computeConfidence(context: ContextPackage): number {
  const evidenceCount =
    context.facts.length +
    context.memories.length +
    context.events.length +
    context.insights.length +
    context.decisions.length +
    context.outcomes.length;
  if (evidenceCount === 0) return 0.1;

  const evidenceScore = Math.min(evidenceCount / EVIDENCE_SATURATION_COUNT, 1);

  const similarities = [...context.memories, ...context.insights, ...context.decisions, ...context.outcomes]
    .map((m) => (typeof m.similarity === "number" ? m.similarity : null))
    .filter((s): s is number => s !== null);
  const avgSimilarity = similarities.length
    ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
    : 0.5;

  const hasStructuredFacts = context.facts.length > 0 ? 1 : 0.6;

  // Temporal consistency (spec §33): is the evidence backing this answer
  // actually current? Reuses the freshness signal rather than a second
  // independent computation — a stale sync is exactly what "temporally
  // inconsistent with reality" means for this app's data.
  const temporalConsistency =
    context.dataFreshness === "REALTIME" ? 1 : context.dataFreshness === "RECENT" ? 0.8 : context.dataFreshness === "STALE" ? 0.4 : 0.5;

  // Contradictory evidence (spec §33): prior outcomes for the same tool
  // disagreeing with each other is a direct, literal contradiction signal —
  // unlike most heuristics here this isn't a proxy, it's the real thing.
  const positiveOutcomes = context.outcomes.filter((o) => o.metadata && (o.metadata as { outcome?: string }).outcome === "positive").length;
  const negativeOutcomes = context.outcomes.filter((o) => o.metadata && (o.metadata as { outcome?: string }).outcome === "negative").length;
  const hasContradictoryOutcomes = positiveOutcomes > 0 && negativeOutcomes > 0;
  const contradictionPenalty = hasContradictoryOutcomes ? 0.7 : 1;

  const score =
    (evidenceScore * 0.4 + avgSimilarity * 0.25 + hasStructuredFacts * 0.15 + temporalConsistency * 0.2) * contradictionPenalty;
  return Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;
}
