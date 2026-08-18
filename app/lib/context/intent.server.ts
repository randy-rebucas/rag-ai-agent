import { callClaude } from "../ai/anthropic.server";
import { QUERY_INTENTS, type ClassifiedQuery, type QueryIntent } from "./types";

const SYSTEM_PROMPT = `You classify merchant questions about their Shopify store for a retrieval system.

Respond with ONLY a single JSON object, no prose, no markdown fences, matching this shape:
{
  "intent": one of ${JSON.stringify(QUERY_INTENTS)},
  "productTitles": string[] (product names/titles mentioned, [] if none),
  "timeRangeDays": number | null (how many days back the question refers to, e.g. "last week" = 7, "yesterday" = 1, null if no time range is implied)
}`;

function isQueryIntent(value: unknown): value is QueryIntent {
  return typeof value === "string" && (QUERY_INTENTS as readonly string[]).includes(value);
}

function fallback(): ClassifiedQuery {
  return { intent: "GENERAL_QUESTION", entities: {}, timeRange: null };
}

/** Classifies a merchant query into an intent + extracted entities/time range. Never throws — falls back to GENERAL_QUESTION on any failure (spec §41). */
export async function classifyQuery(query: string): Promise<ClassifiedQuery> {
  try {
    const raw = await callClaude(SYSTEM_PROMPT, query, { maxTokens: 300 });
    const parsed = JSON.parse(extractJson(raw));

    const intent = isQueryIntent(parsed.intent) ? parsed.intent : "GENERAL_QUESTION";
    const productTitles = Array.isArray(parsed.productTitles)
      ? parsed.productTitles.filter((t: unknown): t is string => typeof t === "string")
      : [];

    let timeRange: ClassifiedQuery["timeRange"] = null;
    if (typeof parsed.timeRangeDays === "number" && parsed.timeRangeDays > 0) {
      const to = new Date();
      const from = new Date(to.getTime() - parsed.timeRangeDays * 24 * 60 * 60 * 1000);
      timeRange = { from, to };
    }

    return {
      intent,
      entities: productTitles.length ? { productTitles } : {},
      timeRange,
    };
  } catch (error) {
    console.error("Query classification failed, falling back to GENERAL_QUESTION:", error);
    return fallback();
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in classifier response");
  }
  return text.slice(start, end + 1);
}
