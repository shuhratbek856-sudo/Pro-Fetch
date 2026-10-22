interface Bucket {
  tokens: number;
  last: number;
}
const buckets = new Map<string, Bucket>();

/**
 * The map is keyed by caller-controlled names (e.g. `domain:<hostname>`), so without a bound a
 * long-lived process that touches many distinct keys grows it forever. Pruning a bucket idle longer
 * than IDLE_MS is lossless — it is fully refilled by then, and the next access recreates it.
 */
const MAX_BUCKETS = 50_000;
const IDLE_MS = 15 * 60_000;

function pruneStaleBuckets(now: number): void {
  for (const [key, b] of buckets) {
    if (now - b.last > IDLE_MS) buckets.delete(key);
  }
}

export function take(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS) pruneStaleBuckets(now);
  const b = buckets.get(key) ?? { tokens: limit, last: now };
  b.tokens = Math.min(limit, b.tokens + ((now - b.last) / windowMs) * limit);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return true;
}

export function bucketStatus(key: string): { tokens: number } {
  return { tokens: Math.floor(buckets.get(key)?.tokens ?? 0) };
}

export function bucketsSnapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, b] of buckets) out[k] = Math.floor(b.tokens);
  return out;
}

export function resetBuckets(): void {
  buckets.clear();
}
