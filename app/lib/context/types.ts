export const QUERY_INTENTS = [
  "GENERAL_QUESTION",
  "STORE_ANALYSIS",
  "PRODUCT_ANALYSIS",
  "CUSTOMER_ANALYSIS",
  "INVENTORY_ANALYSIS",
  "SALES_ANALYSIS",
  "MARKETING_ANALYSIS",
  "SEO_ANALYSIS",
  "PRICING_ANALYSIS",
  "PROFIT_ANALYSIS",
  "RECOMMENDATION",
  "ACTION_REQUEST",
  "HISTORICAL_QUERY",
  "COMPARISON",
  "FORECAST",
  "TROUBLESHOOTING",
] as const;

export type QueryIntent = (typeof QUERY_INTENTS)[number];

export type TimeRange = {
  from: Date;
  to: Date;
};

export type ExtractedEntities = {
  productTitles?: string[];
  entityIds?: string[];
};

export type ClassifiedQuery = {
  intent: QueryIntent;
  entities: ExtractedEntities;
  timeRange: TimeRange | null;
};

export type StructuredFact = {
  sourceType: string;
  sourceId: string;
  summary: string;
  data: Record<string, unknown>;
};

export type ContextSource = {
  sourceType: string;
  sourceId: string;
  timestamp: string | null;
};

/** The shape returned by buildContext() — spec §44. */
export type ContextPackage = {
  intent: QueryIntent;
  entities: ExtractedEntities;
  facts: StructuredFact[];
  metrics: Record<string, unknown>;
  events: Array<Record<string, unknown>>;
  // General semantic memories (PRODUCT, CUSTOMER, MERCHANT_PREFERENCE, DOCUMENT, etc.) —
  // INSIGHT/DECISION/OUTCOME memories are split out into their own fields below instead.
  memories: Array<Record<string, unknown>>;
  insights: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  outcomes: Array<Record<string, unknown>>;
  sources: ContextSource[];
};

/** A normalized, scorable unit from any retrieval strategy, used only during ranking/budgeting. */
export type ContextItem = {
  sourceType: "structured_fact" | "memory" | "event" | "metric";
  sourceId: string;
  timestamp: Date | null;
  semanticSimilarity: number;
  entityRelevance: number;
  importance: number;
  confidence: number;
  payload: unknown;
};
