import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { measureActionOutcome } from "../lib/intelligence/outcome.server";

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopRecord = await ensureShop(session.shop);

  const actionId = params.id;
  if (!actionId) {
    return Response.json({ error: "missing action id" }, { status: 400 });
  }

  try {
    const outcome = await measureActionOutcome(shopRecord.id, actionId);
    return Response.json({ outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
};
