import type { ContextPackage } from "../context/types";

const EVIDENCE_SATURATION_COUNT = 6;

/**
 * Heuristic confidence derived from the context package itself (spec §33:
 * data completeness, evidence count/quality), not self-reported by the LLM —
 * an LLM grading its own answer is a weaker signal than deriving it from
 * what evidence it was actually given.
 */
export function computeConfidence(context: ContextPackage): number {
  const evidenceCount = context.facts.length + context.memories.length + context.events.length;
  if (evidenceCount === 0) return 0.1;

  const evidenceScore = Math.min(evidenceCount / EVIDENCE_SATURATION_COUNT, 1);

  const similarities = context.memories
    .map((m) => (typeof m.similarity === "number" ? m.similarity : null))
    .filter((s): s is number => s !== null);
  const avgSimilarity = similarities.length
    ? similarities.reduce((sum, s) => sum + s, 0) / similarities.length
    : 0.5;

  const hasStructuredFacts = context.facts.length > 0 ? 1 : 0.6;

  const score = evidenceScore * 0.5 + avgSimilarity * 0.3 + hasStructuredFacts * 0.2;
  return Math.round(Math.min(Math.max(score, 0), 1) * 100) / 100;
}
