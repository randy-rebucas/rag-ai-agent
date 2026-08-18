import db from "../../db.server";
import { saveMemory, deleteMemoriesForEntity } from "./memory.server";

const MAX_CHUNK_CHARS = 1200;
const MIN_CHUNK_CHARS = 200;

/** Deterministic entity id per filename so re-uploading the same file replaces its old chunks (mirrors upsertProductMemory). */
export function documentEntityId(filename: string): string {
  const slug = filename
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `doc:${slug || "untitled"}`;
}

/** Splits on paragraph boundaries, packing consecutive paragraphs up to MAX_CHUNK_CHARS; hard-splits any single paragraph that's still too long. */
export function chunkText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= MAX_CHUNK_CHARS) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (paragraph.length <= MAX_CHUNK_CHARS) {
      current = paragraph;
    } else {
      for (let i = 0; i < paragraph.length; i += MAX_CHUNK_CHARS) {
        chunks.push(paragraph.slice(i, i + MAX_CHUNK_CHARS));
      }
    }
  }

  if (current) chunks.push(current);

  // Merge a trailing sliver into the previous chunk rather than embedding a near-empty fragment.
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_CHUNK_CHARS) {
    const last = chunks.pop()!;
    chunks[chunks.length - 1] += `\n\n${last}`;
  }

  return chunks;
}

export type IngestDocumentResult = { entityId: string; chunkCount: number };

/**
 * Replaces any existing chunks/bytes for this filename with a fresh embedded
 * set — same replace-on-reupload behavior as product memory. `text` is what
 * gets chunked and embedded; `fileBytes`/`mimeType` are stored verbatim so
 * the original file can be downloaded later (see documents.$entityId.download.tsx).
 */
export async function ingestDocument(
  shopId: string,
  filename: string,
  text: string,
  fileBytes: Uint8Array,
  mimeType: string,
): Promise<IngestDocumentResult> {
  const entityId = documentEntityId(filename);
  const chunks = chunkText(text);

  await deleteMemoriesForEntity(shopId, "DOCUMENT", "document", entityId);

  for (const [index, chunk] of chunks.entries()) {
    await saveMemory({
      shopId,
      memoryType: "DOCUMENT",
      entityType: "document",
      entityId,
      content: chunk,
      source: "manual_upload",
      confidence: 1,
      importance: 0.6,
      metadata: { filename, chunkIndex: index, chunkCount: chunks.length },
    });
  }

  const content = new Uint8Array(fileBytes);
  await db.document.upsert({
    where: { shopId_entityId: { shopId, entityId } },
    create: { shopId, entityId, filename, mimeType, size: content.byteLength, content },
    update: { filename, mimeType, size: content.byteLength, content },
  });

  return { entityId, chunkCount: chunks.length };
}

export type DocumentSummary = {
  entityId: string;
  filename: string;
  mimeType: string;
  size: number;
  chunkCount: number;
  uploadedAt: string;
  /** False for documents uploaded before file storage existed — they still have embedded memory, just no bytes to download. */
  downloadable: boolean;
};

/**
 * One row per uploaded file, newest first. Merges two sources because
 * documents uploaded before the Document table existed only left behind
 * DOCUMENT memory chunks — they're still real, embedded knowledge and must
 * stay visible/deletable even though there's no file to download for them.
 */
export async function listDocuments(shopId: string): Promise<DocumentSummary[]> {
  const [documents, chunkRows] = await Promise.all([
    db.document.findMany({ where: { shopId } }),
    db.memory.findMany({
      where: { shopId, memoryType: "DOCUMENT" },
      select: { entityId: true, metadata: true, createdAt: true },
    }),
  ]);

  const documentsByEntity = new Map(documents.map((doc) => [doc.entityId, doc]));

  type Accumulated = { chunkCount: number; earliestCreatedAt: Date; filename?: string };
  const chunksByEntity = new Map<string, Accumulated>();
  for (const row of chunkRows) {
    if (!row.entityId) continue;
    const existing = chunksByEntity.get(row.entityId);
    const metadata = row.metadata as { filename?: string } | null;
    if (existing) {
      existing.chunkCount += 1;
      if (row.createdAt < existing.earliestCreatedAt) existing.earliestCreatedAt = row.createdAt;
    } else {
      chunksByEntity.set(row.entityId, {
        chunkCount: 1,
        earliestCreatedAt: row.createdAt,
        filename: metadata?.filename,
      });
    }
  }

  const entityIds = new Set([...documentsByEntity.keys(), ...chunksByEntity.keys()]);

  const summaries: DocumentSummary[] = [...entityIds].map((entityId) => {
    const doc = documentsByEntity.get(entityId);
    const chunks = chunksByEntity.get(entityId);
    return {
      entityId,
      filename: doc?.filename ?? chunks?.filename ?? entityId,
      mimeType: doc?.mimeType ?? "text/plain",
      size: doc?.size ?? 0,
      chunkCount: chunks?.chunkCount ?? 0,
      uploadedAt: (doc?.createdAt ?? chunks?.earliestCreatedAt ?? new Date()).toISOString(),
      downloadable: doc !== undefined,
    };
  });

  summaries.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
  return summaries;
}

export async function deleteDocument(shopId: string, entityId: string): Promise<void> {
  await deleteMemoriesForEntity(shopId, "DOCUMENT", "document", entityId);
  await db.document.deleteMany({ where: { shopId, entityId } });
}
