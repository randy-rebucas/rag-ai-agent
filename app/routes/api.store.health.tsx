import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop, computeFreshness } from "../lib/shopify-data/shop.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  return Response.json({
    shopId: shopRecord.id,
    initialSyncDone: shopRecord.initialSyncDone,
    lastSyncedAt: shopRecord.lastSyncedAt,
    dataFreshness: computeFreshness(shopRecord.lastSyncedAt),
  });
};
