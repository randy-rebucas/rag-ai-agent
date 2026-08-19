// Spec §37 Security: rate limiting. Simple in-memory sliding window, keyed by
// shopId — single-instance only (no shared store across processes), which is
// an honest limitation, not silently hidden. Good enough to stop a single
// runaway client from hammering the (paid, per-call) LLM/embeddings APIs;
// a multi-instance deployment would need a shared store (Redis, DB) instead.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

const requestLog = new Map<string, number[]>();

export class RateLimitError extends Error {
  constructor(public retryAfterMs: number) {
    super("Rate limit exceeded");
  }
}

/** Throws RateLimitError if `key` has exceeded the allowed request rate; otherwise records this request. */
export function checkRateLimit(key: string): void {
  const now = Date.now();
  const timestamps = (requestLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterMs = WINDOW_MS - (now - timestamps[0]);
    requestLog.set(key, timestamps);
    throw new RateLimitError(retryAfterMs);
  }

  timestamps.push(now);
  requestLog.set(key, timestamps);
}
