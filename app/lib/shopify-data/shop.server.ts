import db from "../../db.server";
import type { SyncFreshness } from "@prisma/client";

const REALTIME_WINDOW_MS = 5 * 60 * 1000;
const RECENT_WINDOW_MS = 60 * 60 * 1000;

/** Spec §36 Data Freshness: derives current freshness from elapsed time since last sync, rather than trusting a static stored label forever. */
export function computeFreshness(lastSyncedAt: Date | null): SyncFreshness {
  if (!lastSyncedAt) return "UNKNOWN";
  const ageMs = Date.now() - lastSyncedAt.getTime();
  if (ageMs <= REALTIME_WINDOW_MS) return "REALTIME";
  if (ageMs <= RECENT_WINDOW_MS) return "RECENT";
  return "STALE";
}

export async function ensureShop(shopDomain: string) {
  return db.shop.upsert({
    where: { shopDomain },
    update: { uninstalledAt: null },
    create: { shopDomain },
  });
}

export async function markSyncCompleted(shopId: string) {
  return db.shop.update({
    where: { id: shopId },
    data: {
      initialSyncDone: true,
      lastSyncedAt: new Date(),
      syncFreshness: "REALTIME",
    },
  });
}

export async function touchSyncFreshness(shopDomain: string) {
  return db.shop.updateMany({
    where: { shopDomain },
    data: { lastSyncedAt: new Date(), syncFreshness: "REALTIME" },
  });
}
