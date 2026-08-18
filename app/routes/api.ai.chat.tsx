import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { handleChatMessage } from "../lib/agent/chat.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const message = String(formData.get("message") ?? "").trim();
  const sessionIdValue = formData.get("sessionId");
  const sessionId = typeof sessionIdValue === "string" && sessionIdValue ? sessionIdValue : undefined;

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const shopRecord = await ensureShop(session.shop);

  const result = await handleChatMessage({
    shopId: shopRecord.id,
    userId: session.onlineAccessInfo?.associated_user?.id
      ? String(session.onlineAccessInfo.associated_user.id)
      : undefined,
    sessionId,
    message,
  });

  return Response.json(result);
};
