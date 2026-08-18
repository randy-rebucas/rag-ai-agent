import { callClaude, chatModel } from "../ai/anthropic.server";

export type ExtractedPreference = {
  subject: string;
  content: string;
  confidence: number;
};

const SYSTEM_PROMPT = `You detect explicit merchant preference statements in a chat message — things like brand positioning, pricing strategy, shipping/return policy stance, preferred tone, or business priorities that should influence future AI recommendations.

Respond with ONLY a single JSON object, no prose, no markdown fences:
- If the message states a clear, durable preference: { "subject": "brand_positioning", "content": "Merchant wants the brand positioned as premium rather than discount-oriented.", "confidence": 0.9 }
  - "subject" is a short snake_case label for what the preference is about.
  - "content" restates the preference as a standalone factual sentence (not a quote), so it makes sense without the original message.
  - "confidence" is 0-1, how explicitly and durably this was stated (a one-off complaint is low confidence; "we always want X" is high).
- If the message is a question, a one-time request, or doesn't state a durable preference: { "subject": null }

Never invent a preference that wasn't stated. A single ambiguous or sarcastic remark is not a preference.`;

/** Best-effort detection of a durable merchant preference in one chat message, or null if none was stated. */
export async function extractMerchantPreference(message: string): Promise<ExtractedPreference | null> {
  try {
    const raw = await callClaude(SYSTEM_PROMPT, `Merchant message: ${message}`, {
      maxTokens: 200,
      model: chatModel(),
    });

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));

    if (
      typeof parsed.subject === "string" &&
      typeof parsed.content === "string" &&
      typeof parsed.confidence === "number"
    ) {
      return {
        subject: parsed.subject,
        content: parsed.content,
        confidence: Math.max(0, Math.min(1, parsed.confidence)),
      };
    }

    return null;
  } catch (error) {
    console.error("Merchant preference extraction failed:", error);
    return null;
  }
}
