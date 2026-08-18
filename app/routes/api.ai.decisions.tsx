import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const decisions = await db.action.findMany({
    where: { shopId: shopRecord.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return Response.json({ decisions });
};
