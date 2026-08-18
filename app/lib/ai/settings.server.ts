import db from "../../db.server";

export type ShopAiSettings = {
  anthropicApiKey: string | null;
  openaiApiKey: string | null;
  chatModel: string | null;
  classifierModel: string | null;
  embeddingModel: string | null;
};

const EMPTY_SETTINGS: ShopAiSettings = {
  anthropicApiKey: null,
  openaiApiKey: null,
  chatModel: null,
  classifierModel: null,
  embeddingModel: null,
};

/** Merchant overrides for AI provider config, falling back to env vars when unset (see anthropic.server.ts / embeddings.server.ts). */
export async function getShopAiSettings(shopId: string): Promise<ShopAiSettings> {
  const record = await db.shopSettings.findUnique({ where: { shopId } });
  if (!record) return EMPTY_SETTINGS;

  return {
    anthropicApiKey: record.anthropicApiKey,
    openaiApiKey: record.openaiApiKey,
    chatModel: record.chatModel,
    classifierModel: record.classifierModel,
    embeddingModel: record.embeddingModel,
  };
}

export type ShopAiSettingsInput = {
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  chatModel?: string | null;
  classifierModel?: string | null;
  embeddingModel?: string | null;
};

export async function saveShopAiSettings(shopId: string, input: ShopAiSettingsInput): Promise<void> {
  await db.shopSettings.upsert({
    where: { shopId },
    create: { shopId, ...input },
    update: input,
  });
}
