import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { listTools } from '../src/router.js';
import { currentProfile } from '../src/core/profile.js';
import { runStep, urlsFrom, jsonFrom, rowsFrom, pick } from '../src/core/composite.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'smart';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const parseJson = (result: ToolResult): Record<string, unknown> => {
  const cleaned = text(result)
    .replace(/^```json\s*/gm, '')
    .replace(/```$/gm, '')
    .trim();
  const start = cleaned.indexOf('{');
  return JSON.parse(cleaned.slice(start, cleaned.lastIndexOf('}') + 1)) as Record<string, unknown>;
};

const COMPOSITES = [
  'pro_capability_call',
  'pro_capability_map',
  'pro_research_deep',
  'pro_fetch_ingest',
  'pro_audit_page',
  'pro_repo_audit',
  'pro_pr_review',
  'pro_site_scan',
  'pro_data_pipeline',
];

describe('Smart System: the ten-tool surface', () => {
  it('exposes exactly ten tools, matching the tightest common client budget', () => {
    const visible = listTools('smart');
    expect(visible.length).toBe(10);
  });

  it('every smart tool exists in the registry and is a composite or an executor', () => {
    for (const name of COMPOSITES) {
      expect(allTools().some((tool) => tool.name === name)).toBe(true);
    }
  });

  it('reaches the whole registry through the batch executor', async () => {
    // The point of the design: a tool outside the visible set is still callable in one round trip.
    const hidden = allTools().find((tool) => !listTools('smart').some((v) => v.name === tool.name));
    expect(hidden).toBeDefined();
    const result = await dispatch('pro_capability_call', {
      calls: [{ tool: hidden!.name, arguments: {}, label: 'hidden' }],
    });
    const payload = parseJson(result);
    const results = payload.results as Array<{ tool: string; ok: boolean; error?: string }>;
    expect(results[0]?.tool).toBe(hidden!.name);
    // Whether it succeeds depends on its required arguments, but it must not be "unknown tool".
    expect(results[0]?.error ?? '').not.toMatch(/Nomalum tool/);
  });

  it('runs several tools in a single round trip', async () => {
    const result = await dispatch('pro_capability_call', {
      calls: [
        { tool: 'pro_fetch_hash_string', arguments: { text: 'batch' }, label: 'hash' },
        { tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'uuid' },
        { tool: 'pro_fetch_text_stats', arguments: { text: 'one two three four' }, label: 'stats' },
      ],
    });
    const payload = parseJson(result);
    expect(payload.total).toBe(3);
    expect(payload.ok).toBe(3);
    const results = payload.results as Array<{ ok: boolean }>;
    expect(results.every((entry) => entry.ok)).toBe(true);
  });

  it('isolates a failing entry so the rest of the batch still runs', async () => {
    const result = await dispatch('pro_capability_call', {
      calls: [
        { tool: 'definitely_not_registered', arguments: {}, label: 'bogincha' },
        { tool: 'pro_fetch_hash_string', arguments: { text: 'still-runs' }, label: 'keyingi' },
      ],
    });
    const payload = parseJson(result);
    expect(payload.total).toBe(2);
    expect(payload.failed).toBe(1);
    const results = payload.results as Array<{ label: string; ok: boolean }>;
    expect(results[1]?.ok).toBe(true);
  });

  it('caps the batch size so one call cannot fan out without bound', async () => {
    const calls = Array.from({ length: 60 }, () => ({ tool: 'pro_fetch_hash_string', arguments: { text: 'x' } }));
    const result = await dispatch('pro_capability_call', { calls });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/50/);
  });

  it('cannot be used to escape an allowlist', async () => {
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_capability_call,pro_fetch_hash_string';
    const result = await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'uuid' }],
    });
    const payload = parseJson(result);
    const results = payload.results as Array<{ ok: boolean; error?: string }>;
    expect(results[0]?.ok).toBe(false);
    expect(results[0]?.error).toMatch(/allowlist/);
  });

  it('is itself blocked when the allowlist excludes it', async () => {
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_fetch_hash_string';
    const result = await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_hash_string', arguments: { text: 'x' } }],
    });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/allowlist/);
  });

  it('maps plain-language intent to real tools with schemas', async () => {
    const result = await dispatch('pro_capability_map', { task: 'arxiv dan ilmiy maqola qidirish', limit: 5 });
    const payload = parseJson(result);
    expect(payload.matched).toBeGreaterThan(0);
    const categories = payload.categories as Array<{ tools: Array<{ name: string; inputSchema?: unknown }> }>;
    const names = categories.flatMap((entry) => entry.tools.map((tool) => tool.name));
    expect(names.length).toBeGreaterThan(0);
    // The search provider must surface for an academic-paper task.
    expect(names.some((name) => /arxiv|academic|paper/i.test(name))).toBe(true);
  });

  it('rejects an empty batch instead of silently succeeding', async () => {
    const result = await dispatch('pro_capability_call', { calls: [] });
    expect(result.isError).toBe(true);
  });

  it('reports missing required input as an error, not a crash', async () => {
    for (const name of ['pro_research_deep', 'pro_fetch_ingest', 'pro_audit_page', 'pro_repo_audit']) {
      const result = await dispatch(name, {});
      expect(result.isError).toBe(true);
      expect(text(result).length).toBeGreaterThan(0);
    }
  });
});

describe('composite pipeline helpers', () => {
  it('reports a step failure as data rather than throwing', async () => {
    const outcome = await runStep('bad', 'not_a_tool', {});
    expect(outcome.ok).toBe(false);
    expect(outcome.tool).toBe('not_a_tool');
    expect(outcome.error).toBeTruthy();
    expect(outcome.ms).toBeGreaterThanOrEqual(0);
  });

  it('collects unique URLs from step output', () => {
    const outcomes = [
      { step: 'a', tool: 't', ok: true, output: 'see https://example.com/one and https://example.com/two', ms: 1 },
      { step: 'b', tool: 't', ok: true, output: 'again https://example.com/one plus https://other.org/x', ms: 1 },
      { step: 'c', tool: 't', ok: false, output: 'https://ignored.example', ms: 1 },
    ];
    expect(urlsFrom(outcomes)).toEqual(['https://example.com/one', 'https://example.com/two', 'https://other.org/x']);
  });

  it('parses JSON out of a fenced tool result', () => {
    const outcome = { step: 'a', tool: 't', ok: true, output: '# Title\n\n```json\n{"a":1}\n```', ms: 1 };
    expect(jsonFrom(outcome)).toEqual({ a: 1 });
    expect(rowsFrom(outcome)).toEqual([]);
  });

  it('reads the first matching field name across provider shapes', () => {
    expect(pick({ full_name: 'a/b' }, 'name', 'full_name')).toBe('a/b');
    expect(pick({ path: '/x' }, 'filename', 'path')).toBe('/x');
    expect(pick({}, 'missing')).toBe('');
  });

  it('credits the underlying tools in usage stats, not just the composite', async () => {
    await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_hash_string', arguments: { text: 'credit-check' } }],
    });
    const stats = parseJson(await dispatch('pro_fetch_usage_stats', {}));
    const payload = JSON.stringify(stats);
    // Both the batch executor and the tool it ran must appear, so per-tool telemetry stays honest.
    expect(payload).toContain('pro_capability_call');
    expect(payload).toContain('pro_fetch_hash_string');
  });
});

describe('profile wiring', () => {
  it('smart is the documented profile and stays at ten entries', () => {
    expect(currentProfile()).toBe('smart');
    expect(listTools('smart').length).toBe(10);
  });
});
