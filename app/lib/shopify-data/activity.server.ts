import type { EventType } from "@prisma/client";
import db from "../../db.server";

export type ActivityHistoryFilter = {
  entityType?: string;
  entityId?: string;
  eventTypes?: EventType[];
  since?: Date;
  until?: Date;
  limit?: number;
  skip?: number;
};

/** Tenant-scoped read access to the immutable Event log (spec: Memory Tools → getActivityHistory). */
export async function getActivityHistory(
  shopId: string,
  filter: ActivityHistoryFilter = {},
) {
  return db.event.findMany({
    where: {
      shopId,
      entityType: filter.entityType,
      entityId: filter.entityId,
      eventType: filter.eventTypes ? { in: filter.eventTypes } : undefined,
      occurredAt: {
        gte: filter.since,
        lte: filter.until,
      },
    },
    orderBy: { occurredAt: "desc" },
    take: filter.limit ?? 100,
    skip: filter.skip,
  });
}

export type ImpactSummary = {
  actionsExecuted: number;
  actionsApproved: number;
  actionsRejected: number;
  insightsGenerated: number;
  conversationsHandled: number;
  successRate: number | null; // null when there's no outcome data yet
  estimatedMinutesSaved: number;
};

// Rough heuristic, not a measured figure: an executed action (price/inventory/
// discount/order-tag change) replaces a manual admin edit a merchant would
// otherwise make by hand. Shown as an estimate, never as a hard number.
const MINUTES_SAVED_PER_ACTION = 4;

/** Aggregates what the AI has actually done for this shop, for the Activity page's "Impact" summary. */
export async function getImpactSummary(shopId: string): Promise<ImpactSummary> {
  const [actionsExecuted, actionsApproved, actionsRejected, insightsGenerated, conversationsHandled, outcomeStats] =
    await Promise.all([
      db.action.count({ where: { shopId, status: "EXECUTED" } }),
      db.action.count({ where: { shopId, status: "APPROVED" } }),
      db.action.count({ where: { shopId, status: "REJECTED" } }),
      db.memory.count({ where: { shopId, memoryType: "INSIGHT" } }),
      db.conversationSession.count({ where: { shopId } }),
      db.actionOutcomeStat.findMany({ where: { shopId } }),
    ]);

  const totals = outcomeStats.reduce(
    (acc, stat) => ({ attempts: acc.attempts + stat.attempts, positive: acc.positive + stat.positive }),
    { attempts: 0, positive: 0 },
  );

  return {
    actionsExecuted,
    actionsApproved,
    actionsRejected,
    insightsGenerated,
    conversationsHandled,
    successRate: totals.attempts > 0 ? totals.positive / totals.attempts : null,
    estimatedMinutesSaved: actionsExecuted * MINUTES_SAVED_PER_ACTION,
  };
}

export type UsageSummary = {
  totalSessions: number;
  totalMessages: number;
  usersInteracted: number;
};

/** App-usage analytics for the Activity page: how much the chat is actually being used. */
export async function getUsageSummary(shopId: string): Promise<UsageSummary> {
  const [totalSessions, sessions, distinctUsers] = await Promise.all([
    db.conversationSession.count({ where: { shopId } }),
    db.conversationSession.findMany({ where: { shopId }, select: { messages: true } }),
    db.conversationSession.findMany({
      where: { shopId, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const totalMessages = sessions.reduce(
    (sum, session) => sum + (Array.isArray(session.messages) ? session.messages.length : 0),
    0,
  );

  return {
    totalSessions,
    totalMessages,
    usersInteracted: distinctUsers.length,
  };
}
