// Parallel-request limits for pro_fetch_fetch_batch.
//
// The bug this locks: `concurrency` and the `urls` array were passed straight through with no bound, so
// a caller could ask for an arbitrarily wide fan-out or a batch large enough that the single combined
// response exceeded what the MCP transport / client can hold — which surfaces as an error returned at
// some N. The code must clamp to the server's own limits even when the user asks for more.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';

describe('fetch_batch parallel limits', () => {
  it('rejects a batch larger than the cap before any network call', async () => {
    const urls = Array.from({ length: 6000 }, (_, i) => `https://example.invalid/${i}`);
    const r = await dispatch('pro_fetch_fetch_batch', { urls, concurrency: 1000 });
    expect(r.isError).toBe(true);
    const text = (r.content ?? []).map((c) => c.text).join('\n');
    expect(text).toMatch(/bo['‘]ling|tagacha|chegara/i);
  });

  it('refuses an empty url list', async () => {
    const r = await dispatch('pro_fetch_fetch_batch', { urls: [] });
    expect(r.isError).toBe(true);
  });
});
