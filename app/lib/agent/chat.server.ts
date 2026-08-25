import { Prisma } from "@prisma/client";
import db from "../../db.server";
import { buildContext } from "../context/context-engine.server";
import { generateResponse } from "./respond.server";
import { computeConfidence } from "./confidence.server";
import { extractActionRequest } from "./action-extraction.server";
import { extractMerchantPreference } from "./preference-extraction.server";
import { summarizeConversation } from "./conversation-summary.server";
import { prepareAction } from "./actions.server";
import { selectAgent, checkCrossAgentConflicts, type AgentRole } from "./orchestrator.server";
import type { ContextSource } from "../context/types";
import { getShopAiSettings } from "../ai/settings.server";
import { runWithShopAiSettings } from "../ai/settings-context.server";
import { saveMemory } from "../memory/memory.server";
import { factsToCsv } from "../reports/csv.server";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type HandleChatMessageInput = {
  shopId: string;
  userId?: string;
  sessionId?: string;
  message: string;
};

export type HandleChatMessageResult = {
  sessionId: string;
  reply: string;
  confidence: number;
  sources: ContextSource[];
  intent: string;
  preparedActionId: string | null;
  agent: AgentRole;
  report: { id: string; filename: string; rowCount: number } | null;
};

const EXPORT_TRIGGER = /\b(export|download|csv|spreadsheet)\b/i;

async function loadOrCreateSession(shopId: string, userId: string | undefined, sessionId: string | undefined) {
  if (sessionId) {
    const existing = await db.conversationSession.findFirst({ where: { id: sessionId, shopId } });
    if (existing) return existing;
  }

  return db.conversationSession.create({
    data: { shopId, userId, messages: [] as unknown as Prisma.InputJsonValue },
  });
}

/** Orchestrates one chat turn: load session -> build context -> generate response -> persist. */
export async function handleChatMessage(input: HandleChatMessageInput): Promise<HandleChatMessageResult> {
  const aiSettings = await getShopAiSettings(input.shopId);
  return runWithShopAiSettings(aiSettings, () => handleChatMessageInner(input));
}

async function handleChatMessageInner(input: HandleChatMessageInput): Promise<HandleChatMessageResult> {
  const session = await loadOrCreateSession(input.shopId, input.userId, input.sessionId);

  const context = await buildContext({ shopId: input.shopId, query: input.message, userId: input.userId });
  const agent = selectAgent(context.intent);

  let reply: string;
  let confidence: number;
  try {
    reply = await generateResponse(context, input.message, agent);
    confidence = computeConfidence(context);
  } catch (error) {
    console.error("Chat response generation failed:", error);
    reply = "I couldn't reach the AI service just now, so I can't answer that. Please try again shortly.";
    confidence = 0;
  }

  // Spec §30's cross-agent coordination example, implemented with data this
  // app actually has: don't let a specialist's answer ignore an outstanding
  // inventory risk on the same product.
  try {
    const conflictNote = await checkCrossAgentConflicts(input.shopId, agent, context.facts);
    if (conflictNote) reply += `\n\n${conflictNote}`;
  } catch (error) {
    console.error("Cross-agent conflict check failed:", error);
  }

  // Never guesses at destructive parameters: extraction only fires on an
  // ACTION_REQUEST intent, and only prepares something if it can resolve a
  // concrete tool + arguments from data actually present in this turn's
  // structured facts (see action-extraction.server.ts).
  let preparedActionId: string | null = null;
  if (context.intent === "ACTION_REQUEST") {
    const extracted = await extractActionRequest(input.message, context.facts);
    if (extracted) {
      const { action, filterWarning } = await prepareAction({
        shopId: input.shopId,
        tool: extracted.tool,
        arguments: extracted.arguments,
        reasoning: reply,
        sourceRefs: context.sources,
        actor: input.userId ?? "merchant",
      });
      preparedActionId = action.id;
      reply += `\n\nI've prepared this action for your review (action ${action.id}). It will only run once you approve it.`;
      if (filterWarning) reply += `\n\n⚠️ ${filterWarning}`;
    }
  }

  // Only generate a report when the merchant actually asked to export/download
  // something and this turn produced structured facts to export — never on
  // every analysis reply.
  let report: { id: string; filename: string; rowCount: number } | null = null;
  if (EXPORT_TRIGGER.test(input.message) && context.facts.length > 0) {
    try {
      const { csv, rowCount } = factsToCsv(context.facts);
      const bytes = Buffer.from(csv, "utf-8");
      const filename = `${context.intent.toLowerCase()}-${Date.now()}.csv`;
      const created = await db.chatReport.create({
        data: {
          shopId: input.shopId,
          sessionId: session.id,
          filename,
          mimeType: "text/csv",
          size: bytes.byteLength,
          content: bytes,
        },
      });
      report = { id: created.id, filename, rowCount };
      reply += `\n\nI've put together a CSV export (${rowCount} row${rowCount === 1 ? "" : "s"}) — you can download it below.`;
    } catch (error) {
      console.error("Failed to generate chat report:", error);
    }
  }

  // Best-effort, non-blocking: a merchant preference is a nice-to-have signal,
  // never worth delaying or failing the chat reply over.
  extractMerchantPreference(input.message)
    .then((preference) => {
      if (!preference) return;
      return saveMemory({
        shopId: input.shopId,
        memoryType: "MERCHANT_PREFERENCE",
        entityType: "shop",
        entityId: input.shopId,
        content: preference.content,
        source: "merchant_conversation",
        confidence: preference.confidence,
        importance: 0.9,
        metadata: { subject: preference.subject },
      });
    })
    .catch((error) => console.error("Failed to save merchant preference memory:", error));

  const existingMessages = Array.isArray(session.messages) ? (session.messages as unknown as ChatMessage[]) : [];
  const now = new Date().toISOString();
  const updatedMessages: ChatMessage[] = [
    ...existingMessages,
    { role: "user", content: input.message, createdAt: now },
    { role: "assistant", content: reply, createdAt: now },
  ];

  await db.conversationSession.update({
    where: { id: session.id },
    data: {
      messages: updatedMessages as unknown as Prisma.InputJsonValue,
      intent: context.intent,
    },
  });

  // Spec §31: regenerate the session summary every few turns, not every turn
  // (an LLM call per message would double the session's cost for little gain).
  const CONVERSATION_SUMMARY_INTERVAL = 6;
  if (updatedMessages.length % CONVERSATION_SUMMARY_INTERVAL === 0) {
    summarizeConversation(updatedMessages)
      .then((summary) => {
        if (!summary) return;
        return db.conversationSession.update({ where: { id: session.id }, data: { summary } });
      })
      .catch((error) => console.error(`Failed to summarize conversation ${session.id}:`, error));
  }

  return {
    sessionId: session.id,
    reply,
    confidence,
    sources: context.sources,
    intent: context.intent,
    preparedActionId,
    agent,
    report,
  };
}
