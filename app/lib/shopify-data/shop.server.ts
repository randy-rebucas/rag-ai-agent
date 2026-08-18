import db from "../../db.server";

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
