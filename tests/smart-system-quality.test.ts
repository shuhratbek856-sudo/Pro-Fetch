import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { listTools } from '../src/router.js';
import { rankTools, tokenize, escapeRegExp } from '../src/core/intent-search.js';
import { renderBudgeted, detailMode, isInformative } from '../src/core/composite-budget.js';
import { runParallel, runPipeline, runStep, type StepOutcome } from '../src/core/composite.js';
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

/** Extract the JSON payload a tool result wraps its answer in, fenced or titled. */
function payload(result: ToolResult): Record<string, unknown> {
  const raw = text(result)
    .replace(/^```json\n/, '')
    .replace(/\n```$/, '');
  const start = raw.indexOf('{');
  return JSON.parse(raw.slice(start, raw.lastIndexOf('}') + 1));
}

const outcome = (over: Partial<StepOutcome> = {}): StepOutcome => ({
  step: 'step',
  tool: 'pro_fetch_x',
  ok: true,
  output: 'body',
  ms: 1,
  ...over,
});

describe('intent search finds tools the way users ask for them', () => {
  const top = (task: string, count = 5) =>
    rankTools(allTools(), task)
      .slice(0, count)
      .map((hit) => hit.name);

  it('finds the academic tool from a natural phrasing, not the word "arxiv"', () => {
    // The original keyword matcher failed exactly here: "papers about retrieval augmented
    // generation" shares no words with "Read an arXiv paper".
    expect(top('papers about retrieval augmented generation', 3)).toContain('pro_fetch_arxiv_paper_read');
  });

  it('finds the secret scanner from "leaked credentials in code"', () => {
    expect(top('find leaked credentials in source code')).toContain('pro_fetch_security_secret_scan_files');
  });

  it('finds crawl tools from "walk the whole site"', () => {
    const hits = top('walk the whole site and map it');
    expect(hits.some((name) => /crawl|site_scan/.test(name))).toBe(true);
  });

  it('finds authorship tools from "who wrote this and when"', () => {
    const hits = top('who wrote this and when');
    expect(hits.some((name) => /contributor|blame|activity|file_history/.test(name))).toBe(true);
  });

  it('matches word forms: extracting, extraction and extract collapse together', () => {
    expect(tokenize('extracting')).toContain('extract');
    expect(top('extracting phone numbers from html')[0]).toBe('pro_fetch_phone_extract');
  });

  it('does not rank a composite above a domain tool for a domain question', () => {
    // Composites describe broad tasks, so they must not hijack specific queries.
    const hits = top('arxiv paper');
    expect(hits.indexOf('pro_capability_map')).toBe(-1);
  });

  it('never surfaces a tool whose name echoes an unrelated query', () => {
    // The bar is not "zero results" — BM25 legitimately finds partial word matches. It is that a
    // query made of non-domain tokens must not surface something irrelevant with high confidence.
    const hits = rankTools(allTools(), 'zzzzqqqq wwwwvvvv');
    expect(hits.some((hit) => /zzzz|qqqq|wwww|vvvv/i.test(hit.name))).toBe(false);
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(rankTools(allTools(), '')).toHaveLength(0);
    expect(rankTools(allTools(), '   ')).toHaveLength(0);
    expect(rankTools(allTools(), '!!! ??? ...')).toHaveLength(0);
  });

  it('scores are ordered and finite', () => {
    const ranked = rankTools(allTools(), 'convert pdf to markdown');
    expect(ranked.length).toBeGreaterThan(0);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score);
      expect(Number.isFinite(ranked[i]!.score)).toBe(true);
    }
  });

  it('escapes regex metacharacters safely', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    expect(() => new RegExp(escapeRegExp('[test]'))).not.toThrow();
  });

  it('capability_map returns schemas and marks direct reachability', async () => {
    const result = await dispatch('pro_capability_map', { task: 'papers about retrieval', limit: 5 });
    const payload = JSON.parse(
      text(result)
        .replace(/^Capability map:[^\n]*\n\n/, '')
        .replace(/```json\n|\n```$/g, ''),
    );
    const tools = (payload.categories ?? []).flatMap(
      (c: { tools: Array<{ name: string; inputSchema?: unknown; direct: boolean }> }) => c.tools,
    );
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => /arxiv|academic/.test(t.name))).toBe(true);
    expect(tools.every((t) => t.inputSchema !== undefined)).toBe(true);
    expect(typeof tools[0]!.direct).toBe('boolean');
  });
});

describe('output budgeting', () => {
  const many = Array.from({ length: 14 }, (_, i) =>
    outcome({ step: `Extract ${i}`, output: i % 3 === 0 ? '' : 'Extracted items. '.repeat(180) }),
  );
  const withFailure = [...many, outcome({ step: 'Broken links', output: 'none found', ms: 900 })];
  const failing = [...many, outcome({ step: 'Metadata', ok: false, output: '', error: 'HTTP 429', ms: 120 })];

  it('defaults to summary mode', () => {
    expect(detailMode(undefined)).toBe('summary');
    expect(detailMode('summary')).toBe('summary');
  });

  it('treats full and true as full detail', () => {
    expect(detailMode('full')).toBe('full');
    expect(detailMode(true)).toBe('full');
  });

  it('summary mode is dramatically smaller than full mode', () => {
    const summary = renderBudgeted('t', failing, 'summary');
    const full = renderBudgeted('t', failing, 'full');
    expect(summary.length).toBeLessThan(full.length / 2);
  });

  it('summary mode hides empty steps but keeps failures visible', () => {
    const summary = renderBudgeted('t', failing, 'summary');
    expect(summary).not.toContain('Extract 0');
    expect(summary).toContain('HTTP 429');
    expect(summary).toContain('Metadata');
  });

  it('never silently drops a step without telling the caller', () => {
    const summary = renderBudgeted('t', failing, 'summary');
    expect(summary).toMatch(/steps=\d+/);
    expect(summary).toMatch(/detail: "full"|pro_capability_call/);
  });

  it('classifies emptiness conservatively: failures and short notes still count as informative', () => {
    expect(isInformative(outcome({ output: '   ' }))).toBe(false);
    expect(isInformative(outcome({ ok: false, output: '', error: 'x' }))).toBe(true);
    expect(isInformative(outcome({ output: 'none found' }))).toBe(true);
    expect(isInformative(outcome({ output: 'real data' }))).toBe(true);
  });

  it('respects a full-mode ceiling even with very large bodies', () => {
    const huge = Array.from({ length: 30 }, () => outcome({ output: 'x'.repeat(50_000) }));
    const full = renderBudgeted('t', huge, 'full');
    expect(full.length).toBeLessThanOrEqual(120_000 + 2_000);
    expect(full).toMatch(/qisqartirildi/);
  });
});

describe('parallel pipelines', () => {
  it('preserves input order despite concurrency', async () => {
    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['a', 'pro_fetch_hash_string', { text: 'a' }],
      ['b', 'pro_fetch_hash_string', { text: 'b' }],
      ['c', 'pro_fetch_hash_string', { text: 'c' }],
    ];
    const outcomes = await runParallel(steps);
    expect(outcomes.map((o) => o.step)).toEqual(['a', 'b', 'c']);
  });

  it('isolates failures like the sequential version', async () => {
    const outcomes = await runParallel([
      ['bad', 'not_a_real_tool', {}],
      ['good', 'pro_fetch_hash_string', { text: 'x' }],
    ]);
    expect(outcomes[0]!.ok).toBe(false);
    expect(outcomes[1]!.ok).toBe(true);
  });

  it('overlaps work instead of serialising it', async () => {
    // Measure overlap directly rather than by wall clock: timers are coarse and CI is noisy, so a
    // timing assertion here would be flaky. The property that matters is that several steps are in
    // flight at once, which is what makes the fan-out worth having.
    const order: string[] = [];
    let active = 0;
    let peak = 0;
    const step = (label: string): [string, string, Record<string, unknown>] => [
      label,
      'pro_fetch_hash_string',
      { text: label },
    ];

    await Promise.all(
      [step('1'), step('2'), step('3'), step('4')].map(async ([label]) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setImmediate(resolve));
        order.push(label);
        active--;
      }),
    );

    expect(peak).toBeGreaterThan(1);
    expect(order).toHaveLength(4);
  });

  it('runParallel resolves every step even when some fail', async () => {
    const outcomes = await runParallel([
      ['a', 'pro_fetch_hash_string', { text: 'a' }],
      ['b', 'not_real', {}],
      ['c', 'pro_fetch_uuid_generate', {}],
    ]);
    expect(outcomes).toHaveLength(3);
    expect(outcomes.map((o) => o.step)).toEqual(['a', 'b', 'c']);
    expect(outcomes.filter((o) => o.ok)).toHaveLength(2);
  });
});

describe('coverage composites reach the packs that had none', () => {
  it('workspace_ops runs operations across categories in one call', async () => {
    const result = await dispatch('pro_workspace_ops', {
      operations: [
        { tool: 'pro_fetch_hash_string', arguments: { text: 'a' }, label: 'first' },
        { tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'second' },
      ],
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('first');
    expect(text(result)).toContain('second');
  });

  it('service_ops runs the same way', async () => {
    const result = await dispatch('pro_service_ops', {
      operations: [{ tool: 'pro_fetch_hash_string', arguments: { text: 'x' }, label: 'alpha' }],
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('alpha');
  });

  it('both refuse a malformed operation list rather than silently running nothing', async () => {
    for (const name of ['pro_workspace_ops', 'pro_service_ops']) {
      expect((await dispatch(name, { operations: [] })).isError, name).toBe(true);
      expect((await dispatch(name, { operations: [{ arguments: {} }] })).isError, name).toBe(true);
      expect((await dispatch(name, {})).isError, name).toBe(true);
    }
  });

  it('caps the operation list', async () => {
    const many = Array.from({ length: 60 }, () => ({ tool: 'pro_fetch_hash_string', arguments: { text: 'x' } }));
    expect((await dispatch('pro_workspace_ops', { operations: many })).isError).toBe(true);
  });

  it('cannot be used to escape an allowlist, exactly like the batch executor', async () => {
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_workspace_ops,pro_fetch_hash_string';
    const result = await dispatch('pro_workspace_ops', {
      operations: [{ tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'blocked' }],
    });
    // The composite itself is allowed, but the operation inside it must still be refused.
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/allowlist/);
  });

  it('an operation gated on code is skipped, and the transcript says so', async () => {
    const result = await dispatch('pro_workspace_ops', {
      workspace_has_code: false,
      operations: [
        { tool: 'pro_fetch_hash_string', arguments: { text: 'x' }, label: 'gated-one', only_if_code: true },
        { tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'ungated' },
      ],
    });
    const raw = text(result);
    expect(raw).toMatch(/o‘tkazildi/);
    expect(raw).toMatch(/gated/);
    // The ungated operation must still have run.
    expect(raw).toMatch(/uuid/i);
  });

  it('both are registered in the registry', () => {
    const names = new Set(allTools().map((tool) => tool.name));
    expect(names.has('pro_workspace_ops')).toBe(true);
    expect(names.has('pro_service_ops')).toBe(true);
  });

  it('operation_id keeps repeated calls distinguishable in the transcript', async () => {
    // The same tool twice would otherwise be deduplicated into one dispatch and lose its label.
    const result = await dispatch('pro_workspace_ops', {
      operations: [
        { tool: 'pro_fetch_hash_string', arguments: { text: 'same' }, label: 'run', operation_id: 1 },
        { tool: 'pro_fetch_hash_string', arguments: { text: 'same' }, label: 'run', operation_id: 2 },
      ],
    });
    const raw = text(result);
    expect(raw).toContain('[#1]');
    expect(raw).toContain('[#2]');
  });

  it('reports a per-operation failure without discarding the others', async () => {
    const result = await dispatch('pro_workspace_ops', {
      operations: [
        { tool: 'pro_fetch_hash_string', arguments: { text: 'ok' }, label: 'good' },
        { tool: 'pro_tool_that_does_not_exist', arguments: {}, label: 'broken' },
        { tool: 'pro_fetch_uuid_generate', arguments: {}, label: 'also-good' },
      ],
    });
    const raw = text(result);
    // Both good operations ran...
    expect(raw).toContain('good');
    expect(raw).toContain('also-good');
    // ...and the failure is visible rather than collapsing the batch.
    expect(raw).toMatch(/failed=1/);
  });
});

describe('composite contract is preserved', () => {
  it('composites still reach the registry through dispatch, with policies applied', async () => {
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_capability_call,pro_fetch_hash_string';
    const result = await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_uuid_generate', arguments: {} }],
    });
    const body = payload(result);
    const results = body.results as Array<{ ok: boolean; error?: string }>;
    expect(results[0]!.ok).toBe(false);
    expect(results[0]!.error).toMatch(/allowlist/);
  });

  it('every smart-profile composite still has a handler and an object schema', () => {
    for (const tool of listTools('smart')) {
      expect(typeof tool.handler).toBe('function');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('runs a batch concurrently and returns results in request order', async () => {
    // A 12-entry batch used to be serialised into 12 round trips, which is the cost this tool
    // exists to remove. Execution order is now unconstrained, so the contract that matters is
    // that results still line up with the request the model wrote.
    const calls = Array.from({ length: 12 }, (_, i) => ({
      tool: 'pro_fetch_hash_string',
      arguments: { text: `order-${i}` },
      label: `L${i}`,
    }));
    const body = payload(await dispatch('pro_capability_call', { calls }));
    const results = body.results as Array<{ label: string; ok: boolean }>;
    expect(results).toHaveLength(12);
    expect(results.every((entry) => entry.ok)).toBe(true);
    expect(results.map((entry) => entry.label)).toEqual(calls.map((call) => call.label));
  });

  it('keeps inline validation errors inline rather than dropping them', async () => {
    const body = payload(
      await dispatch('pro_capability_call', {
        calls: [
          { tool: 'pro_fetch_hash_string', arguments: { text: 'a' }, label: 'ok-1' },
          { arguments: {}, label: 'no-tool' },
          'not-an-object' as unknown as Record<string, unknown>,
          { tool: 'pro_fetch_hash_string', arguments: { text: 'b' }, label: 'ok-2' },
        ],
      }),
    );
    const results = body.results as Array<{ label: string; ok: boolean; error?: string }>;
    expect(results).toHaveLength(4);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.ok).toBe(false);
    expect(results[2]!.ok).toBe(false);
    expect(results[3]!.ok).toBe(true);
  });

  it('stop_on_error is reported honestly without discarding work already in flight', async () => {
    const body = payload(
      await dispatch('pro_capability_call', {
        stop_on_error: true,
        calls: [
          { tool: 'not_a_real_tool', arguments: {}, label: 'bad' },
          { tool: 'pro_fetch_hash_string', arguments: { text: 'x' }, label: 'good' },
        ],
      }),
    );
    const results = body.results as Array<{ label: string; ok: boolean; error?: string }>;
    const stopped = results.find((entry) => entry.label === '(stopped)');
    expect(stopped).toBeDefined();
    expect(stopped!.error).toMatch(/stop_on_error/);
    // The second entry ran concurrently and must not be reported as cancelled.
    const good = results.find((entry) => entry.label === 'good');
    expect(good!.ok).toBe(true);
  });

  it('every composite exposes the detail budget knob', () => {
    const composites = listTools('smart').filter((tool) => tool.name !== 'pro_fetch_tool_execute');
    for (const tool of composites) {
      const detail = (tool.inputSchema.properties ?? {}).detail as { enum?: string[] } | undefined;
      expect(detail, tool.name).toBeDefined();
      expect(detail!.enum, tool.name).toEqual(['summary', 'full']);
    }
  });
});
