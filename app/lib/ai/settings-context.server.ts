import { AsyncLocalStorage } from "node:async_hooks";
import type { ShopAiSettings } from "./settings.server";

// Lets the AI clients (anthropic.server.ts, embeddings.server.ts) pick up
// merchant-level overrides without threading shopId/settings through every
// call site (intent classifier, action extraction, memory embeddings, ...).
// Set once per request in chat.server.ts.
const storage = new AsyncLocalStorage<ShopAiSettings>();

export function runWithShopAiSettings<T>(settings: ShopAiSettings, fn: () => Promise<T>): Promise<T> {
  return storage.run(settings, fn);
}

export function getShopAiSettingsFromContext(): ShopAiSettings | undefined {
  return storage.getStore();
}
