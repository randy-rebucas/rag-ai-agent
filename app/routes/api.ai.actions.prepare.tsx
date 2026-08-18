import type { ActionFunctionArgs } from "react-router";
import type { ActionTool } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { prepareAction } from "../lib/agent/actions.server";

const VALID_TOOLS: ActionTool[] = ["UPDATE_PRICE", "UPDATE_INVENTORY"];

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const body = await request.json();

  if (!VALID_TOOLS.includes(body?.tool)) {
    return Response.json({ error: "invalid tool" }, { status: 400 });
  }
  if (typeof body?.arguments !== "object" || body.arguments === null) {
    return Response.json({ error: "arguments is required" }, { status: 400 });
  }

  const shopRecord = await ensureShop(session.shop);

  try {
    const created = await prepareAction({
      shopId: shopRecord.id,
      tool: body.tool,
      arguments: body.arguments,
      reasoning: typeof body.reasoning === "string" ? body.reasoning : undefined,
      actor: "merchant",
    });
    return Response.json({ action: created });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
};
