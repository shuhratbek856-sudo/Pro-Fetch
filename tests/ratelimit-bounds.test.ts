// Fix 7 — the rate-limit bucket map was keyed by caller-controlled names and never pruned, so a
// long-lived process touching high-cardinality keys (domain:<host> per request) grew it forever.
// take() now prunes fully-refilled, long-idle buckets once the map hits MAX_BUCKETS. Deleting an
// idle bucket is lossless: it has already refilled, and the next access recreates it.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { take, bucketsSnapshot, resetBuckets } from '../src/core/ratelimit.js';

const MAX_BUCKETS = 50_000;

afterEach(() => {
  resetBuckets();
  vi.useRealTimers();
});

describe('rate-limit buckets are bounded', () => {
  it('prunes stale idle buckets once the map reaches the cap', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);

    // Fill the map to the cap with distinct keys, all stamped "now".
    for (let i = 0; i < MAX_BUCKETS; i += 1) take(`domain:host-${i}`);
    expect(Object.keys(bucketsSnapshot()).length).toBe(MAX_BUCKETS);

    // Advance well past IDLE_MS so every bucket is stale, then trigger a take that exceeds the cap.
    vi.advanceTimersByTime(16 * 60_000);
    take('domain:trigger');

    const after = Object.keys(bucketsSnapshot());
    // The 50k stale buckets were pruned; only the new one remains.
    expect(after).toContain('domain:trigger');
    expect(after).not.toContain('domain:host-0');
    expect(after.length).toBeLessThan(10);
  });

  it('does not prune recently-used buckets', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000_000_000);
    take('active:key', 100, 60_000);
    take('domain:trigger'); // size is 2, far below the cap → no prune runs
    expect(Object.keys(bucketsSnapshot())).toContain('active:key');
  });
});
