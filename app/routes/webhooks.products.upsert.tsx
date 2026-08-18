import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop, touchSyncFreshness } from "../lib/shopify-data/shop.server";
import { upsertProductFromWebhook } from "../lib/shopify-data/normalize.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const shopRecord = await ensureShop(shop);
  await upsertProductFromWebhook(shopRecord.id, payload);
  await touchSyncFreshness(shop);

  return new Response();
};
