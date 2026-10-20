/**
 * Regression pins for audit batch 6 — the F-family:
 * F6 the composite budget being a budget, F7 a clipped step saying so,
 * F8 a term that only a schema names still finding its tool,
 * F9 the synonym table being bidirectional as documented,
 * F10 the cache key carrying the token limit, F12 the limiter status describing the bucket.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { bucketStatus, bucketsSnapshot, resetBuckets, take } from '../src/core/ratelimit.js';
import { rankTools } from '../src/core/intent-search.js';
import { renderPipeline, runStep } from '../src/core/composite.js';
import { fetchUrl } from '../src/core/fetcher.js';

process.env.PRO_FETCH_PROFILE = 'full';

afterEach(() => {
  vi.unstubAllGlobals();
  resetBuckets();
});

describe('the fetch cache key carries the token limit', () => {
  it('a wider limit is not served the narrower cached document', async () => {
    const long = 'x'.repeat(40_000);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(long, { status: 200, headers: { 'content-type': 'text/plain' } })),
    );
    const narrow = await fetchUrl('http://93.184.216.34/f10-regression', { maxTokens: 100 });
    const wide = await fetchUrl('http://93.184.216.34/f10-regression', { maxTokens: 8000 });
    // The cached value is the clipped document, so a key without the limit served the narrow one.
    expect(narrow.markdown.length).toBeLessThan(1_000);
    expect(wide.markdown.length).toBeGreaterThan(narrow.markdown.length * 10);
  });
});

describe('the limiter status describes the bucket', () => {
  it('an unused bucket reports a full bucket rather than an empty one', () => {
    const status = bucketStatus('domain:never-used.example');
    expect(status.tokens).toBe(60);
  });

  it('a used bucket reports what is left', () => {
    take('domain:probe.example');
    expect(bucketStatus('domain:probe.example').tokens).toBe(59);
    expect(bucketsSnapshot()['domain:probe.example']).toBe(59);
  });

  it('the status refills over time instead of reporting a stale count', () => {
    take('domain:probe.example');
    const realNow = Date.now;
    Date.now = () => realNow() + 120_000;
    try {
      expect(bucketStatus('domain:probe.example').tokens).toBe(60);
      expect(bucketsSnapshot()['domain:probe.example']).toBe(60);
    } finally {
      Date.now = realNow;
    }
  });
});

describe('the tool discovery finds a term that only an input schema names', () => {
  it('a schema-only term surfaces the tool that declares it', () => {
    const ranked = rankTools(
      [
        {
          name: 'pro_fetch_snapshot',
          category: 'github',
          description: 'Reads a snapshot',
          inputSchema: { properties: { repo_slug: { type: 'string' }, branch: { type: 'string' } } },
        },
        {
          name: 'pro_fetch_other',
          category: 'misc',
          description: 'Does something else',
          inputSchema: { properties: { unrelated: { type: 'string' } } },
        },
      ],
      'repo slug',
    );
    expect(ranked.map((entry) => entry.name)).toContain('pro_fetch_snapshot');
  });
});

describe('the synonym table works in both directions', () => {
  // The real registry, because the score depends on the corpus: a term that is rare in 672 tools
  // carries a real weight, and the same term in a two-tool corpus does not.
  const registry = allTools().map((tool) => ({
    name: tool.name,
    category: tool.category,
    description: tool.description,
    inputSchema: tool.inputSchema as { properties?: Record<string, unknown> },
  }));

  it('the tool-side vocabulary of a synonym reaches the tool', () => {
    // `paper: [... 'scholar' ...]` is one edge; a query saying "scholar" is the other end of it.
    const ranked = rankTools(registry, 'scholar');
    expect(ranked[0]?.name).toBe('pro_fetch_arxiv_paper_read');
  });

  it('the specific tool still ranks first for its own query', () => {
    const ranked = rankTools(registry, 'arxiv paper');
    expect(ranked[0]?.name).toBe('pro_fetch_arxiv_paper_read');
  });
});

describe('the composite transcript honours its budget', () => {
  it('fits the budget even when no single body is worth halving', () => {
    const outcomes = Array.from({ length: 150 }, (_, index) => ({
      step: `step-${index}`,
      tool: 'pro_fetch_x',
      ok: true,
      output: 'y'.repeat(400),
      ms: 1,
    }));
    const rendered = renderPipeline('probe', outcomes, 60_000);
    // 150 short steps came out 67 322 characters against a 60 000 budget, and the note said
    // nothing had been shortened.
    expect(rendered.length).toBeLessThanOrEqual(60_000);
  });

  it('says so when a step was cut at the per-step limit', async () => {
    const outcome = await runStep('encode', 'pro_encode_encode', { text: 'q'.repeat(9_000) });
    expect(outcome.ok).toBe(true);
    expect(outcome.clipped).toBe(true);
    const rendered = renderPipeline('probe', [outcome], 60_000);
    expect(rendered).toMatch(/kesildi/);
  });
});
