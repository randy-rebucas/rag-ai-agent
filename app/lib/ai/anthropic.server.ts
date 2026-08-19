// Plain-fetch Claude client, mirroring embeddings.server.ts's style: no SDK
// dependency for a single call type. Used for intent classification (cheap
// model) and chat response generation (stronger model) behind the same call.

import { getShopAiSettingsFromContext } from "./settings-context.server";
import { recordMetric } from "../observability/metrics.server";

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

  const resolvedModel = model ?? overrides?.classifierModel ?? DEFAULT_CLASSIFIER_MODEL;
  const start = Date.now();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    recordMetric("llm.latency_ms", Date.now() - start, { metadata: { model: resolvedModel, ok: false } });
    throw new Error(`Claude request failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  const text = json?.content?.[0]?.text;

  recordMetric("llm.latency_ms", Date.now() - start, { metadata: { model: resolvedModel, ok: true } });
  if (typeof json?.usage?.input_tokens === "number") {
    recordMetric("llm.tokens.input", json.usage.input_tokens, { metadata: { model: resolvedModel } });
  }
  if (typeof json?.usage?.output_tokens === "number") {
    recordMetric("llm.tokens.output", json.usage.output_tokens, { metadata: { model: resolvedModel } });
  }

  if (typeof text !== "string") {
    throw new Error("Claude response missing text content");
  }

  return text;
}

export function chatModel(): string {
  return getShopAiSettingsFromContext()?.chatModel || DEFAULT_CHAT_MODEL;
}
