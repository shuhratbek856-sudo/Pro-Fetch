import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { executeTool } from '../src/core/execution-engine.js';
import { assertToolAllowed, realResolve } from '../src/core/security-policy.js';
import { assertGithubInput } from '../src/core/github-input-guard.js';
import type { ToolDefinition } from '../src/core/types.js';

function fakeTool(
  name: string,
  category: string,
  handler: ToolDefinition['handler'] = async () => ({ content: [{ type: 'text', text: 'ok' }] }),
): ToolDefinition {
  return { name, description: 'hardening test tool', category, inputSchema: { type: 'object' }, handler };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('execution engine: timed-out handlers cannot hold slots forever', () => {
  it('releases the category slot after the abandon grace period', async () => {
    vi.stubEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', '1');
    vi.stubEnv('PRO_FETCH_TOOL_TIMEOUT_MS', '1000');
    vi.stubEnv('PRO_FETCH_ABANDON_GRACE_MS', '100');

    const stuck = fakeTool(
      'hardening_stuck',
      'hardening_slot_cat',
      () =>
        new Promise(() => {
          /* never settles */
        }),
    );
    await expect(executeTool(stuck, {}, () => stuck.handler({}))).rejects.toThrow(/ichida tugamadi/);

    // With a category capacity of 1 this second call would wait forever if the stuck handler kept its slot.
    const quick = fakeTool('hardening_quick', 'hardening_slot_cat');
    const started = Date.now();
    const outcome = await executeTool(quick, {}, () => quick.handler({}));
    expect(outcome.value.content[0].text).toBe('ok');
    expect(Date.now() - started).toBeLessThan(5000);
  }, 20_000);
});

describe('PRO_FETCH_OUTPUT_ROOT follows symlinks', () => {
  it('blocks writes that escape the sandbox through a link, and allows ordinary paths', async () => {
    const base = await mkdtemp(path.join(tmpdir(), 'pro-fetch-sandbox-'));
    try {
      const root = path.join(base, 'root');
      const outside = path.join(base, 'outside');
      await mkdir(root);
      await mkdir(outside);
      await symlink(outside, path.join(root, 'link'), 'junction');
      vi.stubEnv('PRO_FETCH_OUTPUT_ROOT', root);

      const tool = fakeTool('hardening_writer', 'archive');
      expect(() => assertToolAllowed(tool, { output_path: path.join(root, 'link', 'new', 'file.txt') })).toThrow(
        /sandbox/,
      );
      expect(() => assertToolAllowed(tool, { output_path: path.join(root, '..', 'outside', 'file.txt') })).toThrow(
        /sandbox/,
      );
      expect(() => assertToolAllowed(tool, { output_path: path.join(root, 'ok', 'file.txt') })).not.toThrow();
      expect(realResolve(path.join(root, 'link', 'x.txt')).startsWith(realResolve(outside))).toBe(true);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe('github input guard', () => {
  const gh = { name: 'pro_gh_repo_info', category: 'github' };

  it('accepts ordinary values', () => {
    expect(() => assertGithubInput(gh, { owner: 'octocat', repo: 'Hello-World' })).not.toThrow();
    expect(() =>
      assertGithubInput(gh, {
        owner: 'octocat',
        repo: 'hello.world_2',
        sha: 'main',
        ref: 'release/v1.2',
        path: 'src/index.ts',
      }),
    ).not.toThrow();
    expect(() =>
      assertGithubInput(gh, {
        owner: 'octocat',
        repo: 'Hello-World',
        issue_number: 42,
        per_page: 50,
        page: 2,
        max_pages: 3,
      }),
    ).not.toThrow();
    expect(() => assertGithubInput(gh, { base: 'main', head: 'someone:feature-x', tag: 'v1.0.0' })).not.toThrow();
    expect(() => assertGithubInput(gh, {})).not.toThrow();
  });

  it('rejects values that could redirect the API path or query', () => {
    expect(() => assertGithubInput(gh, { owner: 'octocat', repo: '../../user' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'octocat', repo: 'a/b' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'octo/cat', repo: 'x' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: '..', repo: 'x' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', sha: 'abc?per_page=1' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', ref: 'x#frag' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', ref: 'x..y' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', path: '../../etc/passwd' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', path: 'a/%2e%2e/b' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', per_page: '20&x=1' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', issue_number: -1 })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 'a', repo: 'b', pr_number: 1.5 })).toThrow();
    expect(() => assertGithubInput(gh, { gist_id: '../x' })).toThrow();
    expect(() => assertGithubInput(gh, { owner: 123 })).toThrow();
  });

  it('only applies to the github category', () => {
    expect(() =>
      assertGithubInput({ name: 'pro_fetch_fetch_url', category: 'http' }, { repo: '../../user', path: '../x' }),
    ).not.toThrow();
  });

  it('blocks a malicious call before any network request is made', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await dispatch('pro_gh_repo_info', { owner: 'octocat', repo: '../../user' });
    expect(res.isError).toBe(true);
    expect((res as any).structuredContent?.error?.code).toBe('INVALID_INPUT');
    expect(/'repo'/.test(res.content[0].text)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('github pack completeness', () => {
  it('registers the contributor and single-release tools', () => {
    const names = new Set(allTools().map((tool) => tool.name));
    expect(names.has('pro_gh_repo_contributors')).toBe(true);
    expect(names.has('pro_gh_release_read')).toBe(true);
    expect(allTools().filter((tool) => tool.category === 'github').length).toBe(49);
  });
});
