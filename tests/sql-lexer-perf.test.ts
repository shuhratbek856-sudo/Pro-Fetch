// Fix 6 — the SQL lexer made one `sql.slice(index)` per `$`/`:`/`@`/`%` delimiter, turning a
// delimiter-heavy document O(n²) and freezing the single-threaded stdio loop. It now matches tokens
// with sticky regexes anchored at `lastIndex` (zero-copy). The 98 existing lexer cases prove the
// tokens are unchanged; these prove the path is fast and that oversized input is refused.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { tokenize } from '../src/tools/sql/_lexer.js';

describe('tokenizer is linear on delimiter-heavy input', () => {
  it('tokenizes 300k chars of `:a` repetition quickly and correctly', () => {
    // 150k named-parameter tokens. Under the old per-char suffix copy this took minutes and the
    // 5s vitest default timeout would have failed it; O(n) sticky matching finishes in milliseconds.
    const sql = ':a'.repeat(150_000);
    const started = Date.now();
    const tokens = tokenize(sql);
    const elapsed = Date.now() - started;
    const params = tokens.filter((t) => t.kind === 'parameter');
    expect(params.length).toBe(150_000);
    expect(elapsed, `took ${elapsed}ms — regression toward O(n²)?`).toBeLessThan(2000);
  });

  it('still recognises the dollar / positional / psycopg shapes', () => {
    expect(tokenize('$$ body $$').some((t) => t.kind === 'dollar_string')).toBe(true);
    expect(tokenize('SELECT $1').some((t) => t.kind === 'parameter')).toBe(true);
    expect(tokenize('SELECT %(name)s').some((t) => t.kind === 'parameter' && t.parameter === 'name')).toBe(true);
    expect(tokenize('SELECT :user_id').some((t) => t.kind === 'parameter' && t.parameter === 'user_id')).toBe(true);
  });
});

describe('oversized SQL is refused, not tokenized', () => {
  it('pro_sql_analyse rejects > 1M characters', async () => {
    const result = await callTool('pro_sql_analyse', { sql: 'a'.repeat(1_100_000) });
    expect(result.isError).toBeTruthy();
    expect(result.content?.[0]?.text ?? '').toMatch(/katta|chega/i);
  });
});
