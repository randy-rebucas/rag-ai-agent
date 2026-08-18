import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { rejectAction } from "../lib/agent/actions.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const actionId = params.id;
  if (!actionId) {
    return Response.json({ error: "missing action id" }, { status: 400 });
  }

  const rejected = await rejectAction(shopRecord.id, actionId);
  if (!rejected) {
    return Response.json({ error: "action not found or not pending approval" }, { status: 409 });
  }

  return Response.json({ action: rejected });
};
