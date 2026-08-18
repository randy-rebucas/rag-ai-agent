import db from "../../db.server";

const MEMORY_DEPTH_SATURATION = 40;

export type BadgeTone = "critical" | "warning" | "info" | "success";

export type KnowledgeLevel = {
  score: number;
  label: string;
  tone: BadgeTone;
  productCount: number;
  memoryCount: number;
  avgConfidence: number;
  lastScanAt: string | null;
};

function scoreToLabel(score: number): { label: string; tone: BadgeTone } {
  if (score < 20) return { label: "Just getting started", tone: "critical" };
  if (score < 45) return { label: "Learning", tone: "warning" };
  if (score < 70) return { label: "Getting sharp", tone: "info" };
  if (score < 90) return { label: "Sharp", tone: "success" };
  return { label: "Expert", tone: "success" };
}

/**
 * Heuristic 0-100 score for how much this shop's RAG bot actually knows,
 * derived from data it has (coverage), how much of it is embedded as
 * semantic memory (depth), and how trustworthy that memory is (quality) —
 * same self-derived-from-evidence approach as confidence.server.ts.
 */
export async function computeKnowledgeLevel(shopId: string): Promise<KnowledgeLevel> {
  const [productCount, orderCount, customerCount, memoryCount, memoryStats, shop] = await Promise.all([
    db.product.count({ where: { shopId } }),
    db.order.count({ where: { shopId } }),
    db.customer.count({ where: { shopId } }),
    db.memory.count({ where: { shopId } }),
    db.memory.aggregate({ where: { shopId }, _avg: { confidence: true } }),
    db.shop.findUnique({ where: { id: shopId }, select: { lastSyncedAt: true } }),
  ]);

  const coverage =
    (productCount > 0 ? 15 : 0) + (orderCount > 0 ? 15 : 0) + (customerCount > 0 ? 10 : 0);
  const memoryDepth = Math.min(memoryCount / MEMORY_DEPTH_SATURATION, 1) * 40;
  const avgConfidence = memoryStats._avg.confidence ?? 0.5;
  const quality = avgConfidence * 20;

  const score = Math.round(Math.min(coverage + memoryDepth + quality, 100));
  const { label, tone } = scoreToLabel(score);

  return {
    score,
    label,
    tone,
    productCount,
    memoryCount,
    avgConfidence,
    lastScanAt: shop?.lastSyncedAt ? shop.lastSyncedAt.toISOString() : null,
  };
}
