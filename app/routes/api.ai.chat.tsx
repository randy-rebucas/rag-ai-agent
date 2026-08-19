import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { handleChatMessage } from "../lib/agent/chat.server";
import { checkRateLimit, RateLimitError } from "../lib/security/rate-limit.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  try {
    checkRateLimit(session.shop);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: "Too many requests, please slow down." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } },
      );
    }
    throw error;
  }

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
