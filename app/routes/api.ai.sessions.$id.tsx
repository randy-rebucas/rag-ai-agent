import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt: string };

/** Fetches one conversation session's full message history, for resuming a saved chat. */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const conversation = await db.conversationSession.findFirst({
    where: { id: params.id, shopId: shop.id },
    select: { id: true, messages: true },
  });

  if (!conversation) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = Array.isArray(conversation.messages)
    ? (conversation.messages as unknown as ChatMessage[])
    : [];

  return Response.json({ sessionId: conversation.id, messages });
};
