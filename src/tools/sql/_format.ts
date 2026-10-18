/**
 * Formatting and dialect comparison.
 *
 * A formatter that changes the meaning of a statement is worse than no formatter, so this one only
 * adjusts whitespace between tokens and leaves the text of every token byte-for-byte alone. The test
 * asserts exactly that: format, then tokenize, then compare the token streams.
 */

import { significant, tokenize, type Token } from './_lexer.js';

/** Keywords that take a lower-case word next to them in the dialects compared here. */
const SET_TYPES = new Set([
  'bigint',
  'boolean',
  'bytea',
  'char',
  'character',
  'date',
  'decimal',
  'double',
  'float',
  'int',
  'integer',
  'interval',
  'json',
  'jsonb',
  'numeric',
  'real',
  'serial',
  'smallint',
  'text',
  'time',
  'timestamp',
  'timestamptz',
  'uuid',
  'varchar',
]);

/** Rendered on their own line, because a list of them is unreadable otherwise. */
const LEADING = new Set([
  'select',
  'from',
  'where',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'union',
  'values',
  'set',
  'returning',
  'window',
]);

export function format(sql: string, indent = '  '): string {
  const tokens = significant(tokenize(sql));
  if (tokens.length === 0) return '';

  const out: string[] = [];
  let atLineStart = true;
  let depth = 0;

  const emit = (text: string, space: boolean): void => {
    if (space && !atLineStart) out.push(' ');
    out.push(text);
    atLineStart = false;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const lower = token.value.toLowerCase();
    const previous = index > 0 ? tokens[index - 1] : undefined;
    const previousLower = previous?.value.toLowerCase() ?? '';

    // Comments are dropped: a formatter that silently deletes a comment loses a note somebody left.
    // Callers who need them should use `pro_sql_tokenize`, which keeps every token.
    if (token.kind === 'comment') continue;

    if (token.text === ';' || (token.kind === 'punctuation' && token.text === ';')) {
      out.push(';\n');
      atLineStart = true;
      continue;
    }

    if (token.text === '(') {
      // `count(*)` keeps its asterisk attached, and a subquery opens its own line.
      const opensSubquery = previousLower === 'from' || previousLower === 'join';
      emit('(', opensSubquery ? false : true);
      depth += 1;
      continue;
    }
    if (token.text === ')') {
      depth = Math.max(0, depth - 1);
      emit(')', false);
      continue;
    }
    if (token.text === ',') {
      emit(',', false);
      continue;
    }

    if (token.kind === 'keyword' && LEADING.has(lower)) {
      if (out.length > 0) out.push('\n');
      out.push(indent.repeat(Math.max(0, depth)));
      out.push(lower.toUpperCase());
      atLineStart = false;
      continue;
    }

    // A data type after `SET column` reads better in lower case; it is an identifier, not a keyword.
    if (previousLower === 'set' && token.kind === 'identifier' && SET_TYPES.has(lower)) {
      emit(lower, true);
      continue;
    }

    // Keywords uppercase, everything else as written. A quoted identifier keeps its case exactly, which
    // is the whole point of quoting it.
    const text = token.kind === 'keyword' ? lower.toUpperCase() : token.text;
    const needsSpace = !(token.kind === 'punctuation' && [';'].includes(token.text));
    emit(text, needsSpace);
  }

  return out
    .join('')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line, index, all) => line.length > 0 || (index > 0 && all[index - 1]!.length > 0))
    .join('\n')
    .trim();
}

/** What two dialects call the same idea, for the differences a caller actually runs into. */
export interface DialectFeature {
  feature: string;
  postgres: string;
  mysql: string;
  sqlite: string;
  mssql: string;
}

export const DIALECT_FEATURES: readonly DialectFeature[] = [
  {
    feature: 'Auto-increment primary key',
    postgres: 'serial / bigserial / GENERATED ALWAYS AS IDENTITY',
    mysql: 'AUTO_INCREMENT',
    sqlite: 'INTEGER PRIMARY KEY AUTOINCREMENT',
    mssql: 'IDENTITY(1,1)',
  },
  {
    feature: 'Placeholder style',
    postgres: '$1, $2',
    mysql: '?',
    sqlite: '?, ?1, :name',
    mssql: '@name',
  },
  {
    feature: 'String concatenation',
    postgres: '||',
    mysql: 'CONCAT()',
    sqlite: '||',
    mssql: '+ or CONCAT()',
  },
  {
    feature: 'Current timestamp',
    postgres: 'now() or CURRENT_TIMESTAMP',
    mysql: 'NOW() or CURRENT_TIMESTAMP',
    sqlite: "datetime('now') or CURRENT_TIMESTAMP",
    mssql: 'GETDATE() or SYSDATETIME()',
  },
  {
    feature: 'Limit / offset',
    postgres: 'LIMIT n OFFSET m',
    mysql: 'LIMIT m, n',
    sqlite: 'LIMIT n OFFSET m',
    mssql: 'OFFSET m ROWS FETCH NEXT n ROWS ONLY',
  },
  {
    feature: 'Upsert',
    postgres: 'ON CONFLICT (...) DO UPDATE',
    mysql: 'ON DUPLICATE KEY UPDATE',
    sqlite: 'ON CONFLICT (...) DO UPDATE',
    mssql: 'MERGE',
  },
  {
    feature: 'JSON type',
    postgres: 'json / jsonb (binary)',
    mysql: 'JSON',
    sqlite: 'TEXT with json1',
    mssql: 'nvarchar(max) with JSON functions',
  },
  {
    feature: 'Boolean true literal',
    postgres: 'TRUE',
    mysql: 'TRUE (alias for 1)',
    sqlite: '1 / 0 (no true keyword before 3.23)',
    mssql: '1 / 0',
  },
  {
    feature: 'Regex match',
    postgres: '~ and ~*',
    mysql: 'REGEXP and REGEXP BINARY',
    sqlite: 'REGEXP (needs a function)',
    mssql: 'no native regex',
  },
  {
    feature: 'Cast syntax',
    postgres: 'value::type or CAST(value AS type)',
    mysql: 'CAST(value AS type) only',
    sqlite: 'CAST(value AS type)',
    mssql: 'CAST(value AS type)',
  },
  {
    feature: 'Drop a column',
    postgres: 'ALTER TABLE t DROP COLUMN c',
    mysql: 'ALTER TABLE t DROP COLUMN c',
    sqlite: 'older versions cannot',
    mssql: 'ALTER TABLE t DROP COLUMN c',
  },
  {
    feature: 'Return rows from a modifying statement',
    postgres: 'RETURNING',
    mysql: 'not supported',
    sqlite: 'RETURNING (3.35+)',
    mssql: 'OUTPUT',
  },
];

/**
 * Differences between the two dialects, derived rather than listed, by checking which constructs appear.
 *
 * Reported as "this query uses `LIMIT`" for MySQL rather than "these are the differences", because a
 * caller has one query and needs to know about that one.
 */
export function dialectNotes(sql: string): Array<{ construct: string; note: string }> {
  const tokens = significant(tokenize(sql));
  const has = (...words: string[]): boolean =>
    words.some((word) => tokens.some((token) => token.value.toLowerCase() === word && token.kind !== 'string'));

  const notes: Array<{ construct: string; note: string }> = [];

  if (has('limit') && !has('offset')) {
    notes.push({
      construct: 'LIMIT without OFFSET',
      note: 'MySQL is `LIMIT m, n` (m offset, n count); PostgreSQL and SQLite are `LIMIT n OFFSET m`. The same words mean different arguments.',
    });
  }
  if (tokens.some((token) => token.kind === 'operator' && token.text === '::')) {
    notes.push({
      construct: ':: cast',
      note: 'PostgreSQL and SQLite accept `value::type`. MySQL and SQL Server need CAST(value AS type).',
    });
  }
  if (tokens.some((token) => token.kind === 'operator' && token.text === '~')) {
    notes.push({
      construct: '~ regex operator',
      note: 'PostgreSQL only. MySQL uses REGEXP, SQLite needs a function, SQL Server has no native regex.',
    });
  }
  if (has('returning')) {
    notes.push({
      construct: 'RETURNING',
      note: 'PostgreSQL and SQLite 3.35+. MySQL has no equivalent; SQL Server uses OUTPUT.',
    });
  }
  if (has('ilike')) {
    notes.push({
      construct: 'ILIKE',
      note: 'PostgreSQL and SQLite. MySQL uses LIKE with a case-insensitive collation.',
    });
  }
  if (has('serial', 'bigserial', 'smallserial')) {
    notes.push({
      construct: 'serial',
      note: 'PostgreSQL. MySQL uses AUTO_INCREMENT, SQLite INTEGER PRIMARY KEY, SQL Server IDENTITY.',
    });
  }
  return notes;
}

export type { Token };
