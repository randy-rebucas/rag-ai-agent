import db from "../../db.server";
import { getSalesMetrics } from "../context/analytics.server";
import { saveMemory } from "../memory/memory.server";
import { LOW_STOCK_THRESHOLD } from "../shopify-data/normalize.server";

const REVENUE_ANOMALY_THRESHOLD = 0.2; // ±20%
const INSIGHT_COOLDOWN_HOURS = 24;
const WINDOW_DAYS = 7;

/** Anti-spam per spec §28: skip if an INSIGHT for this exact subject was created within the cooldown window. */
async function isOnCooldown(shopId: string, subject: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - INSIGHT_COOLDOWN_HOURS * 60 * 60 * 1000);
  const recent = await db.memory.findFirst({
    where: {
      shopId,
      memoryType: "INSIGHT",
      createdAt: { gte: cutoff },
      metadata: { path: ["subject"], equals: subject },
    },
  });
  return recent !== null;
}

export type Insight = {
  subject: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  content: string;
  /** Extra correlation keys (e.g. { sku }) other systems can filter INSIGHT memories by. */
  metadata?: Record<string, unknown>;
};

// Embeddings-provider failure must not stop insight detection from being
// usable — the insight is still real even if it can't be semantically
// searched yet (spec §41: vector/embedding backends can be unavailable).
async function saveInsight(shopId: string, insight: Insight, confidence: number): Promise<void> {
  const severityImportance = { LOW: 0.3, MEDIUM: 0.6, HIGH: 0.9 }[insight.severity];
  try {
    await saveMemory({
      shopId,
      memoryType: "INSIGHT",
      entityType: "insight",
      content: insight.content,
      source: "insight_engine",
      confidence,
      importance: severityImportance,
      metadata: { subject: insight.subject, severity: insight.severity, ...insight.metadata },
    });
  } catch (error) {
    console.error(`Failed to save insight memory (${insight.subject}) for shop ${shopId}:`, error);
  }
}

export async function detectRevenueAnomaly(shopId: string): Promise<Insight | null> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 2 * WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [thisWeek, lastWeek] = await Promise.all([
    getSalesMetrics(shopId, { from: weekAgo, to: now }),
    getSalesMetrics(shopId, { from: twoWeeksAgo, to: weekAgo }),
  ]);

  if (lastWeek.totalRevenue <= 0) return null;

  const changePct = (thisWeek.totalRevenue - lastWeek.totalRevenue) / lastWeek.totalRevenue;
  if (Math.abs(changePct) < REVENUE_ANOMALY_THRESHOLD) return null;

  const subject = "revenue_anomaly";
  if (await isOnCooldown(shopId, subject)) return null;

  const direction = changePct >= 0 ? "increased" : "dropped";
  const insight: Insight = {
    subject,
    severity: Math.abs(changePct) >= 0.4 ? "HIGH" : "MEDIUM",
    content: `Revenue ${direction} ${Math.abs(Math.round(changePct * 100))}% this week (${thisWeek.totalRevenue}) vs last week (${lastWeek.totalRevenue}).`,
  };

  await saveInsight(shopId, insight, 0.7);
  return insight;
}

export async function detectInventoryRisk(shopId: string): Promise<Insight[]> {
  const lowStockItems = await db.inventoryItem.findMany({
    where: { shopId, available: { lte: LOW_STOCK_THRESHOLD, gte: 0 } },
    take: 20,
  });

  const insights: Insight[] = [];
  for (const item of lowStockItems) {
    const subject = `inventory_risk:${item.shopifyId}:${item.locationId}`;
    if (await isOnCooldown(shopId, subject)) continue;

    const insight: Insight = {
      subject,
      severity: (item.available ?? 0) === 0 ? "HIGH" : "MEDIUM",
      content: `Inventory item ${item.sku ?? item.shopifyId} is low on stock: ${item.available ?? 0} units remaining.`,
      metadata: item.sku ? { sku: item.sku } : undefined,
    };
    await saveInsight(shopId, insight, 0.9);
    insights.push(insight);
  }

  return insights;
}

/** Runs all detectors. Returns only newly-generated insights (empty if everything's within normal range or on cooldown). */
export async function runInsightScan(shopId: string): Promise<Insight[]> {
  const [revenueInsight, inventoryInsights] = await Promise.all([
    detectRevenueAnomaly(shopId),
    detectInventoryRisk(shopId),
  ]);

  return [...(revenueInsight ? [revenueInsight] : []), ...inventoryInsights];
}
