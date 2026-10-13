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

describe('a repository without `main` still downloads', () => {
  it('falls back to `master` when no ref was requested', async () => {
    // octocat/Hello-World defaults to `master`. Asking for `main` only used to fail it with a 404
    // that read as "repository not found".
    const result = await dispatch('pro_gh_repo_full_clone', { owner: 'octocat', repo: 'Hello-World' });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/\(master\)/);
  }, 90_000);

  it('names the tried branches instead of reporting a bare 404', async () => {
    const result = await dispatch('pro_gh_repo_full_clone', { owner: 'nodejs', repo: 'no-such-repo-xyz' });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/sinab ko‘rildi/);
    expect(text(result)).not.toMatch(/Download HTTP 404/);
  }, 90_000);

  it('honours an explicit ref exactly and does not retry it', async () => {
    const result = await dispatch('pro_gh_repo_full_clone', { owner: 'nodejs', repo: 'node', ref: 'nope' });
    expect(result.isError).toBe(true);
    // Only the requested ref was tried — the fallback applies to the default, not to an override.
    expect(text(result)).toMatch(/nope/);
    expect(text(result)).not.toMatch(/master/);
  }, 90_000);
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
