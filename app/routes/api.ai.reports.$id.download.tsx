import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const id = params.id;
  if (!id) {
    throw new Response("Not found", { status: 404 });
  }

  const report = await db.chatReport.findFirst({
    where: { id, shopId: shop.id },
  });
  if (!report) {
    throw new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(report.content), {
    headers: {
      "Content-Type": report.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(report.filename)}"`,
      "Content-Length": String(report.size),
    },
  });
};
