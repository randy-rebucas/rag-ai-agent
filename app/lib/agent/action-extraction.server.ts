import { callClaude, chatModel } from "../ai/anthropic.server";
import type { StructuredFact } from "../context/types";

export type ExtractedAction =
  | { tool: "UPDATE_PRICE"; arguments: { productId: string; variantId: string; newPrice: string } }
  | { tool: "UPDATE_INVENTORY"; arguments: { inventoryItemId: string; locationId: string; quantity: number } };

const SYSTEM_PROMPT = `You extract a concrete Shopify write action from a merchant's chat message, using only the candidate products/variants provided.

Respond with ONLY a single JSON object, no prose, no markdown fences:
- If the message clearly requests a price change for one of the candidates and gives a specific new price:
  { "tool": "UPDATE_PRICE", "productId": "...", "variantId": "...", "newPrice": "129.99" }
- If the message clearly requests an inventory quantity change:
  { "tool": "UPDATE_INVENTORY", "inventoryItemId": "...", "locationId": "...", "quantity": 42 }
- If the request is vague, missing a specific target, or missing a specific number: { "tool": null }

Never guess a price or quantity that isn't explicitly stated in the message. Never invent ids not present in the candidates.`;

/** Turns an ACTION_REQUEST-classified message into a concrete tool call, or null if it can't confidently resolve one. Never guesses destructive parameters. */
export async function extractActionRequest(
  message: string,
  candidateFacts: StructuredFact[],
): Promise<ExtractedAction | null> {
  if (candidateFacts.length === 0) return null;

  try {
    const candidatesText = candidateFacts
      .map((f) => `- ${f.summary} | data: ${JSON.stringify(f.data)}`)
      .join("\n");

    const raw = await callClaude(
      SYSTEM_PROMPT,
      `Candidates:\n${candidatesText}\n\nMerchant message: ${message}`,
      { maxTokens: 300, model: chatModel() },
    );

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1));

    if (parsed.tool === "UPDATE_PRICE" && parsed.productId && parsed.variantId && parsed.newPrice) {
      return {
        tool: "UPDATE_PRICE",
        arguments: {
          productId: String(parsed.productId),
          variantId: String(parsed.variantId),
          newPrice: String(parsed.newPrice),
        },
      };
    }

    if (
      parsed.tool === "UPDATE_INVENTORY" &&
      parsed.inventoryItemId &&
      parsed.locationId &&
      typeof parsed.quantity === "number"
    ) {
      return {
        tool: "UPDATE_INVENTORY",
        arguments: {
          inventoryItemId: String(parsed.inventoryItemId),
          locationId: String(parsed.locationId),
          quantity: parsed.quantity,
        },
      };
    }

    return null;
  } catch (error) {
    console.error("Action extraction failed, not preparing any action:", error);
    return null;
  }
}
