import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { executeAction } from "../lib/agent/actions.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const actionId = params.id;
  if (!actionId) {
    return Response.json({ error: "missing action id" }, { status: 400 });
  }

  const result = await executeAction(shopRecord.id, actionId, admin);

  if (result.outcome === "already_claimed") {
    return Response.json({ error: "action not found or not approved" }, { status: 409 });
  }
  if (result.outcome === "failed") {
    return Response.json({ action: result.action, error: result.error }, { status: 502 });
  }

  return Response.json({ action: result.action });
};
