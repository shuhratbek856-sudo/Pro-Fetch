/**
 * A SQL lexer.
 *
 * ## Why a real lexer rather than a regular expression
 *
 * The interesting part of SQL is what is *not* the keywords. `'it''s'` is a string containing a quote,
 * not a string followed by an unterminated one. `"select"` is an identifier, not the keyword. `$$dollar
 * quoted$$` hides semicolons that would otherwise split a statement in half. An escape string, a line
 * comment and a nested block comment each end somewhere a line-based reader gets wrong.
 *
 * Every one of those produces a wrong answer rather than an error, which is why the split is done once,
 * properly, here. Splitting on `;` and splitting keywords out with a regex are both wrong in ways that
 * only show up on real statements.
 */

export type TokenKind =
  | 'keyword'
  | 'identifier'
  | 'quoted_identifier'
  | 'string'
  | 'number'
  | 'operator'
  | 'parameter'
  | 'comment'
  | 'punctuation'
  | 'dollar_string'
  | 'eof';

export interface Token {
  kind: TokenKind;
  /** The exact source text, so a caller can reconstruct or highlight it. */
  text: string;
  /** Lowercased for keywords, unchanged otherwise. */
  value: string;
  start: number;
  end: number;
  /** Set on a `parameter` token: the index or name the driver expects. */
  parameter?: string | number;
}

/**
 * Reserved words, per the common core. Used to tell an identifier from a keyword, which decides whether
 * a following `(` is a function call.
 *
 * Not exhaustive per dialect — this is the intersection, which is what a portable check needs. A word
 * this list misses is treated as an identifier, which is the safe direction: `foo(...)` is still
 * recognised as a call.
 */
export const KEYWORDS = new Set([
  'add',
  'all',
  'alter',
  'and',
  'any',
  'as',
  'asc',
  'begin',
  'between',
  'by',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'commit',
  'constraint',
  'create',
  'cross',
  'current',
  'current_date',
  'current_time',
  'current_timestamp',
  'database',
  'default',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'except',
  'exists',
  'false',
  'fetch',
  'for',
  'foreign',
  'from',
  'full',
  'grant',
  'group',
  'having',
  'if',
  'in',
  'index',
  'inner',
  'insert',
  'intersect',
  'into',
  'is',
  'join',
  'key',
  'left',
  'like',
  'ilike',
  'limit',
  'natural',
  'not',
  'null',
  'offset',
  'on',
  'or',
  'order',
  'outer',
  'primary',
  'procedure',
  'references',
  'returning',
  'revoke',
  'right',
  'rollback',
  'select',
  'set',
  'table',
  'then',
  'to',
  'transaction',
  'trigger',
  'true',
  'truncate',
  'union',
  'unique',
  'update',
  'using',
  'values',
  'view',
  'when',
  'where',
  'with',
  'over',
  'partition',
  'window',
  'filter',
  'similar',
  'escape',
  'recursive',
  'materialized',
  'lateral',
  'explain',
  'analyze',
  'vacuum',
  'conflict',
  'nothing',
  'duplicate',
  'merge',
]);

/**
 * Words that are context keywords in some dialects and ordinary identifiers in others.
 *
 * Kept out of `KEYWORDS` deliberately. `serial` in `CREATE TABLE t (id serial)` is a type, and in
 * `SELECT serial FROM t` it is a column name; calling it a keyword made a column called `serial`
 * unrecognisable. Callers that need to know whether one was used read `CONTEXT_KEYWORDS` and decide.
 */
export const CONTEXT_KEYWORDS = new Set([
  'serial',
  'bigserial',
  'smallserial',
  'auto_increment',
  'identity',
  'upsert',
  'ilike',
]);

/**
 * Multi-character operators, longest first.
 *
 * Order matters and the list is sorted by length, because `<>` and `<` are different tokens and
 * `<=>` and `<=` are different tokens. Matching greedily without sorting would tokenise `<=>` as `<=`
 * followed by `>`, which then fails to match anything downstream.
 */
const OPERATORS = [
  '<=>',
  '->>',
  '#>>',
  '!~~*',
  '!~~',
  '~~*',
  '~~',
  '::',
  ':=',
  '||',
  '<<',
  '>>',
  '<=',
  '>=',
  '<>',
  '!=',
  '->',
  '#>',
  '=>',
  '&&',
  '@>',
  '<@',
  '!<',
  '!>',
  '!!',
  '**',
  '//',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '|=',
  '|=',
  '<<=',
  '>>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '=',
  '<',
  '>',
  '~',
  '!',
  '@',
  '#',
  '^',
  '&',
  '|',
  '?',
  '$',
].sort((left, right) => right.length - left.length);

/**
 * Lex `sql`.
 *
 * Unknown bytes become `punctuation` rather than being skipped: a lexer that silently drops a
 * character produces tokens that reassemble into different SQL than it was given.
 */
// Sticky ('y') token matchers used by tokenize. Anchored via `lastIndex` so the lexer never copies the
// remaining input with `sql.slice(index)` — that per-delimiter suffix copy made a `$`/`:`/`@`/`%`-heavy
// input O(n²) and froze the single-threaded loop. Same semantics as the old `^...`.exec(slice).
const RE_DOLLAR_TAG = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/y;
const RE_DOLLAR_POSITIONAL = /\$(\d+)/y;
const RE_NAMED_PARAM = /[:@][A-Za-z_][A-Za-z0-9_]*/y;
const RE_PY_PARAM = /%\(([A-Za-z_][A-Za-z0-9_]*)\)s?/y;

export function tokenize(sql: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const length = sql.length;

  const push = (kind: TokenKind, start: number, end: number, parameter?: string | number): void => {
    const text = sql.slice(start, end);
    tokens.push({
      kind,
      text,
      value: kind === 'keyword' ? text.toLowerCase() : text,
      start,
      end,
      ...(parameter === undefined ? {} : { parameter }),
    });
  };

  while (index < length) {
    const character = sql[index]!;

    // Whitespace.
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    // Line comment.
    if (character === '-' && sql[index + 1] === '-') {
      const start = index;
      while (index < length && sql[index] !== '\n') index += 1;
      push('comment', start, index);
      continue;
    }

    // Block comment. PostgreSQL nests them, so a depth counter is required rather than a search for
    // the first `*/`: `/* /* */ */` is one comment, and stopping at the inner `*/` turns the rest of
    // the statement into tokens.
    if (character === '/' && sql[index + 1] === '*') {
      const start = index;
      let depth = 0;
      while (index < length) {
        if (sql[index] === '/' && sql[index + 1] === '*') {
          depth += 1;
          index += 2;
          continue;
        }
        if (sql[index] === '*' && sql[index + 1] === '/') {
          depth -= 1;
          index += 2;
          if (depth === 0) break;
          continue;
        }
        index += 1;
      }
      push('comment', start, index);
      continue;
    }

    // Dollar-quoted string: $tag$ ... $tag$. PostgreSQL's way of embedding arbitrary text, including
    // semicolons and quotes, in a function body.
    if (character === '$') {
      RE_DOLLAR_TAG.lastIndex = index;
      const tag = RE_DOLLAR_TAG.exec(sql);
      if (tag) {
        const delimiter = tag[0];
        const start = index;
        const close = sql.indexOf(delimiter, index + delimiter.length);
        index = close < 0 ? length : close + delimiter.length;
        push('dollar_string', start, index);
        continue;
      }
      // Otherwise `$1`, `$2` is a positional parameter.
      RE_DOLLAR_POSITIONAL.lastIndex = index;
      const positional = RE_DOLLAR_POSITIONAL.exec(sql);
      if (positional) {
        const start = index;
        index += positional[0].length;
        push('parameter', start, index, Number(positional[1]));
        continue;
      }
    }

    // Escape string: E'...' or e'...', where backslash escapes.
    if ((character === 'E' || character === 'e') && sql[index + 1] === "'") {
      const start = index;
      index += 2;
      while (index < length) {
        if (sql[index] === '\\') {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          if (sql[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      push('string', start, index);
      continue;
    }

    // Single-quoted string, with '' as the escape for a quote.
    if (character === "'") {
      const start = index;
      index += 1;
      while (index < length) {
        if (sql[index] === "'") {
          if (sql[index + 1] === "'") {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      push('string', start, index);
      continue;
    }

    // Quoted identifier: "..." in the standard, `...` in MySQL. A quoted name is never a keyword, which
    // is the whole point of quoting it.
    if (character === '"' || character === '`') {
      const quote = character;
      const start = index;
      index += 1;
      while (index < length) {
        if (sql[index] === quote) {
          if (sql[index + 1] === quote) {
            index += 2;
            continue;
          }
          index += 1;
          break;
        }
        index += 1;
      }
      push('quoted_identifier', start, index);
      continue;
    }

    // Named parameter: :name, @name. Not `::`, which is PostgreSQL's cast operator.
    if ((character === ':' && sql[index + 1] !== ':') || character === '@') {
      RE_NAMED_PARAM.lastIndex = index;
      const named = RE_NAMED_PARAM.exec(sql);
      if (named) {
        const start = index;
        index += named[0].length;
        push('parameter', start, index, named[0].slice(1));
        continue;
      }
    }

    // Python/psycopg-style named parameter: %(name)s.
    if (character === '%' && sql[index + 1] === '(') {
      RE_PY_PARAM.lastIndex = index;
      const named = RE_PY_PARAM.exec(sql);
      if (named) {
        const start = index;
        index += named[0].length;
        push('parameter', start, index, named[1]!);
        continue;
      }
    }

    // Question-mark placeholder.
    if (character === '?') {
      // Not a parameter inside an operator, which is why `?` is absent from the operator list above and
      // matched here instead.
      push('parameter', index, index + 1, '?');
      index += 1;
      continue;
    }

    // Number. Decimal, exponent, hex and binary, and a leading dot.
    if (/[0-9]/.test(character) || (character === '.' && /[0-9]/.test(sql[index + 1] ?? ''))) {
      const start = index;
      if (character === '0' && (sql[index + 1] === 'x' || sql[index + 1] === 'X')) {
        index += 2;
        while (index < length && /[0-9a-fA-F]/.test(sql[index]!)) index += 1;
      } else if (character === '0' && (sql[index + 1] === 'b' || sql[index + 1] === 'B')) {
        index += 2;
        while (index < length && /[01]/.test(sql[index]!)) index += 1;
      } else {
        while (index < length && /[0-9]/.test(sql[index]!)) index += 1;
        if (sql[index] === '.') {
          index += 1;
          while (index < length && /[0-9]/.test(sql[index]!)) index += 1;
        }
        if (sql[index] === 'e' || sql[index] === 'E') {
          const mark = index;
          index += 1;
          if (sql[index] === '+' || sql[index] === '-') index += 1;
          if (/[0-9]/.test(sql[index] ?? '')) {
            while (index < length && /[0-9]/.test(sql[index]!)) index += 1;
          } else {
            index = mark;
          }
        }
      }
      push('number', start, index);
      continue;
    }

    // Identifier or keyword. A `$` or `_` in the middle continues the name, which is how `a$b` and
    // `_private` stay one token.
    if (/[A-Za-z_\u0080-\uffff]/.test(character)) {
      const start = index;
      while (index < length && /[A-Za-z0-9_$\u0080-\uffff]/.test(sql[index]!)) index += 1;
      const text = sql.slice(start, index);
      push(KEYWORDS.has(text.toLowerCase()) ? 'keyword' : 'identifier', start, index);
      continue;
    }

    // Operator, longest match first.
    const operator = OPERATORS.find((candidate) => sql.startsWith(candidate, index));
    if (operator) {
      push('operator', index, index + operator.length);
      index += operator.length;
      continue;
    }

    // Anything else: `(`, `)`, `,`, `;`, `.` and the rest. Kept as a token rather than dropped, so the
    // token stream still reassembles to the input.
    push('punctuation', index, index + 1);
    index += 1;
  }

  tokens.push({ kind: 'eof', text: '', value: '', start: length, end: length });
  return tokens;
}

/** The tokens that carry meaning, with comments removed. */
export function significant(tokens: Token[]): Token[] {
  return tokens.filter((token) => token.kind !== 'comment' && token.kind !== 'eof');
}

/** Every distinct parameter in order of first appearance, with how many times each appears. */
export function parameters(tokens: Token[]): Array<{ name: string | number; count: number; firstAt: number }> {
  const found = new Map<string, { name: string | number; count: number; firstAt: number }>();
  for (const token of tokens) {
    if (token.kind !== 'parameter') continue;
    const key = String(token.parameter);
    const existing = found.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    found.set(key, { name: token.parameter!, count: 1, firstAt: token.start });
  }
  return [...found.values()];
}

/** Every identifier, with its text as written. Quoted names keep their quotes. */
export function identifiers(tokens: Token[]): Token[] {
  return significant(tokens).filter((token) => token.kind === 'identifier' || token.kind === 'quoted_identifier');
}
