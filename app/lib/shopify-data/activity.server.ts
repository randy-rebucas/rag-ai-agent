import type { EventType } from "@prisma/client";
import db from "../../db.server";

export type ActivityHistoryFilter = {
  entityType?: string;
  entityId?: string;
  eventTypes?: EventType[];
  since?: Date;
  until?: Date;
  limit?: number;
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
  });
}
