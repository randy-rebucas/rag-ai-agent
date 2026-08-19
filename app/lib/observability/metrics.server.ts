import type { Prisma } from "@prisma/client";
import db from "../../db.server";

/**
 * Fire-and-forget metric write (spec §39) — never awaited by callers, never
 * allowed to throw into the calling request. This is a minimal metrics stream,
 * not a full observability platform: no aggregation/dashboards, just a queryable
 * log of latency/usage/outcome numbers.
 */
export function recordMetric(name: string, value: number, opts: { shopId?: string; metadata?: Record<string, unknown> } = {}): void {
  db.metric
    .create({
      data: { name, value, shopId: opts.shopId ?? null, metadata: (opts.metadata as Prisma.InputJsonValue) ?? undefined },
    })
    .catch((error: unknown) => console.error(`Failed to record metric ${name}:`, error));
}

/** Wraps an async operation, recording its latency (ms) and success/failure as metrics. */
export async function timed<T>(
  name: string,
  fn: () => Promise<T>,
  opts: { shopId?: string; metadata?: Record<string, unknown> } = {},
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    recordMetric(`${name}.latency_ms`, Date.now() - start, opts);
    recordMetric(`${name}.success`, 1, opts);
    return result;
  } catch (error) {
    recordMetric(`${name}.latency_ms`, Date.now() - start, opts);
    recordMetric(`${name}.failure`, 1, opts);
    throw error;
  }
}
