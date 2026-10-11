interface Bucket {
  tokens: number;
  last: number;
}
const buckets = new Map<string, Bucket>();

export function take(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
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
