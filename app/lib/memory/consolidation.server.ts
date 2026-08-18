import db from "../../db.server";

const ARCHIVE_AGE_DAYS = 90;
const ARCHIVE_IMPORTANCE_THRESHOLD = 0.4;

// Never auto-archive AI decision/outcome history — those are the record the
// learning mechanism (§10.1) depends on, regardless of age or importance score.
const NEVER_ARCHIVE_TYPES = ["DECISION", "OUTCOME"] as const;

/**
 * Basic memory consolidation (spec §16): archives (soft-deletes via expiresAt,
 * the same field searchMemory already filters on) low-importance memories past
 * an age threshold, so retrieval stays useful and the table doesn't grow
 * unbounded. Not the full extract/summarize/promote pipeline the spec
 * describes — just the "don't allow unlimited memories" half of it.
 */
export async function consolidateMemories(shopId: string): Promise<{ archived: number }> {
  const cutoff = new Date(Date.now() - ARCHIVE_AGE_DAYS * 24 * 60 * 60 * 1000);

  const { count } = await db.memory.updateMany({
    where: {
      shopId,
      createdAt: { lt: cutoff },
      expiresAt: null,
      memoryType: { notIn: [...NEVER_ARCHIVE_TYPES] },
      OR: [{ importance: { lt: ARCHIVE_IMPORTANCE_THRESHOLD } }, { importance: null }],
    },
    data: { expiresAt: new Date() },
  });

  return { archived: count };
}
