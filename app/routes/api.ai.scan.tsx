import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";
import { upsertProductMemory } from "../lib/memory/product-memory.server";
import { runInsightScan } from "../lib/intelligence/insight-engine.server";
import { computeKnowledgeLevel } from "../lib/intelligence/knowledge-level.server";
import { getShopAiSettings } from "../lib/ai/settings.server";
import { runWithShopAiSettings } from "../lib/ai/settings-context.server";

const SCAN_PRODUCT_LIMIT = 300;
const EMBED_BATCH_SIZE = 10;

async function runScan(shopId: string) {
  const products = await db.product.findMany({
    where: { shopId },
    select: { id: true },
    take: SCAN_PRODUCT_LIMIT,
  });

  for (let i = 0; i < products.length; i += EMBED_BATCH_SIZE) {
    const batch = products.slice(i, i + EMBED_BATCH_SIZE);
    await Promise.all(batch.map((p) => upsertProductMemory(shopId, p.id)));
  }

  await runInsightScan(shopId);

  await db.shop.update({
    where: { id: shopId },
    data: { lastSyncedAt: new Date(), syncFreshness: "REALTIME" },
  });

  return computeKnowledgeLevel(shopId);
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const aiSettings = await getShopAiSettings(shop.id);
  const level = await runWithShopAiSettings(aiSettings, () => runScan(shop.id));

  return Response.json({ level });
};
