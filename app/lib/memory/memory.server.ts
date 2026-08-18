import { randomUUID } from "node:crypto";
import { Prisma, type MemoryType } from "@prisma/client";
import db from "../../db.server";
import { embedText } from "../ai/embeddings.server";

export type SaveMemoryInput = {
  shopId: string;
  memoryType: MemoryType;
  content: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  source?: string | null;
  confidence?: number | null;
  importance?: number | null;
  expiresAt?: Date | null;
};

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

/**
 * Embeds `content` and writes a Memory row (raw SQL, since Prisma Client can't
 * write to the `Unsupported("vector")` column directly). Always tenant-scoped
 * by shopId — every read of this table must filter by shopId too.
 */
export async function saveMemory(input: SaveMemoryInput): Promise<string> {
  const embedding = await embedText(input.content);
  const vectorLiteral = toVectorLiteral(embedding);
  const id = randomUUID();

  await db.$executeRaw`
    INSERT INTO "Memory"
      (id, "shopId", "entityType", "entityId", "memoryType", content, metadata, source, confidence, importance, embedding, "createdAt", "updatedAt", "expiresAt")
    VALUES
      (${id}, ${input.shopId}, ${input.entityType ?? null}, ${input.entityId ?? null},
       ${input.memoryType}::"MemoryType", ${input.content},
       ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb,
       ${input.source ?? null}, ${input.confidence ?? null}, ${input.importance ?? null},
       ${vectorLiteral}::vector, now(), now(), ${input.expiresAt ?? null})
  `;

  return id;
}

/** Deletes every Memory row for a given entity + memoryType (used to replace stale semantic snapshots). */
export async function deleteMemoriesForEntity(
  shopId: string,
  memoryType: MemoryType,
  entityType: string,
  entityId: string,
) {
  await db.memory.deleteMany({
    where: { shopId, memoryType, entityType, entityId },
  });
}

export type MemorySearchResult = {
  id: string;
  entityType: string | null;
  entityId: string | null;
  memoryType: MemoryType;
  content: string;
  metadata: unknown;
  source: string | null;
  confidence: number | null;
  importance: number | null;
  createdAt: Date;
  similarity: number;
};

export type SearchMemoryOptions = {
  memoryTypes?: MemoryType[];
  entityType?: string;
  limit?: number;
};

/** Cosine-similarity search over Memory, always scoped by shopId (tenant isolation is non-negotiable). */
export async function searchMemory(
  shopId: string,
  queryText: string,
  options: SearchMemoryOptions = {},
): Promise<MemorySearchResult[]> {
  const embedding = await embedText(queryText);
  const vectorLiteral = toVectorLiteral(embedding);
  const limit = options.limit ?? 10;

  const memoryTypeFilter = options.memoryTypes?.length
    ? Prisma.sql`AND "memoryType" = ANY(${options.memoryTypes}::"MemoryType"[])`
    : Prisma.empty;
  const entityTypeFilter = options.entityType
    ? Prisma.sql`AND "entityType" = ${options.entityType}`
    : Prisma.empty;

  return db.$queryRaw<MemorySearchResult[]>`
    SELECT
      id, "entityType", "entityId", "memoryType", content, metadata, source, confidence, importance, "createdAt",
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "Memory"
    WHERE "shopId" = ${shopId}
      ${memoryTypeFilter}
      ${entityTypeFilter}
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `;
}
