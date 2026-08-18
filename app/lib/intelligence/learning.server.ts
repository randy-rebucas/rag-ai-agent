import type { ActionTool } from "@prisma/client";
import db from "../../db.server";

const RECENT_NEGATIVE_LOOKBACK_DAYS = 30;
const CALIBRATION_MIN_ATTEMPTS = 3;

// Spec §10.1: the argument field that identifies "the same target" for a given
// tool, so a repeated action on the same entity can be pattern-matched.
const ENTITY_KEY_FIELD: Record<ActionTool, string> = {
  UPDATE_PRICE: "variantId",
  UPDATE_INVENTORY: "inventoryItemId",
  UPDATE_DISCOUNT_STATUS: "discountId",
  ADD_ORDER_TAGS: "orderId",
};

export type OutcomeClass = "positive" | "negative" | "neutral";

/** Classifies a revenue change into the ternary outcome the spec's example uses. Thresholds are the app's own judgment call — no ground truth for "significant" exists without traffic data. */
export function classifyOutcome(revenueChangePct: number | null): OutcomeClass {
  if (revenueChangePct === null) return "neutral";
  if (revenueChangePct >= 0.02) return "positive";
  if (revenueChangePct <= -0.02) return "negative";
  return "neutral";
}

/** Strategy Reweighting (§10.1 #3): update the per-shop/per-tool success-rate aggregate. */
export async function recordOutcomeStat(shopId: string, tool: ActionTool, outcome: OutcomeClass): Promise<void> {
  await db.actionOutcomeStat.upsert({
    where: { shopId_tool: { shopId, tool } },
    update: {
      attempts: { increment: 1 },
      positive: { increment: outcome === "positive" ? 1 : 0 },
      negative: { increment: outcome === "negative" ? 1 : 0 },
    },
    create: {
      shopId,
      tool,
      attempts: 1,
      positive: outcome === "positive" ? 1 : 0,
      negative: outcome === "negative" ? 1 : 0,
    },
  });
}

/** Confidence Calibration (§10.1 #1): blend a base confidence with this tool's historical success rate, once there's enough data to trust it. */
export async function calibrateConfidence(
  shopId: string,
  tool: ActionTool,
  baseConfidence: number,
): Promise<{ confidence: number; note: string | null }> {
  const stat = await db.actionOutcomeStat.findUnique({ where: { shopId_tool: { shopId, tool } } });
  if (!stat || stat.attempts < CALIBRATION_MIN_ATTEMPTS) {
    return { confidence: baseConfidence, note: null };
  }

  const successRate = stat.positive / stat.attempts;
  const confidence = Math.round(((baseConfidence + successRate) / 2) * 100) / 100;
  const note =
    successRate < 0.5
      ? `Note: past ${tool} actions for this store succeeded ${stat.positive}/${stat.attempts} times historically — confidence lowered accordingly.`
      : null;

  return { confidence, note };
}

/** Recommendation Filtering (§10.1 #2): surface (not silently block) a recent negative outcome on the same target before repeating the same action. */
export async function findRecentNegativeOutcome(
  shopId: string,
  tool: ActionTool,
  args: Record<string, unknown>,
): Promise<{ actionId: string; executedAt: Date } | null> {
  const keyField = ENTITY_KEY_FIELD[tool];
  const keyValue = args[keyField];
  if (typeof keyValue !== "string") return null;

  const cutoff = new Date(Date.now() - RECENT_NEGATIVE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const prior = await db.action.findFirst({
    where: {
      shopId,
      tool,
      outcome: "negative",
      executedAt: { gte: cutoff },
      arguments: { path: [keyField], equals: keyValue },
    },
    orderBy: { executedAt: "desc" },
  });

  if (!prior || !prior.executedAt) return null;
  return { actionId: prior.id, executedAt: prior.executedAt };
}
