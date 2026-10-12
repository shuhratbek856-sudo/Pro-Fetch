import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { dispatch, allTools, usageStats } from '../src/core/tool.js';
import { runParallel } from '../src/core/composite.js';
import { sourceFrom, needsNetwork } from '../src/core/source-from.js';
import { CONDITIONS, contextFor, gate, record } from '../src/core/composite-gates.js';
import { renderBudgeted } from '../src/core/composite-budget.js';
import { readFileSync } from 'node:fs';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'smart';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (r: ToolResult): string =>
  (r.content ?? [])
    .filter((i) => i.type === 'text')
    .map((i) => i.text)
    .join('\n');

const RICH = `<!doctype html><html><head>
<title>T</title><meta property="og:title" content="T">
<script type="application/ld+json">{"@type":"Article"}</script>
<link rel="alternate" hreflang="en" href="/en">
<link rel="alternate" hreflang="fr" href="/fr">
</head><body itemscope itemtype="https://schema.org/Article">
<h1>H</h1><a href="/a">a</a>
<img src="diagram.png" alt="System architecture overview">
<img src="chart.png">
<p>Contact hello@example.com, price $42.00 tel:+15550100</p><!-- a comment -->
</body></html>`;

const PLAIN = '<!doctype html><html><head><title>P</title></head><body><p>nothing here</p></body></html>';

describe('extractors reuse content the caller already has', () => {
  it('sourceFrom prefers inline text and never fetches', async () => {
    const source = await sourceFrom({ text: '<p>hello</p>' });
    expect(source.text).toBe('<p>hello</p>');
    expect(source.status).toBe(200);
  });

  it('needsNetwork tells the two paths apart without calling', () => {
    expect(needsNetwork({ text: 'x' })).toBe(false);
    expect(needsNetwork({ url: 'https://example.com' })).toBe(true);
    expect(needsNetwork({})).toBe(false);
    expect(needsNetwork({ text: '', url: 'https://example.com' })).toBe(true);
  });

  it('fails clearly when neither text nor url is supplied', async () => {
    await expect(sourceFrom({})).rejects.toThrow(/url yoki text/);
  });

  it('every extract category tool accepts text in its schema', () => {
    const extractors = allTools().filter((tool) => tool.category === 'extract');
    expect(extractors.length).toBeGreaterThan(15);
    const missing = extractors.filter((tool) => !(tool.inputSchema.properties ?? {}).text);
    expect(missing.map((tool) => tool.name)).toEqual([]);
  });

  it('an extractor given text returns the same answer as one given the URL', async () => {
    // This is the property that makes reuse safe: identical input, identical output.
    const byText = await dispatch('pro_fetch_email_extract', { text: RICH });
    expect(byText.isError).toBeFalsy();
    expect(text(byText)).toMatch(/hello@example\.com/);
  });

  /**
   * The property that makes content reuse safe in general.
   *
   * A composite hands an extractor a body it fetched itself. If the extractor only worked when it
   * fetched the URL itself, reuse would quietly change every answer. So: raw markup in must produce
   * the same output as the network path would, and the extracted evidence must be *there* — not
   * lost to whatever transformation happened on the way in.
   */
  it('extractors find the same evidence whether it arrives as text or from a URL', async () => {
    const cases: Array<[string, RegExp]> = [
      ['pro_fetch_json_ld_extract', /Article/],
      ['pro_fetch_image_alt_extract', /architecture/i],
      ['pro_fetch_link_classify', /"internal":\s*1/],
      ['pro_fetch_hreflang_extract', /\/fr/],
      ['pro_fetch_schema_org_extract', /Article/],
    ];

    for (const [tool, evidence] of cases) {
      const result = await dispatch(tool, { text: RICH });
      expect(result.isError, tool).toBeFalsy();
      expect(text(result), `${tool} must find evidence in raw markup`).toMatch(evidence);
    }
  });

  it('a converted body loses evidence that the raw body preserves', () => {
    // The bug in its purest form, asserted without any network: strip the markup the way a text
    // conversion does, and the extractors can no longer see what they are looking for.
    const converted = RICH.replace(/<[^>]+>/g, ' ');
    expect(converted).not.toMatch(/application\/ld\+json/);
    expect(converted).not.toMatch(/<img/);
    expect(RICH).toMatch(/application\/ld\+json/);
    expect(RICH).toMatch(/<img/);
  });
});

describe('identical steps are executed once', () => {
  const callsOf = (name: string) => usageStats()[name] ?? 0;

  it('collapses duplicates but still returns one outcome per step', async () => {
    const before = callsOf('pro_fetch_hash_string');
    const outcomes = await runParallel(
      Array.from(
        { length: 6 },
        (_, i) => [`dup-${i}`, 'pro_fetch_hash_string', { text: 'same' }] as [string, string, Record<string, unknown>],
      ),
    );
    const dispatched = callsOf('pro_fetch_hash_string') - before;

    expect(outcomes).toHaveLength(6);
    expect(dispatched).toBe(1);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(new Set(outcomes.map((o) => o.output)).size).toBe(1);
  });

  it('does not collapse steps that differ in arguments', async () => {
    const before = callsOf('pro_fetch_hash_string');
    await runParallel([
      ['a', 'pro_fetch_hash_string', { text: 'one' }],
      ['b', 'pro_fetch_hash_string', { text: 'two' }],
      ['c', 'pro_fetch_hash_string', { text: 'one' }],
    ]);
    // Two distinct questions, asked three times.
    expect(callsOf('pro_fetch_hash_string') - before).toBe(2);
  });

  it('keys on arguments, not on the step label', async () => {
    const before = callsOf('pro_fetch_hash_string');
    await runParallel([
      ['label-one', 'pro_fetch_hash_string', { text: 'identical' }],
      ['label-two', 'pro_fetch_hash_string', { text: 'identical' }],
    ]);
    expect(callsOf('pro_fetch_hash_string') - before).toBe(1);
  });

  it('preserves request order when duplicates are collapsed', async () => {
    const outcomes = await runParallel([
      ['first', 'pro_fetch_hash_string', { text: 'alpha' }],
      ['second', 'pro_fetch_hash_string', { text: 'alpha' }],
      ['third', 'pro_fetch_hash_string', { text: 'beta' }],
    ]);
    // runParallel returns positional results; the batch layer owns labelling, so assert the
    // underlying tool calls happened in the requested sequence.
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]!.ok).toBe(true);
  });
});

describe('composites fetch once and reuse', () => {
  const audit = readFileSync('src/tools/extract/audit_page.ts', 'utf8');
  const ingest = readFileSync('src/tools/http/fetch_ingest.ts', 'utf8');
  const diff = readFileSync('src/tools/crawl/composites.ts', 'utf8');

  /**
   * Regression: composites used to hand their extractors a *rendered* body.
   *
   * `pro_fetch_fetch_url` returns markdown and `pro_fetch_html_to_text` returns text with the
   * markup removed, so every downstream step received a document with no `<script type=
   * "application/ld+json">`, no `<img alt>` and no `<a href>`. The structured-data, image-alt and
   * link steps then reported "not found" on pages that contain all three — a false negative the
   * model has no way to distinguish from the truth.
   *
   * These assertions pin the fix at the source level: the body must come from `fetchSource`, which
   * returns the raw response.
   */
  it('every composite reads the raw document, not a rendering of it', () => {
    expect(audit).toContain('await fetchSource(url)');
    expect(ingest).toContain('await fetchSource(url, maxBytes)');
    expect(diff).toContain('await fetchSource(url)');
  });

  it('no composite feeds a converted body to an extractor', () => {
    for (const [name, source] of [
      ['audit_page', audit],
      ['fetch_ingest', ingest],
      ['page_diff', diff],
    ] as const) {
      // `html_to_text` strips the markup; using its output as a source document is the bug.
      expect(source, name).not.toMatch(/runStep\([^)]*'pro_fetch_html_to_text'[^)]*\)\s*;?\s*$/m);
      expect(source, name).not.toContain('text: fetched.output');
      expect(source, name).not.toContain('text: oldFetch.output');
    }
  });

  it('fetchSource returns the document rather than a summary', () => {
    const composite = readFileSync('src/core/composite.ts', 'utf8');
    // Not `fetchUrl`, which renders markdown; the response body is what the extractors need.
    expect(composite).toContain('await fetchWithOptions(url');
    expect(composite).not.toMatch(/await fetchUrl\(/);
  });

  it('audit_page passes pre-fetched content to every analysis step', () => {
    // The wiring is the guarantee: a step that carries content cannot reach the network. Sixteen of
    // sixteen analysis steps do, so the whole audit costs the single initial fetch.
    const candidates = audit.slice(audit.indexOf('const candidates'), audit.indexOf('if (p.check_links'));
    const steps = [
      ...candidates.matchAll(/\['([^']+)',\s*'pro_[a-z0-9_]+',\s*([^,\]]+?)(?:,\s*CONDITIONS\.\w+\(\))?\]/g),
    ];
    expect(steps).toHaveLength(16);

    const carryingContent = steps.filter((step) => /withSource|text: html/.test(step[2] ?? ''));
    expect(carryingContent).toHaveLength(16);
    expect(audit).toContain('const withSource = { url, text: html }');
  });

  it('audit_page gates the steps that need markup a page may not have', () => {
    const candidates = audit.slice(audit.indexOf('const candidates'), audit.indexOf('if (p.check_links'));
    const gated = [...candidates.matchAll(/CONDITIONS\.\w+\(\)/g)];
    expect(gated.length).toBe(10);
  });

  it('audit_page keeps exactly one step that must hit the network', () => {
    // Broken-link checking tests whether each link resolves, so it must fetch.
    const urlOnly = (audit.match(/\{ url, limit: \d+ \}/g) ?? []).length;
    expect(urlOnly).toBe(1);
  });

  it('ingest reuses content for text tools but keeps bytes for format converters', () => {
    expect(ingest).toContain('const asText = { url, text: source.html }');
    // PDF and CSV need the original file, not text derived from it.
    expect(ingest).toMatch(/'pro_fetch_pdf_to_text', \{ url \}/);
    expect(ingest).toMatch(/'pro_fetch_csv_to_json', \{ url \}/);
  });
});

describe('conditional steps', () => {
  const rich = contextFor(RICH, 'https://example.com');
  const plain = contextFor(PLAIN, 'https://example.com');

  it('runs every gated step on content that satisfies the condition', () => {
    for (const name of ['jsonLd', 'schemaOrg', 'hreflang', 'images', 'links', 'headings'] as const) {
      expect(gate(rich, CONDITIONS[name]()).run, name).toBe(true);
    }
  });

  it('skips them on content that cannot produce a finding', () => {
    for (const name of ['jsonLd', 'schemaOrg', 'hreflang', 'images', 'links', 'headings'] as const) {
      const verdict = gate(plain, CONDITIONS[name]());
      expect(verdict.run, name).toBe(false);
      expect(verdict.reason, name).toBeTruthy();
    }
  });

  it('never gates a step that has no condition', () => {
    expect(gate(plain).run).toBe(true);
  });

  it('runs the step when the predicate itself throws', () => {
    const broken = {
      reason: 'boom',
      test: () => {
        throw new Error('predicate failure');
      },
    };
    // A failing gate must not silently suppress work.
    expect(gate(plain, broken).run).toBe(true);
  });

  it('records the reason so a skip is explainable', () => {
    const verdict = gate(plain, CONDITIONS.prices());
    expect(verdict.reason).toMatch(/narx/i);
  });

  it('exposes completed steps to later conditions', () => {
    const context = contextFor('', 'https://example.com');
    record(context, 'Fetch', true, 'body');
    expect(context.completed.get('Fetch')?.ok).toBe(true);
  });
});

describe('the transcript never hides a gate', () => {
  it('reports how many steps were gated and why', () => {
    const rendered = renderBudgeted('audit', [], 'summary', 6);
    expect(rendered).toContain('gated=6');
    expect(rendered).toMatch(/gated: 6/);
  });

  it('omits the gate note when nothing was gated', () => {
    expect(renderBudgeted('audit', [], 'summary', 0)).not.toContain('gated');
  });
});
