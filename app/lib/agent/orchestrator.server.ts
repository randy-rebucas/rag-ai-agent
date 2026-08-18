import db from "../../db.server";
import type { QueryIntent, StructuredFact } from "../context/types";

export const AGENT_ROLES = [
  "StoreManagerAgent",
  "SalesAgent",
  "MarketingAgent",
  "SEOAgent",
  "InventoryAgent",
  "ProductAgent",
  "CustomerSupportAgent",
  "CROAgent",
  "ProfitAgent",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

const INTENT_TO_AGENT: Record<QueryIntent, AgentRole> = {
  PRODUCT_ANALYSIS: "ProductAgent",
  INVENTORY_ANALYSIS: "InventoryAgent",
  SALES_ANALYSIS: "SalesAgent",
  FORECAST: "SalesAgent",
  MARKETING_ANALYSIS: "MarketingAgent",
  SEO_ANALYSIS: "SEOAgent",
  PROFIT_ANALYSIS: "ProfitAgent",
  PRICING_ANALYSIS: "CROAgent",
  COMPARISON: "CROAgent",
  CUSTOMER_ANALYSIS: "CustomerSupportAgent",
  TROUBLESHOOTING: "CustomerSupportAgent",
  GENERAL_QUESTION: "StoreManagerAgent",
  STORE_ANALYSIS: "StoreManagerAgent",
  RECOMMENDATION: "StoreManagerAgent",
  ACTION_REQUEST: "StoreManagerAgent",
  HISTORICAL_QUERY: "StoreManagerAgent",
};

/** Routes a classified query to the specialist whose framing best fits it. Every agent shares the same buildContext/Memory/Event/Action tables — no isolated knowledge silos (spec §30). */
export function selectAgent(intent: QueryIntent): AgentRole {
  return INTENT_TO_AGENT[intent];
}

export const AGENT_PERSONAS: Record<AgentRole, string> = {
  StoreManagerAgent:
    "You are the Store Manager — you take a whole-business view, coordinate across specialties, and flag when one part of the store's plans conflicts with another (e.g. promoting a product that's low on stock).",
  SalesAgent: "You focus on orders, revenue trends, and sales performance over time.",
  MarketingAgent: "You focus on promotions, discounts, and how marketing activity relates to sales.",
  SEOAgent: "You focus on product discoverability — titles, descriptions, handles, and how findable products are.",
  InventoryAgent: "You focus on stock levels, reorder timing, and fulfillment risk.",
  ProductAgent: "You focus on individual product performance, attributes, and catalog health.",
  CustomerSupportAgent: "You focus on customer records, order issues, and troubleshooting.",
  CROAgent: "You focus on pricing, conversion, and comparisons between products or time periods.",
  ProfitAgent: "You focus on margins, profitability, and cost-conscious recommendations.",
};

const INVENTORY_RISK_LOOKBACK_HOURS = 48;

/**
 * Spec §30's example, implemented with data this app actually has: if the
 * answering agent isn't already InventoryAgent, and a product referenced in
 * this turn's facts has a recent inventory-risk insight, surface a
 * StoreManagerAgent coordination note rather than letting the specialist's
 * answer ignore a cross-cutting concern.
 */
export async function checkCrossAgentConflicts(
  shopId: string,
  agent: AgentRole,
  facts: StructuredFact[],
): Promise<string | null> {
  if (agent === "InventoryAgent") return null;

  const skus = facts
    .filter((f) => f.sourceType === "product")
    .flatMap((f) => {
      const variants = (f.data.variants as Array<{ sku?: string | null }> | undefined) ?? [];
      return variants.map((v) => v.sku).filter((sku): sku is string => Boolean(sku));
    });

  if (skus.length === 0) return null;

  const cutoff = new Date(Date.now() - INVENTORY_RISK_LOOKBACK_HOURS * 60 * 60 * 1000);
  const risk = await db.memory.findFirst({
    where: {
      shopId,
      memoryType: "INSIGHT",
      createdAt: { gte: cutoff },
      OR: skus.map((sku) => ({ metadata: { path: ["sku"], equals: sku } })),
    },
  });

  if (!risk) return null;
  return `StoreManagerAgent note: ${risk.content}`;
}
