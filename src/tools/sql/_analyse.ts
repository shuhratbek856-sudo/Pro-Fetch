/**
 * Statement splitting, table resolution and the risk classification a caller actually needs.
 *
 * The split is done over the token stream rather than over the raw text, because a semicolon inside a
 * string, an identifier or a dollar-quoted body is not a statement boundary. `SELECT ';'` is one
 * statement, and splitting on `;` reports two.
 */

import { identifiers, parameters, significant, tokenize, type Token } from './_lexer.js';

export interface Statement {
  /** The text of the statement, semicolon excluded. */
  text: string;
  start: number;
  end: number;
  /** Leading keyword, lowercased. `select`, `insert`, `with`, and so on. */
  kind: string;
  tokens: Token[];
}

export interface SplitResult {
  statements: Statement[];
  /** A semicolon-looking byte inside a literal or comment, reported rather than silently absorbed. */
  insideLiterals: number;
}

/**
 * Split a script into statements at top-level semicolons.
 *
 * `insideLiterals` counts the semicolons that were *not* treated as boundaries. It is reported because
 * a caller who expected three statements and got one needs to know a semicolon was in a string, not
 * because the split failed.
 */
export function splitStatements(sql: string): SplitResult {
  const tokens = tokenize(sql);
  const statements: Statement[] = [];
  let insideLiterals = 0;
  let start = 0;
  let boundary = false;

  for (const token of tokens) {
    if (token.kind === 'eof') break;

    if (token.kind === 'punctuation' && token.text === ';') {
      const slice = sql.slice(start, token.start);
      if (slice.trim()) {
        const inner = significant(tokenize(slice));
        // Non-empty text is not enough. A trailing comment carries no statement, and reporting it as an
        // empty one gives a caller a statement it cannot execute. Measured: `'-- faqat izoh'` produced
        // one statement with no tokens.
        if (inner.length > 0) {
          statements.push({
            text: slice.trim(),
            start,
            end: token.start,
            kind: inner[0]?.value.toLowerCase() ?? '',
            tokens: inner,
          });
        }
      }
      start = token.end;
      boundary = true;
      continue;
    }

    if (
      (token.kind === 'string' || token.kind === 'dollar_string' || token.kind === 'comment') &&
      token.text.includes(';')
    ) {
      insideLiterals += 1;
    }
    boundary = false;
  }

  const tail = sql.slice(start);
  if (tail.trim()) {
    const inner = significant(tokenize(tail));
    if (inner.length > 0) {
      statements.push({
        text: tail.trim(),
        start,
        end: sql.length,
        kind: inner[0]?.value.toLowerCase() ?? '',
        tokens: inner,
      });
    }
  }
  void boundary;

  return { statements, insideLiterals };
}

/** A table named by a statement, with how it was named. */
export interface TableRef {
  name: string;
  schema?: string;
  /** `from`, `join`, `into`, `update` or `delete_from`. */
  via: string;
  /** The alias the statement gives it, if any. */
  alias?: string;
}

const QUALIFIED = /^([A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`)\.([A-Za-z_][A-Za-z0-9_$]*|"[^"]+"|`[^`]+`)$/;

function unquote(name: string): string {
  if ((name.startsWith('"') && name.endsWith('"')) || (name.startsWith('`') && name.endsWith('`'))) {
    return name.slice(1, -1).replace(new RegExp(`^${name[0]}(.*)${name[0]}$`), '$1');
  }
  return name;
}

/**
 * Whether two tokens touch, with nothing between them.
 *
 * The discriminator between a schema-qualified name and a table with an alias. `FROM public.users` is
 * one name written in two parts; `FROM users u` is a table and a name for it. In token terms both are
 * `ident ident`, and only the space separates them.
 *
 * Measured: without the adjacency test, `FROM users u WHERE u.id = 1` matched `users.u` as a qualified
 * name, so the table was reported as schema `users` with name `u` and no alias. The reported table was
 * wrong, which is worse than reporting no schema at all.
 */
const touches = (left: Token, right: Token): boolean => left.end === right.start;

/**
 * Every table a statement names, and how.
 *
 * Only the clauses that actually name a relation are read: `FROM`, `JOIN`, `INTO`, `UPDATE`,
 * `DELETE FROM`. A table-shaped word in a `SELECT` list or a `WHERE` clause is not a table, and a
 * parser that reports one is worse than one that reports none.
 */
export function tableRefs(tokens: Token[]): TableRef[] {
  const refs: TableRef[] = [];
  const stream = significant(tokens);
  const nameAt = (index: number): { name: string; schema?: string; end: number } | null => {
    const token = stream[index];
    if (!token) return null;
    if (token.kind !== 'identifier' && token.kind !== 'quoted_identifier') return null;
    const next = stream[index + 1];
    // Only a name that *touches* its second part is qualified — see `touches` above.
    if (next && (next.kind === 'identifier' || next.kind === 'quoted_identifier') && touches(token, next)) {
      const qualified = QUALIFIED.exec(`${token.text}.${next.text}`);
      if (qualified) return { name: unquote(qualified[2]!), schema: unquote(qualified[1]!), end: index + 1 };
    }
    return { name: unquote(token.text), end: index };
  };

  for (let index = 0; index < stream.length; index += 1) {
    const token = stream[index]!;
    const word = token.value.toLowerCase();

    if (word !== 'from' && word !== 'join' && word !== 'into' && word !== 'update') continue;
    if (token.kind !== 'keyword') continue;

    // `DELETE FROM` names the same relation as `FROM t`; the verb is recorded so a caller can tell.
    const via =
      word === 'from' && stream.some((entry) => entry.value.toLowerCase() === 'delete') ? 'delete_from' : word;
    const found = nameAt(index + 1);
    if (!found) continue;
    let cursor = found.end + 1;
    // `INSERT INTO t (a, b)` — the parenthesised list is the column list, not an alias. It is skipped,
    // and skipping it must not skip the relation: an earlier `continue` here dropped the table entirely,
    // and `INSERT INTO logs (a, b) VALUES (1, 2)` reported no tables at all.
    if (stream[cursor]?.text === '(') {
      let depth = 0;
      while (cursor < stream.length) {
        if (stream[cursor]!.text === '(') depth += 1;
        if (stream[cursor]!.text === ')') {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
        cursor += 1;
      }
    }
    let alias: string | undefined;
    const next = stream[cursor];
    if (next && next.value.toLowerCase() === 'as' && stream[cursor + 1]) {
      alias = unquote(stream[cursor + 1]!.text);
    } else if (next && (next.kind === 'identifier' || next.kind === 'quoted_identifier')) {
      const stops = [
        'on',
        'where',
        'group',
        'order',
        'having',
        'limit',
        'union',
        'join',
        'inner',
        'left',
        'right',
        'full',
        'cross',
        'set',
        'using',
        'returning',
        'values',
      ];
      if (!stops.includes(next.value.toLowerCase())) alias = unquote(next.text);
    }
    refs.push({
      name: found.name,
      ...(found.schema ? { schema: found.schema } : {}),
      via,
      ...(alias ? { alias } : {}),
    });
  }

  return refs;
}

/** How hard a statement is, as numbers rather than a verdict. */
export interface Complexity {
  tokens: number;
  depth: number;
  subqueries: number;
  joins: number;
  tables: number;
  /** Joins plus subqueries plus unions — the parts that multiply rows. */
  fanout: number;
  distinctTables: number;
}

export function complexity(tokens: Token[]): Complexity {
  const stream = significant(tokens);
  let depth = 0;
  let maxDepth = 0;
  let subqueries = 0;
  let joins = 0;
  let unions = 0;

  for (let index = 0; index < stream.length; index += 1) {
    const token = stream[index]!;
    // Depth is counted *after* an opening paren and before a closing one, so `SELECT` at the top level
    // is 0 and a `SELECT` inside a subquery is 1.
    //
    // Measured before: `SELECT a FROM t` reported depth 1 and `SELECT 1` reported 0, because the maximum
    // was taken before the first `(` was seen. A caller reading "depth 1" for a flat single-table query
    // cannot tell a plain select from a nested one.
    if (token.text === '(') {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
      continue;
    }
    if (token.text === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (token.kind !== 'keyword') continue;
    const word = token.value.toLowerCase();
    if (word === 'select' && depth > 0) subqueries += 1;
    if (word === 'join' || (word === 'from' && stream[index + 1]?.value.toLowerCase() === 'join')) joins += 1;
    if (word === 'union' || word === 'intersect' || word === 'except') unions += 1;
  }

  const refs = tableRefs(stream);
  const distinctTables = new Set(refs.map((ref) => `${ref.schema ?? ''}.${ref.name}`)).size;
  return {
    tokens: stream.length,
    depth: maxDepth,
    subqueries,
    joins,
    tables: refs.length,
    fanout: joins + subqueries + unions,
    distinctTables,
  };
}

export type RiskLevel = 'read' | 'write' | 'destructive' | 'schema';

export interface Risk {
  level: RiskLevel;
  /** Each finding, with the construct that caused it and why it matters. */
  findings: Array<{ code: string; detail: string }>;
  /** True when a write statement has no WHERE clause. */
  unfilteredWrite: boolean;
}

/** The clause that follows a verb, as a token slice, up to the next clause keyword. */
function hasWhereAfter(stream: Token[], from: number): boolean {
  for (let index = from; index < stream.length; index += 1) {
    const token = stream[index]!;
    if (token.kind === 'keyword' && token.value.toLowerCase() === 'where') return true;
    // `DELETE FROM t USING u WHERE` still needs the where; the first clause keyword is `using`.
    if (
      token.kind === 'keyword' &&
      ['union', 'returning', 'limit', 'order', 'group'].includes(token.value.toLowerCase())
    ) {
      return false;
    }
  }
  return false;
}

/**
 * Classify what a statement does.
 *
 * The distinction that matters to a caller is not read/write but *recoverable*: a `DELETE` with a
 * `WHERE` can be undone by re-inserting; a `TRUNCATE` or a `DROP` cannot. Both are reported, and the
 * level says which.
 */
export function risk(tokens: Token[]): Risk {
  const stream = significant(tokens);
  const findings: Array<{ code: string; detail: string }> = [];
  const words = stream.filter((token) => token.kind === 'keyword').map((token) => token.value.toLowerCase());
  const first = words[0] ?? '';

  // A CTE hides the real verb: `WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x`. The statement
  // starts with `with`, so a check that only looked at the first word called it a read — and an
  // unfiltered `DELETE` inside it went unreported, which is the one case worth catching.
  const writeVerb = ['delete', 'update'].find((word) => words.includes(word));

  let level: RiskLevel = 'read';
  if (['insert', 'update', 'delete', 'merge', 'upsert'].includes(first)) level = 'write';
  if (['drop', 'truncate', 'alter', 'create', 'grant', 'revoke'].includes(first)) {
    level = first === 'drop' || first === 'truncate' ? 'destructive' : 'schema';
  }
  if (words.includes('insert') || words.includes('update') || words.includes('delete')) {
    if (level === 'read') level = 'write';
  }
  if (words.includes('truncate')) level = 'destructive';
  if (words.includes('drop')) level = 'destructive';

  let unfilteredWrite = false;
  if (writeVerb) {
    // Search from the verb itself, not from the statement start: a CTE's `WITH` precedes it, and
    // scanning from the front would pair the verb with the outer statement's clauses.
    const verbIndex = stream.findIndex((token) => token.kind === 'keyword' && token.value.toLowerCase() === writeVerb);
    if (!hasWhereAfter(stream, Math.max(0, verbIndex))) {
      unfilteredWrite = true;
      findings.push({
        code: 'UNFILTERED_WRITE',
        detail:
          `${writeVerb.toUpperCase()} WHERE clausesiz — jadvaldagi barcha qatorlar o'zgaradi. ` +
          `Bu qaytarib bo'lmaydi (transaction ichida bo'lmasa).`,
      });
    }
  }
  if (first === 'truncate') {
    findings.push({
      code: 'TRUNCATE',
      detail: 'TRUNCATE qatorlarni o‘chiradi va odatda identifikatorni nolga tushiradi — qaytarib bo‘lmaydi.',
    });
  }
  if (first === 'drop') {
    findings.push({ code: 'DROP', detail: 'DROP obyektni butunlay olib tashlaydi — qaytarib bo‘lmaydi.' });
  }
  if (words.includes('grant') || words.includes('revoke')) {
    findings.push({
      code: 'PRIVILEGE_CHANGE',
      detail: 'GRANT/REVOKE ruxsatni o‘zgartiradi — maʼlumot chegarasiga tegiladi.',
    });
  }
  if (first === 'select' && hasForUpdate(stream)) {
    findings.push({
      code: 'ROW_LOCK',
      detail: 'SELECT ... FOR UPDATE qatorlarni bloklaydi — boshqa tranzaksiya kutadi.',
    });
  }
  if (words.includes('into') && words.includes('outfile')) {
    findings.push({ code: 'FILE_WRITE', detail: 'INTO OUTFILE serverga fayl yozadi.' });
  }

  return { level, findings, unfilteredWrite };
}

function hasForUpdate(stream: Token[]): boolean {
  for (let index = 0; index < stream.length; index += 1) {
    const token = stream[index]!;
    if (token.kind === 'keyword' && token.value.toLowerCase() === 'for') {
      if (stream[index + 1]?.value.toLowerCase() === 'update') return true;
    }
  }
  return false;
}

/** Whether a statement changes anything, ignoring the distinction between write and destroy. */
export function isMutating(tokens: Token[]): boolean {
  const level = risk(tokens).level;
  return level === 'write' || level === 'destructive' || level === 'schema';
}

export interface Analysis {
  kind: string;
  tables: TableRef[];
  columns: string[];
  parameters: Array<{ name: string | number; count: number }>;
  complexity: Complexity;
  risk: Risk;
  /** Every keyword used, deduplicated, in order of first appearance. */
  keywords: string[];
}

/** Everything the tools report about one statement, computed once. */
export function analyse(sql: string): Analysis {
  const tokens = significant(tokenize(sql));
  const refs = tableRefs(tokens);
  return {
    kind: tokens[0]?.value.toLowerCase() ?? '',
    tables: refs,
    columns: identifiers(tokens)
      // A name after `SET a =` or in a column list is a column; every other identifier is a relation
      // name or an alias. Kept separate so a caller can see which names a statement binds.
      .map((token) => token.text),
    parameters: parameters(tokenize(sql)).map((entry) => ({ name: entry.name, count: entry.count })),
    complexity: complexity(tokens),
    risk: risk(tokens),
    keywords: [
      ...new Set(tokens.filter((token) => token.kind === 'keyword').map((token) => token.value.toLowerCase())),
    ],
  };
}

/** The parameter style a script uses, which is what decides which driver can run it. */
export type PlaceholderStyle =
  'question' | 'numbered' | 'named_colon' | 'named_at' | 'named_percent' | 'mixed' | 'none';

export function placeholderStyle(tokens: Token[]): PlaceholderStyle {
  const styles = new Set<PlaceholderStyle>();
  for (const token of tokens) {
    if (token.kind !== 'parameter') continue;
    const value = token.parameter;
    if (value === '?') styles.add('question');
    else if (typeof value === 'number') styles.add('numbered');
    else {
      const text = token.text;
      if (text.startsWith(':')) styles.add('named_colon');
      else if (text.startsWith('@')) styles.add('named_at');
      else styles.add('named_percent');
    }
  }
  if (styles.size === 0) return 'none';
  return styles.size === 1 ? [...styles][0]! : 'mixed';
}
