// Plain-fetch Claude client, mirroring embeddings.server.ts's style: no SDK
// dependency for a single call type. Used for intent classification (cheap
// model) and chat response generation (stronger model) behind the same call.

import { getShopAiSettingsFromContext } from "./settings-context.server";

const DEFAULT_CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || "claude-haiku-4-5-20251001";
const DEFAULT_CHAT_MODEL = process.env.CHAT_MODEL || "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  { maxTokens = 512, model }: { maxTokens?: number; model?: string } = {},
): Promise<string> {
  const overrides = getShopAiSettingsFromContext();
  const apiKey = overrides?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set; cannot call Claude");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: model ?? overrides?.classifierModel ?? DEFAULT_CLASSIFIER_MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude request failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  const text = json?.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Claude response missing text content");
  }

  return text;
}

export function chatModel(): string {
  return getShopAiSettingsFromContext()?.chatModel || DEFAULT_CHAT_MODEL;
}
