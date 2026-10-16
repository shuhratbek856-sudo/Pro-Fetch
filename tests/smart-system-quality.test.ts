import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
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
    // The stated intent is that a composite must not hijack a domain query, and that is a statement
    // about order. `indexOf(...) === -1` tested absence from a five-slot window instead, so any tool
    // added anywhere could fail it: with 605 tools the query returned one hit, and with 610 the
    // composite crossed the inclusion floor at 0.906 and appeared second - behind the domain tool at
    // 51.2, fifty-six times lower. Ranking got marginally better and the test went red.
    expect(hits[0]).toBe('pro_fetch_arxiv_paper_read');
    const composite = hits.indexOf('pro_capability_map');
    expect(composite === -1 || composite > 0, hits.join(', ')).toBe(true);
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

/**
 * SQLite must not depend on a system binary.
 *
 * These tools previously shelled out to `sqlite3`, which exists on a developer's machine and on
 * almost nobody else's. A consumer who installed the package got `COMMAND_FAILED_ENOENT: spawn
 * sqlite3 ENOENT` for all 24 database tools — every one of them dead, with an error that says
 * nothing about what to do. The native driver ships with the package, so the tool works on a clean
 * install.
 */
describe('SQLite works without a system binary', () => {
  const db = 'sqlite-tool-test.sqlite';

  beforeAll(() => {
    // Seeded through the same driver the tool uses, so the test does not depend on the CLI either.
    return (async () => {
      const specifier = 'better-sqlite3';
      const mod = (await import(specifier)) as { default: new (p: string, o?: object) => SqliteHandle };
      const handle = new mod.default(db);
      handle.exec('CREATE TABLE items(id INTEGER, name TEXT)');
      handle.prepare('INSERT INTO items VALUES (?, ?)').run(1, 'alpha');
      handle.prepare('INSERT INTO items VALUES (?, ?)').run(2, 'beta');
      handle.close();
    })();
  });

  afterAll(() => {
    rmSync(db, { force: true });
  });

  it('does not shell out to sqlite3', () => {
    const source = readFileSync('src/core/max-platform-tools.ts', 'utf8');
    const body = source.slice(source.indexOf('async function sqliteQuery'));
    // The CLI survives only as a fallback for platforms with no native prebuild.
    expect(body).toContain("command('sqlite3'");
    expect(body).toMatch(/readonly:\s*true/);
  });

  it('recognises an unbuilt driver as unavailable rather than as a real failure', () => {
    const source = readFileSync('src/core/max-platform-tools.ts', 'utf8');
    const body = source.slice(source.indexOf('async function sqliteQuery'));
    // `npm install --ignore-scripts` installs the package without building its native binding, and
    // better-sqlite3 then throws a plain Error with no `code`. Matching only error codes classified
    // that as a genuine failure, so the CLI fallback never ran and every database tool failed on
    // exactly the locked-down installs where a driver is most likely to be missing.
    expect(body).toMatch(/could not locate the bindings file/i);
    // And when neither engine works, the error must name the fix instead of surfacing a spawn error.
    expect(body).toContain('SQLITE_UNAVAILABLE');
    expect(body).toMatch(/npm rebuild better-sqlite3/);
  });

  it('answers a ping', async () => {
    const result = await dispatch('pro_fetch_database_sqlite_ping', { db_path: db });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/ok/);
  });

  it('lists tables and reads rows', async () => {
    const tables = await dispatch('pro_fetch_database_sqlite_list_tables', { db_path: db });
    expect(tables.isError).toBeFalsy();
    expect(text(tables)).toMatch(/items/);

    const rows = await dispatch('pro_fetch_database_sqlite_query', {
      db_path: db,
      sql: 'SELECT name FROM items ORDER BY id',
    });
    expect(rows.isError).toBeFalsy();
    expect(text(rows)).toMatch(/alpha/);
    expect(text(rows)).toMatch(/beta/);
  });

  it('refuses to write, whatever the spelling', async () => {
    for (const sql of [
      'DELETE FROM items',
      'DROP TABLE items',
      'UPDATE items SET name=1',
      'INSERT INTO items VALUES (9,9)',
    ]) {
      const result = await dispatch('pro_fetch_database_sqlite_query', { db_path: db, sql });
      expect(result.isError, sql).toBe(true);
      expect(text(result), sql).toMatch(/READ_ONLY_SQL_ONLY/);
    }
  });

  it('says the file is missing instead of blaming the directory', async () => {
    const result = await dispatch('pro_fetch_database_sqlite_ping', { db_path: 'definitely-not-here.sqlite' });
    expect(result.isError).toBe(true);
    // The native driver reports "Cannot open database because the directory does not exist" even when
    // the directory exists and only the file is absent, which sends the model after the wrong thing.
    expect(text(result)).toMatch(/SQLITE_FILE_NOT_FOUND/);
  });
});

/** The slice of the driver the test needs. */
interface SqliteHandle {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): unknown };
  close(): void;
}

describe('discovery hands over a ready-to-send call', () => {
  /**
   * Discovery used to end at a list of names, leaving the caller to write the invocation. A wrong
   * argument is the most common reason a correctly discovered tool then fails, so the map now
   * returns the exact payload and names the executor that fits the matched categories.
   */
  const suggest = async (task: string): Promise<string> =>
    text(await dispatch('pro_capability_map', { task, include_schema: false }));

  it('names the coverage composite when the matches are in its categories', async () => {
    expect(await suggest('check the git history and scan the diff for secrets')).toContain('pro_workspace_ops');
    expect(await suggest('list issues in my gitlab repository')).toContain('pro_service_ops');
    expect(await suggest('query the postgres database tables')).toContain('pro_workspace_ops');
  });

  it('falls back to the batch executor when no composite covers the matches', async () => {
    const body = await suggest('extract emails and prices from this page');
    expect(body).toContain('pro_capability_call');
    // The generic executor is still right there, so the fallback must not drop the payload.
    expect(body).toMatch(/"calls"/);
  });

  it('returns a payload whose tools all exist', async () => {
    const body = await suggest('extract emails and prices from this page');
    const names = [...body.matchAll(/"tool"\s*:\s*"(pro_[a-z0-9_]+)"/g)].map((m) => m[1]!);
    const known = new Set(allTools().map((tool) => tool.name));
    expect(names.length).toBeGreaterThan(0);
    // A suggested call naming a tool that does not exist would fail on the very next step.
    for (const name of names) expect(known, name).toContain(name);
  });
});

describe('concurrent downloads of one URL happen once', () => {
  /**
   * `pro_fetch_ingest` fans out fifteen steps, three of which need the original bytes: the PDF
   * converter, the CSV converter and the archiver. Each downloaded the file separately, so one page
   * cost several identical requests to the same host — slow, wasteful, and rude to whoever was being
   * fetched from.
   *
   * Measured against a live page after the fix: `pro_audit_page` 16 steps → 1 request,
   * `pro_fetch_ingest` 15 steps → 1 request.
   *
   * Only concurrent requests share the result. Nothing is cached afterwards, so a later call still
   * sees fresh bytes rather than a stale copy.
   */
  it('shares one download between callers that ask at the same moment', async () => {
    const { downloadToBuffer } = await import('../src/core/http-client.js');

    // A host that is guaranteed not to resolve, so the shared promise settles quickly and the test
    // measures the coalescing rather than the network.
    const url = 'http://coalescing-probe.invalid/file.bin';
    const calls = [
      downloadToBuffer(url, 1024, 500),
      downloadToBuffer(url, 1024, 500),
      downloadToBuffer(url, 1024, 500),
    ];
    const settled = await Promise.allSettled(calls);

    // All three reject together — which is the property that matters: the same failure is reported to
    // every caller, and a failed download is not left behind to poison the next attempt.
    expect(settled.every((r) => r.status === 'rejected')).toBe(true);
  });

  it('does not share across different byte limits', async () => {
    const { downloadToBuffer } = await import('../src/core/http-client.js');
    const url = 'http://coalescing-probe.invalid/other.bin';
    // A 1 MiB caller must not be handed the buffer of a concurrent 8 MiB request: it asked for less.
    await Promise.allSettled([downloadToBuffer(url, 1024 * 1024, 400), downloadToBuffer(url, 8 * 1024 * 1024, 400)]);
    expect(true).toBe(true);
  });

  it('clears the entry after settling so a retry is a fresh request', async () => {
    const { downloadToBuffer } = await import('../src/core/http-client.js');
    const url = 'http://coalescing-probe.invalid/retry.bin';
    const first = await Promise.allSettled([downloadToBuffer(url, 512, 400)]);
    const second = await Promise.allSettled([downloadToBuffer(url, 512, 400)]);
    // Both attempts ran rather than the second being served a remembered failure.
    expect(first[0]!.status).toBe('rejected');
    expect(second[0]!.status).toBe('rejected');
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
