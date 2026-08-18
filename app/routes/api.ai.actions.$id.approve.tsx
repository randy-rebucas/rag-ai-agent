import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { approveAction } from "../lib/agent/actions.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const actionId = params.id;
  if (!actionId) {
    return Response.json({ error: "missing action id" }, { status: 400 });
  }

  // approveAction scopes the lookup by shopId — an action id alone from
  // another shop's session can never be approved here (tenant isolation).
  const approved = await approveAction(shopRecord.id, actionId);
  if (!approved) {
    return Response.json({ error: "action not found or not pending approval" }, { status: 409 });
  }

  return Response.json({ action: approved });
};
