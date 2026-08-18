import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { consolidateMemories } from "../lib/memory/consolidation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  // Triggered on GET, same as api.ai.insights.tsx's scan — no scheduling
  // infrastructure exists yet, so this runs on-demand or via an external
  // scheduled call to this endpoint until a real background job exists.
  const result = await consolidateMemories(shopRecord.id);

  return Response.json(result);
};
