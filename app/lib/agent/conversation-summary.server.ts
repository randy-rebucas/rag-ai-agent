import { callClaude, chatModel } from "../ai/anthropic.server";

const SYSTEM_PROMPT = `Summarize a merchant's conversation with an AI store assistant into 2-4 short factual bullet points — durable takeaways (preferences stated, decisions made, strategies rejected/accepted), not a transcript recap.

Respond with ONLY the bullet points, one per line, no headers, no markdown fences. If there's nothing durable to summarize, respond with an empty string.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Spec §31: periodic conversation summarization — regenerated from the full transcript each time it's called, since sessions here are short-lived (no incremental-summary complexity needed). */
export async function summarizeConversation(messages: ChatMessage[]): Promise<string | null> {
  if (messages.length === 0) return null;

  try {
    const transcript = messages.map((m) => `${m.role === "user" ? "Merchant" : "AI"}: ${m.content}`).join("\n");
    const summary = await callClaude(SYSTEM_PROMPT, transcript, { maxTokens: 300, model: chatModel() });
    const trimmed = summary.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    console.error("Conversation summarization failed:", error);
    return null;
  }
}
