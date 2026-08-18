import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { ensureShop } from "../lib/shopify-data/shop.server";
import { ingestDocument, deleteDocument } from "../lib/memory/document-memory.server";
import { isSupportedDocumentFile, extractDocumentText } from "../lib/memory/document-text.server";
import { computeKnowledgeLevel } from "../lib/intelligence/knowledge-level.server";
import { getShopAiSettings } from "../lib/ai/settings.server";
import { runWithShopAiSettings } from "../lib/ai/settings-context.server";

const MAX_FILE_BYTES = 5_000_000; // raw file (stored for download) — generous for a PDF/DOCX
const MAX_TEXT_CHARS = 200_000; // ~150+ embedded chunks; anything past this is truncated, not rejected

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await ensureShop(session.shop);

  if (request.method === "DELETE") {
    const { entityId } = await request.json();
    if (typeof entityId !== "string" || !entityId) {
      return Response.json({ error: "entityId is required" }, { status: 400 });
    }
    await deleteDocument(shop.id, entityId);
    return Response.json({ level: await computeKnowledgeLevel(shop.id) });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file is required" }, { status: 400 });
  }
  if (!isSupportedDocumentFile(file.name, file.type)) {
    return Response.json(
      { error: "Unsupported file type. Upload a .txt, .md, .csv, .pdf, or .docx file." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "File is too large (5MB max)." }, { status: 400 });
  }

  const fileBytes = Buffer.from(await file.arrayBuffer());

  let text: string;
  try {
    text = (await extractDocumentText(fileBytes, file.type, file.name)).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't read this file.";
    return Response.json({ error: message }, { status: 400 });
  }

  if (!text) {
    return Response.json({ error: "No readable text was found in this file." }, { status: 400 });
  }
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);

  const aiSettings = await getShopAiSettings(shop.id);
  const result = await runWithShopAiSettings(aiSettings, () =>
    ingestDocument(shop.id, file.name, text, fileBytes, file.type || "application/octet-stream"),
  );

  return Response.json({ document: { ...result, truncated }, level: await computeKnowledgeLevel(shop.id) });
};
