import type { Prisma, EventType } from "@prisma/client";
import db from "../../db.server";

export type EventInput = {
  shopId: string;
  eventType: EventType;
  entityType: string;
  entityId?: string | null;
  shopifyId?: string | null;
  actor?: string | null;
  payload: Prisma.InputJsonValue;
  occurredAt: Date;
};

/**
 * Appends an immutable activity event. Idempotent: redelivering the same
 * webhook (same shop/source/eventType/shopifyId/occurredAt) silently no-ops
 * instead of creating a duplicate row.
 */
export async function recordEvent(input: EventInput): Promise<void> {
  try {
    await db.event.create({
      data: {
        shopId: input.shopId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        shopifyId: input.shopifyId ?? null,
        actor: input.actor ?? null,
        payload: input.payload,
        occurredAt: input.occurredAt,
        source: "shopify",
      },
    });
  } catch (error) {
    const isUniqueConflict =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";
    if (!isUniqueConflict) throw error;
  }
}
