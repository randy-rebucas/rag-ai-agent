import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { searchMemory } from "../lib/memory/memory.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const url = new URL(request.url);
  const query = url.searchParams.get("q");

  if (query) {
    const results = await searchMemory(shopRecord.id, query, { limit: 20 });
    return Response.json({ memories: results });
  }

  const memories = await db.memory.findMany({
    where: { shopId: shopRecord.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Response.json({ memories });
};
