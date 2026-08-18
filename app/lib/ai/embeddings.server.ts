// Embedding provider, isolated behind a single function so the vendor can be
// swapped later without touching callers. OpenAI is the only implementation
// today because Anthropic has no embeddings API; chat/reasoning LLM choice
// stays open for a later phase.

import { getShopAiSettingsFromContext } from "./settings-context.server";

const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

export async function embedText(text: string): Promise<number[]> {
  const overrides = getShopAiSettingsFromContext();
  const apiKey = overrides?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set; cannot generate embeddings");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: overrides?.embeddingModel || DEFAULT_EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings request failed (${response.status}): ${body}`);
  }

  const json = await response.json();
  const embedding = json?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("OpenAI embeddings response missing embedding array");
  }

  return embedding;
}
