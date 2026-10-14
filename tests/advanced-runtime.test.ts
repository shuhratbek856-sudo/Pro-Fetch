import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCredential } from '../src/core/credentials.js';
import { executeTool } from '../src/core/execution-engine.js';
import { rankAndDedupeSearchResults } from '../src/core/search-ranking.js';
import type { ToolDefinition } from '../src/core/types.js';
import { cache } from '../src/core/cache.js';
import { fetchWithOptions, fetchFollowingSafeRedirects } from '../src/core/http-client.js';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { listTools } from '../src/router.js';

const makeTool = (name = 'test_read'): ToolDefinition => ({
  name,
  category: 'admin',
  description: 'A runtime test tool with a sufficiently long description',
  inputSchema: { type: 'object', properties: {} },
  handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
});

beforeEach(() => {
  vi.stubEnv('NO_PROXY', '*');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  cache.clear();
});

describe('smart tool discovery', () => {
  it('exposes a small meta-tool surface while retaining all registered tools internally', () => {
    expect(allTools()).toHaveLength(572);
    expect(listTools('smart')).toHaveLength(11);
    expect(listTools('smart').map((tool) => tool.name)).toContain('pro_fetch_tool_execute');
    // The Smart System contract: an eleven-tool surface that still reaches every registered tool.
    expect(listTools('smart').map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['pro_capability_call', 'pro_capability_map', 'pro_research_deep']),
    );
    expect(allTools().length).toBeGreaterThan(listTools('smart').length * 10);
  });

  it('discovers relevant tools and invokes them through the guarded executor', async () => {
    const found = await dispatch('pro_fetch_tool_list_details', {
      query: 'cache stats',
      category: 'archive',
      include_schema: true,
      limit: 5,
    });
    expect(found.content[0]?.text).toContain('pro_fetch_cache_stats');
    const invoked = await dispatch('pro_fetch_tool_execute', { tool_name: 'pro_fetch_cache_stats', arguments: {} });
    expect(invoked.isError).not.toBe(true);
    expect(invoked.content[0]?.text).toContain('"tool": "pro_fetch_cache_stats"');
  });
});

describe('shared tool execution policy', () => {
  it('attaches request and timing metadata', async () => {
    const ran = await executeTool(makeTool(), {}, async () => 42);
    expect(ran.value).toBe(42);
    expect(ran.metadata.requestId).toBeTruthy();
    expect(ran.metadata.status).toBe('success');
    expect(ran.metadata.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('blocks mutation tools and unsafe HTTP methods while allowing read-only configuration tools', async () => {
    vi.stubEnv('PRO_FETCH_READ_ONLY', 'true');
    await expect(executeTool(makeTool('pro_fetch_github_pr_merge'), {}, async () => 'nope')).rejects.toThrow(
      'PRO_FETCH_READ_ONLY',
    );
    await expect(
      executeTool(makeTool('pro_fetch_http_request'), { method: 'DELETE' }, async () => 'nope'),
    ).rejects.toThrow('HTTP DELETE');
    await expect(executeTool(makeTool('pro_fetch_config_get'), {}, async () => 'safe')).resolves.toMatchObject({
      value: 'safe',
    });
  });

  it('blocks output paths outside the configured file sandbox', async () => {
    const os = await import('node:os');
    const path = await import('node:path');
    vi.stubEnv('PRO_FETCH_OUTPUT_ROOT', path.join(os.tmpdir(), 'pro-fetch-sandbox'));
    await expect(
      executeTool(
        makeTool('pro_fetch_convert_file'),
        { output_path: path.resolve(os.tmpdir(), 'outside.txt') },
        async () => 'nope',
      ),
    ).rejects.toThrow('PRO_FETCH_OUTPUT_ROOT');
  });
});

describe('credential files and search ranking', () => {
  it('reads a secret from a configured file without requiring it in the MCP JSON', async () => {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const secretFile = path.join(os.tmpdir(), `pro-fetch-secret-${process.pid}.txt`);
    await fs.writeFile(secretFile, ' local-secret-value \n', { mode: 0o600 });
    vi.stubEnv('PF_TEST_SECRET_FILE', secretFile);
    try {
      expect(getCredential('PF_TEST_SECRET')).toBe('local-secret-value');
    } finally {
      await fs.rm(secretFile, { force: true });
    }
  });

  it('deduplicates tracking URLs and ranks title matches higher', () => {
    const out = rankAndDedupeSearchResults(
      'typescript compiler',
      [
        { title: 'General discussion', url: 'https://example.org/article?utm_source=mail', snippet: 'other' },
        { title: 'TypeScript compiler guide', url: 'https://example.org/guide', snippet: 'Compiler options' },
        { title: 'Duplicate', url: 'https://example.org/article', snippet: 'tracking variant' },
      ],
      10,
    );
    expect(out).toHaveLength(2);
    expect(out[0]?.title).toBe('TypeScript compiler guide');
  });
});

describe('HTTP caching, validation and retries', () => {
  it('caches public GET results', async () => {
    const mocked = vi.fn(
      async () =>
        new Response('cached payload', { status: 200, headers: { 'cache-control': 'max-age=60', etag: '"v1"' } }),
    );
    vi.stubGlobal('fetch', mocked);
    const first = await fetchWithOptions('http://93.184.216.34/cacheable-path');
    const second = await fetchWithOptions('http://93.184.216.34/cacheable-path');
    expect(first.text).toBe('cached payload');
    expect(second.text).toBe('cached payload');
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('uses ETag to revalidate an expired cache entry', async () => {
    vi.useFakeTimers();
    const mocked = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('latest body', { status: 200, headers: { 'cache-control': 'max-age=1', etag: '"etag-1"' } }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 304, headers: { 'cache-control': 'max-age=30' } }));
    vi.stubGlobal('fetch', mocked);
    try {
      await fetchWithOptions('http://93.184.216.34/revalidate-path', { cacheTtlMs: 1000 });
      await vi.advanceTimersByTimeAsync(1100);
      const result = await fetchWithOptions('http://93.184.216.34/revalidate-path', { cacheTtlMs: 1000 });
      expect(result.text).toBe('latest body');
      expect(mocked).toHaveBeenCalledTimes(2);
      const secondInit = mocked.mock.calls[1]?.[1] as RequestInit;
      expect(new Headers(secondInit.headers).get('if-none-match')).toBe('"etag-1"');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not mark a response truncated when it is exactly the allowed byte limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('12345', { status: 200 })),
    );
    const response = await fetchWithOptions('http://93.184.216.34/exact-size', { maxBytes: 5, cache: false });
    expect(response.text).toBe('12345');
    expect(response.truncated).toBe(false);
  });

  it('does not retry a POST request on transient status', async () => {
    const mocked = vi.fn(async () => new Response('temporary', { status: 503 }));
    vi.stubGlobal('fetch', mocked);
    const response = await fetchWithOptions('http://93.184.216.34/mutate', {
      method: 'POST',
      body: '{}',
      retries: 3,
      cache: false,
    });
    expect(response.status).toBe(503);
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it('redacts proxy credentials in diagnostics', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy-user:proxy-secret@127.0.0.1:8080');
    const response = await dispatch('pro_fetch_proxy_status', {});
    const text = response.content[0]?.text ?? '';
    expect(text).toContain('credentialsPresent');
    expect(text).not.toContain('proxy-secret');
    expect(text).not.toContain('proxy-user');
  });

  it('strips authorization credentials when a redirect changes origin', async () => {
    const mocked = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://1.1.1.1/redirected' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mocked);
    await fetchFollowingSafeRedirects('https://93.184.216.34/start', {
      method: 'GET',
      headers: { authorization: 'Bearer private-token', 'x-api-key': 'private-key' },
    });
    const secondInit = mocked.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get('authorization')).toBeNull();
    expect(new Headers(secondInit.headers).get('x-api-key')).toBeNull();
  });
});

describe('MAX platform input bounds and read-only database guard', () => {
  it('rejects malformed OSV batch payloads before any network request', async () => {
    const malformed = await dispatch('pro_fetch_security_osv_batch', { body: JSON.stringify({ query: [] }) });
    expect(malformed.isError).toBe(true);
    expect(malformed.content[0]?.text).toContain('INVALID_OSV_BATCH');
  });

  it('rejects oversized OSV batch payloads before any network request', async () => {
    const oversized = await dispatch('pro_fetch_security_osv_batch', { body: 'x'.repeat(1024 * 1024 + 1) });
    expect(oversized.isError).toBe(true);
    expect(oversized.content[0]?.text).toContain('INPUT_TOO_LARGE');
  });

  it('rejects multi-statement and write-capable database SQL before spawning a client', async () => {
    vi.stubEnv('POSTGRES_URL', 'postgres://test:test@127.0.0.1:5432/test');
    const multi = await dispatch('pro_fetch_database_postgres_query', { sql: 'SELECT 1; SELECT 2' });
    expect(multi.isError).toBe(true);
    expect(multi.content[0]?.text).toContain('MULTI_STATEMENT_BLOCKED');

    const writeCte = await dispatch('pro_fetch_database_postgres_query', {
      sql: 'WITH changed AS (DELETE FROM accounts RETURNING id) SELECT id FROM changed',
    });
    expect(writeCte.isError).toBe(true);
    expect(writeCte.content[0]?.text).toContain('READ_ONLY_SQL_ONLY');
  });
});
