import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop, touchSyncFreshness } from "../lib/shopify-data/shop.server";
import { deleteProduct } from "../lib/shopify-data/normalize.server";
import { recordEvent } from "../lib/shopify-data/events.server";
import { legacyIdToGid } from "../lib/shopify-data/types";
import { deleteMemoriesForEntity } from "../lib/memory/memory.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const shopRecord = await ensureShop(shop);
  const shopifyId = String(
    payload.admin_graphql_api_id ?? legacyIdToGid("Product", payload.id),
  );

  const existing = await db.product.findUnique({
    where: { shopId_shopifyId: { shopId: shopRecord.id, shopifyId } },
  });

  await deleteProduct(shopRecord.id, shopifyId);

  if (existing) {
    await recordEvent({
      shopId: shopRecord.id,
      eventType: "PRODUCT_DELETED",
      entityType: "product",
      entityId: existing.id,
      shopifyId,
      payload: { title: existing.title },
      occurredAt: new Date(),
    });
    await deleteMemoriesForEntity(shopRecord.id, "PRODUCT", "product", existing.id);
  }

  await touchSyncFreshness(shop);

  return new Response();
};
