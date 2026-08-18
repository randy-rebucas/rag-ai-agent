import db from "../../db.server";
import { getSalesMetrics, type SalesMetrics } from "../context/analytics.server";
import { saveMemory } from "../memory/memory.server";
import { recordEvent } from "../shopify-data/events.server";
import { classifyOutcome, recordOutcomeStat } from "./learning.server";

const DEFAULT_WINDOW_DAYS = 7;

export type OutcomeResult = {
  before: SalesMetrics;
  after: SalesMetrics;
  revenueChangePct: number | null;
};

/**
 * Compares shop-level sales metrics for an equal-length window before vs.
 * after an action's executedAt. This is a SHOP-LEVEL PROXY, not a per-product
 * causal measurement — attributing a revenue change to one price tweak
 * precisely would need traffic/conversion data this app doesn't ingest.
 */
export async function measureActionOutcome(
  shopId: string,
  actionId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<OutcomeResult> {
  const action = await db.action.findFirst({ where: { id: actionId, shopId } });
  if (!action) {
    throw new Error(`Action ${actionId} not found for shop ${shopId}`);
  }
  if (action.status !== "EXECUTED" || !action.executedAt) {
    throw new Error(`Action ${actionId} is not EXECUTED; cannot measure outcome`);
  }

  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const executedAt = action.executedAt;

  const [before, after] = await Promise.all([
    getSalesMetrics(shopId, { from: new Date(executedAt.getTime() - windowMs), to: executedAt }),
    getSalesMetrics(shopId, { from: executedAt, to: new Date(executedAt.getTime() + windowMs) }),
  ]);

  const revenueChangePct =
    before.totalRevenue > 0 ? (after.totalRevenue - before.totalRevenue) / before.totalRevenue : null;

  const outcomeClass = classifyOutcome(revenueChangePct);

  const impactDescription =
    revenueChangePct === null
      ? "no baseline revenue to compare against"
      : `revenue ${revenueChangePct >= 0 ? "up" : "down"} ${Math.abs(Math.round(revenueChangePct * 100))}%`;

  await db.action.update({ where: { id: action.id }, data: { outcome: outcomeClass } });

  // Strategy Reweighting (spec §10.1 #3) — this aggregate is what future
  // RECOMMEND/REASON calls consult, never re-derived from raw outcomes each time.
  try {
    await recordOutcomeStat(shopId, action.tool, outcomeClass);
  } catch (error) {
    console.error(`Failed to update ActionOutcomeStat for action ${actionId}:`, error);
  }

  // Embeddings-provider failure must not prevent the outcome from being
  // computed/returned/eventable — semantic searchability is an enhancement
  // on top of the measurement itself (spec §41).
  try {
    await saveMemory({
      shopId,
      memoryType: "OUTCOME",
      entityType: "action",
      entityId: action.id,
      content: `Outcome of ${action.tool} (action ${action.id}): ${outcomeClass} — ${impactDescription}. Before: ${before.orderCount} orders / ${before.totalRevenue}. After: ${after.orderCount} orders / ${after.totalRevenue}. (Shop-level proxy, not per-product attribution.)`,
      source: "outcome_measurement",
      confidence: 0.5,
      importance: 0.6,
      metadata: { before, after, revenueChangePct, outcome: outcomeClass },
    });
  } catch (error) {
    console.error(`Failed to save outcome memory for action ${actionId}:`, error);
  }

  await recordEvent({
    shopId,
    eventType: "AI_OUTCOME_MEASURED",
    entityType: "action",
    entityId: action.id,
    payload: { before, after, revenueChangePct },
    occurredAt: new Date(),
  });

  return { before, after, revenueChangePct };
}
