import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { runInsightScan } from "../lib/intelligence/insight-engine.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  // Scanning on GET keeps this phase simple without introducing scheduling
  // infrastructure; a future phase can move this to a real background job
  // without changing this route's contract.
  await runInsightScan(shopRecord.id);

  const insights = await db.memory.findMany({
    where: { shopId: shopRecord.id, memoryType: "INSIGHT" },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return Response.json({ insights });
};
