import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const entityId = params.entityId;
  if (!entityId) {
    throw new Response("Not found", { status: 404 });
  }

  const document = await db.document.findUnique({
    where: { shopId_entityId: { shopId: shop.id, entityId } },
  });
  if (!document) {
    throw new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(document.content), {
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(document.filename)}"`,
      "Content-Length": String(document.size),
    },
  });
};
