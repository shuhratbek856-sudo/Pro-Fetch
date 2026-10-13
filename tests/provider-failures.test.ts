import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';
import type { ToolResult } from '../src/core/types.js';

const text = (r: ToolResult): string =>
  (r.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

/**
 * Failures the credential matrix surfaced against live providers.
 *
 * Each of these looked like a broken tool until the argument or the upstream was examined: a
 * redirect loop that reported a hop count, and a missing identifier that reported a 404. Both now
 * say what actually happened.
 */
describe('redirect loops name the loop', () => {
  it('reports bot protection instead of a hop count', async () => {
    // remoteok.com answers an unknown user-agent with `302 /` from `/` itself, forever. The old
    // message — `HTTP redirect limit exceeded (5)` — sent the caller counting redirects.
    const result = await dispatch('pro_fetch_jobs_search', { query: 'nodejs', limit: 1 });
    expect(result.isError).toBe(true);
    const body = text(result);
    expect(body).toMatch(/redirect loop/i);
    expect(body).toMatch(/remoteok\.com/);
    expect(body).not.toMatch(/limit exceeded/);
  }, 30_000);
});

describe('a missing identifier fails before the network', () => {
  it('gist_read names gist_id instead of reporting a 404', async () => {
    // Without the guard the call went out as `/gists/undefined` and came back 404, which reads as
    // "gist not found" when the truth is "no gist was named".
    for (const args of [{}, { gist_id: '' }, { gist_id: '   ' }]) {
      const result = await dispatch('pro_gh_gist_read', args);
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(text(result), JSON.stringify(args)).toMatch(/gist_id/);
    }
  });
});
