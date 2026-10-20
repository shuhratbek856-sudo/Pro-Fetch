import { assertWritable } from './read-only-guard.js';

interface CacheEntry {
  value: string;
  createdAt: number;
  expiresAt: number;
  meta?: Record<string, unknown>;
}

const store = new Map<string, CacheEntry>();
const stats = { hits: 0, misses: 0 };
let maxEntries = 5000;
let defaultTtl = 3_600_000;

function touch(key: string, entry: CacheEntry): void {
  store.delete(key);
  store.set(key, entry);
}

export const cache = {
  get(key: string): { value: string; createdAt: number; meta?: Record<string, unknown> } | undefined {
    const entry = store.get(key);
    if (!entry) {
      stats.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      stats.misses++;
      return undefined;
    }
    stats.hits++;
    touch(key, entry);
    return { value: entry.value, createdAt: entry.createdAt, meta: entry.meta };
  },

  /** Returns even expired values for HTTP conditional requests using ETag/Last-Modified. */
  getStale(
    key: string,
  ): { value: string; createdAt: number; expiresAt: number; meta?: Record<string, unknown> } | undefined {
    const entry = store.get(key);
    if (!entry) {
      stats.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) stats.misses++;
    else stats.hits++;
    touch(key, entry);
    return { value: entry.value, createdAt: entry.createdAt, expiresAt: entry.expiresAt, meta: entry.meta };
  },

  put(key: string, value: string, ttlMs?: number, meta?: Record<string, unknown>): void {
    // Every write is refused in read-only mode, whoever asked. 149 of 652 tools reach this method while
    // being classified read-only by name, so a check at the tool boundary was never going to hold.
    assertWritable('cache yozuvi');
    if (store.has(key)) store.delete(key);
    while (store.size >= maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
    store.set(key, { value, createdAt: Date.now(), expiresAt: Date.now() + Math.max(1, ttlMs ?? defaultTtl), meta });
  },

  search(needle: string): Array<{ key: string; value: string }> {
    const out: Array<{ key: string; value: string }> = [];
    for (const [key, entry] of store) {
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        continue;
      }
      if (entry.value.includes(needle)) out.push({ key, value: entry.value });
      if (out.length >= 50) break;
    }
    return out;
  },

  keys(prefix: string): string[] {
    return Array.from(store.keys()).filter((key) => key.startsWith(prefix));
  },

  delete(pattern: string): number {
    assertWritable('cache o chirish');
    // Exact keys only. `delete` is called with full keys three times (robots-policy invalidation,
    // crawl state, session revoke), but `includes` made any key containing the target a casualty:
    // revoking session `sess1` also recorded `auth:session:xsess11` as revoked. Revocation is the
    // one case where over-matching is a security behaviour, not just data loss.
    let deleted = 0;
    for (const key of Array.from(store.keys())) {
      if (key === pattern) {
        store.delete(key);
        deleted++;
      }
    }
    return deleted;
  },

  clear(): void {
    assertWritable('cache tozalanishi');
    store.clear();
  },

  stats(): { size: number; hits: number; misses: number } {
    return { size: store.size, hits: stats.hits, misses: stats.misses };
  },

  tune(opts: { defaultTtlMs?: number; maxEntries?: number }): void {
    // Tuning changes what every future write does, so it is a write even though it stores nothing.
    assertWritable('cache sozlamalari');
    if (opts.defaultTtlMs !== undefined && Number.isFinite(opts.defaultTtlMs))
      defaultTtl = Math.max(1, Math.min(Math.floor(opts.defaultTtlMs), 7 * 24 * 60 * 60_000));
    if (opts.maxEntries !== undefined && Number.isFinite(opts.maxEntries))
      maxEntries = Math.max(10, Math.min(Math.floor(opts.maxEntries), 100_000));
    while (store.size > maxEntries) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  },
};
