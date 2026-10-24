// ReDoS (catastrophic backtracking) guard — behaviour, not source inspection.
//
// Every "hang" test below uses a pattern that a synchronous `new RegExp(...).test(...)`
// against a repeated-character haystack takes effectively forever on (exponential). Without
// `compileSafeRegex`, the vitest default 5s timeout fires and the run goes red — which is
// the exact outcome this guard exists to prevent on the shared single-threaded stdio loop.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { compileSafeRegex, isSafeRegexPattern } from '../src/core/safe-regex.js';
import { runCrawlTool } from '../src/core/crawl-tools.js';

describe('compileSafeRegex', () => {
  it('accepts ordinary patterns and compiles them with flags', () => {
    const re = compileSafeRegex('api/v[0-9]+', 'i');
    expect(re).toBeInstanceOf(RegExp);
    expect(re.flags).toContain('i');
    expect(re.test('GET /API/v2/users')).toBe(true);
  });

  it('rejects nested-quantifier patterns before they can backtrack', () => {
    // safe-regex2 detects nested quantifiers ((a+)+, (a*)*). It does NOT flag overlapping
    // alternations like (a|aa)+ — a known limitation — so those still rely on the haystack
    // length caps as a secondary bound. Do not assert coverage we do not have.
    expect(() => compileSafeRegex('(a+)+$')).toThrow(/xavfli|backtracking/);
    expect(() => compileSafeRegex('(a*)*')).toThrow();
    expect(isSafeRegexPattern('(a+)+$')).toBe(false);
    expect(isSafeRegexPattern('^\\d{3}-\\d{4}$')).toBe(true);
  });

  it('rejects empty and over-long sources', () => {
    expect(() => compileSafeRegex('')).toThrow();
    expect(() => compileSafeRegex('a'.repeat(600))).toThrow(/uzun/);
  });
});

describe('regex extraction rejects catastrophic user patterns without hanging', () => {
  // Without the guard, the following call would freeze the whole server.
  it('pro_fetch_regex_extract refuses (a+)+ and returns isError quickly', async () => {
    const result = await callTool('pro_fetch_regex_extract', {
      text: 'a'.repeat(5000) + '!',
      selector: '(a+)+!',
    });
    expect(result.isError).toBeTruthy();
    const text = result.content?.[0]?.text ?? '';
    expect(/xavfli|backtracking|Regex xato/i.test(text)).toBe(true);
  });

  it('pro_fetch_regex_extract still extracts safe patterns', async () => {
    const result = await callTool('pro_fetch_regex_extract', {
      text: 'id=1 name=alice id=2 name=bob',
      selector: 'id=\\d+',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content?.[0]?.text).toContain('id=1');
    expect(result.content?.[0]?.text).toContain('id=2');
  });
});

describe('crawl_filter refuses unsafe include/exclude patterns', () => {
  it('does not hang and reports the unsafe pattern as an error', async () => {
    const result = await runCrawlTool('pro_fetch_crawl_filter', {
      pages: ['a'.repeat(4000) + '!'],
      include: '(a+)+!',
    });
    expect(result.isError).toBeTruthy();
    expect(/ReDoS|xavfli|regex/i.test(result.content?.[0]?.text ?? '')).toBe(true);
  });

  it('safe include/exclude still filter', async () => {
    const result = await runCrawlTool('pro_fetch_crawl_filter', {
      pages: ['https://x/a', 'https://x/b'],
      include: '/a$',
    });
    expect(result.isError).toBeFalsy();
    const urls = JSON.parse(result.content?.[0]?.text ?? '[]').map((r: { url: string }) => r.url);
    expect(urls).toEqual(['https://x/a']);
  });
});

describe('schema pattern validation refuses unsafe patterns without crashing', () => {
  it('records an unsafe pattern as a validation failure rather than hanging', async () => {
    const result = await callTool('pro_schema_validate', {
      schema: JSON.stringify({ type: 'string', pattern: '(a+)+' }),
      value: JSON.stringify('a'.repeat(4000)),
    });
    // The call resolves quickly (no hang). The unsafe pattern surfaces as a pattern failure
    // inside the report, not as a thrown error from the validator.
    const text = result.content?.[0]?.text ?? '';
    expect(/pattern/i.test(text)).toBe(true);
    expect(/xavfli|ReDoS|invalid|regular expression/i.test(text)).toBe(true);
  });

  it('safe schema patterns still validate normally', async () => {
    const result = await callTool('pro_schema_validate', {
      schema: JSON.stringify({ type: 'string', pattern: '^\\d+$' }),
      value: JSON.stringify('42'),
    });
    const text = result.content?.[0]?.text ?? '';
    expect(text).toMatch(/Yaroqli|valid/);
  });
});
