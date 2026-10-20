interface Bucket {
  tokens: number;
  last: number;
  /** The limit this bucket was opened with, so a status can refill it the way `take` does. */
  limit: number;
  /** The window this bucket was opened with, for the same reason. */
  windowMs: number;
}
const buckets = new Map<string, Bucket>();

export function take(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: limit, last: now, limit, windowMs };
  b.limit = limit;
  b.windowMs = windowMs;
  b.tokens = Math.min(b.limit, b.tokens + ((now - b.last) / b.windowMs) * b.limit);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

/**
 * What a bucket holds right now, without spending from it.
 *
 * The refill is the same computation `take` performs, and a key that was never used reports a full
 * bucket rather than an empty one. Both were wrong before: a bucket that had been touched once and
 * then left alone for a minute reported the stale count, and a key that had never been touched
 * reported zero - a status that said the limiter was exhausted when it would have allowed sixty
 * requests. A status that does not predict the next call is worse than no status.
 */
export function bucketStatus(key: string, limit = 60, windowMs = 60_000): { tokens: number; limit: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b) return { tokens: limit, limit };
  const tokens = Math.min(b.limit, b.tokens + ((now - b.last) / b.windowMs) * b.limit);
  return { tokens: Math.floor(tokens), limit: b.limit };
}

/**
 * Every bucket, refilled to what it would hold now.
 *
 * The snapshot used to read the stored counts, which are only brought up to date when a call is
 * actually made - so an idle limiter looked exhausted in the diagnostics that report it.
 */
export function bucketsSnapshot(): Record<string, number> {
  const now = Date.now();
  const out: Record<string, number> = {};
  for (const [key, b] of buckets) {
    const tokens = Math.min(b.limit, b.tokens + ((now - b.last) / b.windowMs) * b.limit);
    out[key] = Math.floor(tokens);
  }
  return out;
}

export function resetBuckets(): void {
  buckets.clear();
}
