import { classifyQuery } from "./intent.server";
import { getStructuredFacts } from "./structured-retrieval.server";
import { getSalesMetrics } from "./analytics.server";
import { searchMemory } from "../memory/memory.server";
import { getActivityHistory } from "../shopify-data/activity.server";
import { rankContextItems } from "./ranking.server";
import type { ContextItem, ContextPackage, ContextSource, StructuredFact, TimeRange } from "./types";
import type { SalesMetrics } from "./analytics.server";

const ITEM_BUDGET = 20;
const MEMORY_LIMIT = 10;
const EVENT_LIMIT = 20;

export type BuildContextInput = {
  shopId: string;
  query: string;
  userId?: string;
};

/**
 * Each retrieval strategy is independent; one failing (LLM/vector-DB/DB
 * unavailable — spec §41) must not take down the others. Falls back to an
 * empty/zeroed result and logs, rather than rejecting the whole context build.
 */
async function safely<T>(label: string, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(`Context Engine: ${label} retrieval failed, using fallback:`, error);
    return fallback;
  }
}

function emptySalesMetrics(timeRange: TimeRange | null): SalesMetrics {
  return { orderCount: 0, totalRevenue: 0, averageOrderValue: 0, timeRange };
}

/**
 * The Context Engine's public entry point (spec §44). Classifies the query,
 * runs structured + semantic + temporal + analytical retrieval in parallel,
 * ranks and budgets the combined results, and returns one compact package.
 */
export async function buildContext({ shopId, query }: BuildContextInput): Promise<ContextPackage> {
  const classified = await classifyQuery(query);

  const [facts, memories, events, metrics] = await Promise.all([
    safely("structured", [], () => getStructuredFacts(shopId, classified)),
    safely("semantic", [], () => searchMemory(shopId, query, { limit: MEMORY_LIMIT })),
    safely("temporal", [], () =>
      getActivityHistory(shopId, {
        since: classified.timeRange?.from,
        until: classified.timeRange?.to,
        limit: EVENT_LIMIT,
      }),
    ),
    safely("analytical", emptySalesMetrics(classified.timeRange), () =>
      getSalesMetrics(shopId, classified.timeRange),
    ),
  ]);

  const items: ContextItem[] = [
    ...facts.map((fact): ContextItem => ({
      sourceType: "structured_fact",
      sourceId: `${fact.sourceType}:${fact.sourceId}`,
      timestamp: null,
      semanticSimilarity: 0,
      entityRelevance: 1,
      importance: 0.6,
      confidence: 1,
      payload: fact,
    })),
    ...memories.map((memory): ContextItem => ({
      sourceType: "memory",
      sourceId: memory.id,
      timestamp: memory.createdAt,
      semanticSimilarity: memory.similarity,
      entityRelevance: memory.entityType ? 0.7 : 0.3,
      importance: memory.importance ?? 0.5,
      confidence: memory.confidence ?? 0.7,
      payload: memory,
    })),
    ...events.map((event): ContextItem => ({
      sourceType: "event",
      sourceId: event.id,
      timestamp: event.occurredAt,
      semanticSimilarity: 0,
      entityRelevance: event.entityId ? 0.6 : 0.2,
      importance: 0.4,
      confidence: 0.9,
      payload: event,
    })),
  ];

  const ranked = rankContextItems(items);

  const seen = new Set<string>();
  const budgeted = ranked.filter((item) => {
    const key = `${item.sourceType}:${item.sourceId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, ITEM_BUDGET);

  const budgetedFacts = budgeted
    .filter((item) => item.sourceType === "structured_fact")
    .map((item) => item.payload as StructuredFact);
  const allMemories = budgeted
    .filter((item) => item.sourceType === "memory")
    .map((item) => item.payload as Record<string, unknown> & { memoryType?: string });

  // Spec §13's example package separates decisions/outcomes/insights from
  // general semantic memory — they all come from the same searchMemory call,
  // just partitioned by memoryType rather than fetched separately.
  const budgetedMemories = allMemories.filter(
    (m) => m.memoryType !== "INSIGHT" && m.memoryType !== "DECISION" && m.memoryType !== "OUTCOME",
  );
  const budgetedInsights = allMemories.filter((m) => m.memoryType === "INSIGHT");
  const budgetedDecisions = allMemories.filter((m) => m.memoryType === "DECISION");
  const budgetedOutcomes = allMemories.filter((m) => m.memoryType === "OUTCOME");
  const budgetedEvents = budgeted
    .filter((item) => item.sourceType === "event")
    .map((item) => item.payload as Record<string, unknown>);

  const sources: ContextSource[] = budgeted.map((item) => ({
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    timestamp: item.timestamp ? item.timestamp.toISOString() : null,
  }));

  return {
    intent: classified.intent,
    entities: classified.entities,
    facts: budgetedFacts,
    metrics: { sales: metrics },
    events: budgetedEvents,
    memories: budgetedMemories,
    insights: budgetedInsights,
    decisions: budgetedDecisions,
    outcomes: budgetedOutcomes,
    sources,
  };
}
