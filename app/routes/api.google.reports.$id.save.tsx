import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { getValidAccessToken, uploadFileToDrive } from "../lib/google/drive.server";
import db from "../db.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const id = params.id;
  if (!id) {
    return Response.json({ error: "Missing report id" }, { status: 400 });
  }

  const report = await db.chatReport.findFirst({ where: { id, shopId: shop.id } });
  if (!report) {
    return Response.json({ error: "Report not found" }, { status: 404 });
  }

  const accessToken = await getValidAccessToken(shop.id);
  if (!accessToken) {
    return Response.json({ error: "Connect Google Drive in Settings first." }, { status: 400 });
  }

  try {
    const { webViewLink } = await uploadFileToDrive(
      accessToken,
      report.filename,
      report.mimeType,
      Buffer.from(report.content),
    );
    return Response.json({ ok: true, webViewLink });
  } catch (error) {
    console.error(`Failed to save report ${id} to Drive:`, error);
    return Response.json({ error: "Failed to save to Google Drive." }, { status: 502 });
  }
};
