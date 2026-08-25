import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import db from "../db.server";

type ChatMessage = { role: "user" | "assistant"; content: string; createdAt: string };

const SESSIONS_LIMIT = 20;

/** Lists recent conversation sessions for the shop, newest first, with a short preview. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  const sessions = await db.conversationSession.findMany({
    where: { shopId: shop.id },
    orderBy: { updatedAt: "desc" },
    take: SESSIONS_LIMIT,
    select: { id: true, summary: true, messages: true, updatedAt: true },
  });

  return Response.json({
    sessions: sessions.map((s) => {
      const messages = Array.isArray(s.messages) ? (s.messages as unknown as ChatMessage[]) : [];
      const firstUserMessage = messages.find((m) => m.role === "user")?.content ?? null;
      return {
        id: s.id,
        summary: s.summary,
        preview: s.summary ?? firstUserMessage ?? "New conversation",
        messageCount: messages.length,
        updatedAt: s.updatedAt.toISOString(),
      };
    }),
  });
};
