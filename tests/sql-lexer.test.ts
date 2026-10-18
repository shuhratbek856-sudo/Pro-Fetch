// SQL kategoriyasi: lexer, analiz, formatter.
//
// Uch narsa alohida tekshiriladi, chunki bir-birining xatosini yashiradi:
//   1. Lexer: satr, izoh, dollar-quoted, operator uzunligi, parameter usullari
//   2. Analiz: statement chegarasi, jadval topish, xavf darajasi, murakkablik
//   3. Formatter: token oqimi SAQLANISHI — bu uning xavfsizligi

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { KEYWORDS, parameters, significant, tokenize } from '../src/tools/sql/_lexer.js';
import {
  analyse,
  complexity,
  isMutating,
  placeholderStyle,
  risk,
  splitStatements,
  tableRefs,
} from '../src/tools/sql/_analyse.js';
import { DIALECT_FEATURES, dialectNotes, format } from '../src/tools/sql/_format.js';
import { dispatch } from '../src/core/tool.js';
import type { ToolResult } from '../src/core/types.js';

let workspace: string;

beforeAll(async () => {
  process.env.PRO_FETCH_PROFILE = 'full';
  workspace = mkdtempSync(path.join(tmpdir(), 'pf-sql-'));
  process.env.PRO_FETCH_OUTPUT_ROOT = workspace;
  process.env.PRO_FETCH_CACHE_DIR = workspace;
  await import('../src/env.js');
  await import('../src/loader.js');
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const body = (result: ToolResult): Record<string, unknown> => {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, unknown>) : { raw: text };
};

const textOf = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');

/** Kind plus value, so spacing and case do not register as a change. */
const fingerprint = (sql: string): string =>
  significant(tokenize(sql))
    .map((token) => `${token.kind}:${token.value}`)
    .join('|');

const kinds = (sql: string): string[] =>
  tokenize(sql)
    .filter((token) => token.kind !== 'eof')
    .map((token) => `${token.kind}:${token.text}`);

describe('SQL lexer', () => {
  it('tokenlarni turlariga ajratadi', () => {
    expect(kinds('SELECT a FROM t WHERE b = 1')).toEqual([
      'keyword:SELECT',
      'identifier:a',
      'keyword:FROM',
      'identifier:t',
      'keyword:WHERE',
      'identifier:b',
      'operator:=',
      'number:1',
    ]);
  });

  it('satr ichidagi apostrof satrni tugatmaydi', () => {
    // `'it''s'` is one string containing a quote. A reader that closes on the first `'` sees an
    // unterminated literal and everything after it as noise.
    const tokens = kinds("SELECT 'it''s'");
    expect(tokens).toHaveLength(2);
    expect(tokens[1]).toBe("string:'it''s'");
  });

  it('dollar-quoted blok bitta token', () => {
    const sql = 'CREATE FUNCTION f() RETURNS int AS $$ BEGIN; RETURN 1; END; $$ LANGUAGE plpgsql';
    expect(kinds(sql).filter((token) => token.startsWith('dollar_string:'))).toHaveLength(1);
  });

  it('dollar-quoted ichidagi nuqta statement chegarasi emas', () => {
    const sql = 'CREATE FUNCTION f() RETURNS int AS $$ BEGIN; RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 1';
    expect(splitStatements(sql).statements).toHaveLength(2);
  });

  it('ichki izoh bitta izoh', () => {
    // PostgreSQL nests block comments, so `/* /* */ */` is one. Stopping at the inner `*/` turns
    // the rest of the statement into tokens.
    const tokens = kinds('SELECT /* /* nested */ still comment */ 1');
    expect(tokens.filter((token) => token.startsWith('comment:'))).toHaveLength(1);
  });

  it('izohdagi nuqta statement chegarasi emas', () => {
    expect(splitStatements('SELECT 1 -- ; not a boundary\n; SELECT 2').statements).toHaveLength(2);
  });

  it('escape string', () => {
    const tokens = kinds("SELECT E'a\\'b' , 1");
    expect(tokens.filter((token) => token.startsWith('string:'))).toHaveLength(1);
  });

  it('quoted identifier kalit emas', () => {
    const tokens = kinds('SELECT "select", "from" FROM "my table"');
    expect(tokens.filter((token) => token.startsWith('quoted_identifier:'))).toHaveLength(3);
    expect(tokens.filter((token) => token.startsWith('keyword:'))).toHaveLength(2);
  });

  it('uzun operator bitta token', () => {
    // `<=>` matched greedily without sorting would be `<=` then `>`, which matches nothing downstream.
    expect(kinds('SELECT a <=> b')).toContain('operator:<=>');
  });

  it(':: cast va :name farqlanadi', () => {
    const tokens = kinds('SELECT a::text, :param');
    expect(tokens).toContain('operator:::');
    expect(tokens.some((token) => token.startsWith('parameter:'))).toBe(true);
  });

  it.each([
    ['SELECT ?', '?'],
    ['SELECT $1, $2', '1'],
    ['SELECT :name', 'name'],
    ['SELECT @name', 'name'],
    ['SELECT %(name)s', 'name'],
  ])('parameter usuli: %s', (sql, expected) => {
    expect(String(parameters(tokenize(sql))[0]!.name)).toBe(expected);
  });

  it('raqam formatlari', () => {
    const numbers = kinds('SELECT 1, 1.5, 1e3, 1.5e-3, 0xFF, 0b1010, .5')
      .filter((token) => token.startsWith('number:'))
      .map((token) => token.slice(7));
    expect(numbers).toEqual(['1', '1.5', '1e3', '1.5e-3', '0xFF', '0b1010', '.5']);
  });

  it('parametrlar takrorlanuvchilari bilan birlashtiriladi', () => {
    const found = parameters(tokenize('SELECT ?, ?, ?, $1, $1'));
    expect(found).toHaveLength(2);
    expect(found[0]!.count).toBe(3);
    expect(found[1]!.count).toBe(2);
  });

  it("kalitlar ro'yxati bo'sh emas", () => {
    expect(KEYWORDS.has('select')).toBe(true);
    expect(KEYWORDS.has('returning')).toBe(true);
  });
});

describe("statement bo'linishi", () => {
  it('semisiz oxirgi statement', () => {
    expect(splitStatements('SELECT 1; SELECT 2').statements).toHaveLength(2);
  });

  it("ortiqcha nuqtalar bo'sh statement bermaydi", () => {
    expect(splitStatements('SELECT 1; ; ; SELECT 2').statements).toHaveLength(2);
  });

  it('izoh statement emas', () => {
    // Non-empty text is not a statement. A trailing comment produced an empty statement a caller
    // could not execute.
    expect(splitStatements('-- faqat izoh').statements).toHaveLength(0);
    expect(splitStatements('').statements).toHaveLength(0);
  });

  it('satr ichidagi nuqta hisobga olinadi', () => {
    const result = splitStatements("SELECT ';'");
    expect(result.insideLiterals).toBe(1);
    expect(result.statements).toHaveLength(1);
  });

  it('funksiya tanasi bitta statement', () => {
    const sql = `CREATE FUNCTION f() RETURNS int AS $$
BEGIN
  DELETE FROM t WHERE id = 1;
  RETURN 1;
END;
$$ LANGUAGE plpgsql`;
    const result = splitStatements(sql);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe('create');
  });
});

describe('jadval aniqlash', () => {
  it.each([
    ['SELECT * FROM users u JOIN orders o ON o.user_id = u.id', 2],
    ['INSERT INTO logs (a, b) VALUES (1, 2)', 1],
    ['UPDATE users SET name = 1 WHERE id = 2', 1],
    ['DELETE FROM sessions WHERE expired = 1', 1],
    ['SELECT * FROM public.users', 1],
  ])('%s', (sql, expected) => {
    expect(tableRefs(significant(tokenize(sql)))).toHaveLength(expected);
  });

  it('alias jadvaldan ajratiladi', () => {
    // `FROM users u` is a table and an alias; `FROM public.users` is a schema and a table. Both are
    // `ident ident` in token terms and only the space separates them.
    const refs = tableRefs(significant(tokenize('SELECT * FROM users u WHERE u.id = 1')));
    expect(refs[0]!.name).toBe('users');
    expect(refs[0]!.alias).toBe('u');
    expect(refs[0]!.schema).toBeUndefined();
  });

  it("INSERT INTO ustunlar ro'yxati jadval nomi emas", () => {
    const refs = tableRefs(significant(tokenize('INSERT INTO logs (a, b) VALUES (1, 2)')));
    expect(refs[0]!.name).toBe('logs');
    expect(refs[0]!.via).toBe('into');
  });

  it("SELECT ro'yxatidagi nom jadval emas", () => {
    expect(tableRefs(significant(tokenize('SELECT id, name FROM users'))).map((r) => r.name)).toEqual(['users']);
  });

  it('DELETE FROM verbni saqlaydi', () => {
    const refs = tableRefs(significant(tokenize('DELETE FROM sessions WHERE id = 1')));
    expect(refs[0]!.via).toBe('delete_from');
  });
});

describe('xavf darajasi', () => {
  it.each([
    ['SELECT * FROM t', 'read'],
    ['UPDATE t SET a = 1 WHERE id = 2', 'write'],
    ['DELETE FROM t WHERE id = 1', 'write'],
    ['DELETE FROM t', 'write'],
    ['TRUNCATE t', 'destructive'],
    ['DROP TABLE t', 'destructive'],
    ['CREATE INDEX i ON t (a)', 'schema'],
    ['ALTER TABLE t ADD COLUMN b int', 'schema'],
    ['GRANT SELECT ON t TO r', 'schema'],
  ])('%s -> %s', (sql, expected) => {
    expect(risk(significant(tokenize(sql))).level).toBe(expected);
  });

  it('WHERE clausesiz yozuv belgilanadi', () => {
    // `write`, not `destructive`: a DELETE is reversible inside a transaction, which TRUNCATE is not.
    // The severity is carried by the flag rather than by inflating the level.
    expect(risk(significant(tokenize('DELETE FROM t WHERE id = 1'))).unfilteredWrite).toBe(false);
    const unfiltered = risk(significant(tokenize('DELETE FROM t')));
    expect(unfiltered.unfilteredWrite).toBe(true);
    expect(unfiltered.findings.map((f) => f.code)).toContain('UNFILTERED_WRITE');
  });

  it("CTE ichidagi o'zgartirish yozuv hisoblanadi", () => {
    // The statement starts with `WITH`, so a check that only read the first word called it a read, and
    // the unfiltered DELETE inside it went unreported.
    const assessment = risk(significant(tokenize('WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x')));
    expect(assessment.level).toBe('write');
    expect(assessment.unfilteredWrite).toBe(true);
  });

  it("TRUNCATE va DROP qaytarib bo'lmasligi haqida ogohlantiradi", () => {
    expect(risk(significant(tokenize('TRUNCATE t'))).findings.map((f) => f.code)).toContain('TRUNCATE');
    expect(risk(significant(tokenize('DROP TABLE t'))).findings.map((f) => f.code)).toContain('DROP');
  });

  it('FOR UPDATE bloklashni aniqlaydi', () => {
    const assessment = risk(significant(tokenize('SELECT * FROM t WHERE id = 1 FOR UPDATE')));
    expect(assessment.findings.map((f) => f.code)).toContain('ROW_LOCK');
  });

  it("o'qish so'rovi topilma bermaydi", () => {
    expect(risk(significant(tokenize('SELECT * FROM t'))).findings).toEqual([]);
  });

  it("isMutating o'qish uchun yolgon", () => {
    expect(isMutating(significant(tokenize('SELECT 1')))).toBe(false);
    expect(isMutating(significant(tokenize('UPDATE t SET a = 1')))).toBe(true);
    expect(isMutating(significant(tokenize('DROP TABLE t')))).toBe(true);
  });
});

describe('murakkablik', () => {
  it("oddiy so'rov nol", () => {
    const measured = complexity(significant(tokenize('SELECT a FROM t')));
    expect(measured.depth).toBe(0);
    expect(measured.joins).toBe(0);
    expect(measured.subqueries).toBe(0);
    expect(measured.fanout).toBe(0);
  });

  it('chuqurlik, join, subquery va union hisoblanadi', () => {
    const sql = `SELECT a FROM (SELECT b FROM (SELECT c FROM t) x) y
                 JOIN z ON z.id = x.id JOIN w ON w.id = x.id
                 UNION SELECT d FROM u`;
    const measured = complexity(significant(tokenize(sql)));
    expect(measured.depth).toBe(2);
    expect(measured.joins).toBe(2);
    expect(measured.subqueries).toBe(2);
    expect(measured.fanout).toBe(5);
  });

  it('jadvallar soni', () => {
    expect(complexity(significant(tokenize('SELECT * FROM a JOIN b ON 1=1 JOIN c ON 1=1'))).distinctTables).toBe(3);
  });
});

describe('dialekt', () => {
  it("to'rtta bazaning farqlari to'liq", () => {
    expect(DIALECT_FEATURES.length).toBeGreaterThanOrEqual(10);
    for (const row of DIALECT_FEATURES) {
      expect(row.postgres, row.feature).toBeTruthy();
      expect(row.mysql, row.feature).toBeTruthy();
      expect(row.sqlite, row.feature).toBeTruthy();
      expect(row.mssql, row.feature).toBeTruthy();
    }
  });

  it.each([
    ['SELECT a::text FROM t', ':: cast'],
    ['SELECT * FROM t LIMIT 10', 'LIMIT without OFFSET'],
    ['SELECT a FROM t WHERE a ~ 1', '~ regex operator'],
    ['DELETE FROM t RETURNING id', 'RETURNING'],
    ['SELECT * FROM t WHERE a ILIKE 1', 'ILIKE'],
    ['CREATE TABLE t (id serial)', 'serial'],
  ])('%s -> %s', (sql, expected) => {
    expect(dialectNotes(sql).map((note) => note.construct)).toContain(expected);
  });

  it("oddiy so'rovda izoh yo'q", () => {
    expect(dialectNotes('SELECT a FROM t WHERE b = 1')).toEqual([]);
  });
});

describe('formatter token oqimini saqlaydi', () => {
  it.each([
    'SELECT a, b FROM t WHERE c = 1',
    "SELECT 'it''s; not a boundary' FROM t",
    'SELECT * FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = $1',
    'INSERT INTO logs (a, b) VALUES (1, 2), (3, 4)',
    'WITH x AS (SELECT 1) SELECT * FROM x',
    'SELECT COUNT(*) FROM t GROUP BY a HAVING COUNT(*) > 1 ORDER BY a LIMIT 10',
    'UPDATE t SET a = 1, b = 2 WHERE id = 3',
    'SELECT a::text FROM t',
    'SELECT * FROM public.users',
    'DELETE FROM t',
  ])('%s', (sql) => {
    // The guarantee that makes the formatter safe to use: same tokens in, same tokens out. A formatter
    // that changes the meaning of a statement is worse than no formatter, and this is what proves it
    // did not.
    expect(fingerprint(format(sql)), sql).toBe(fingerprint(sql));
  });

  it('statement chegaralari saqlanadi', () => {
    expect(splitStatements(format('SELECT 1; SELECT 2')).statements).toHaveLength(2);
  });

  it('xavf darajasi saqlanadi', () => {
    const sql = 'DELETE FROM t WHERE id = 1';
    expect(risk(significant(tokenize(format(sql)))).level).toBe(risk(significant(tokenize(sql))).level);
  });

  it("quoted identifier o'z harfida qoladi", () => {
    // Quoting a name is how it is made case-sensitive, so uppercasing it defeats the point.
    expect(format('SELECT "MiXeD" FROM t')).toContain('"MiXeD"');
  });

  it("bo'sh kirish", () => {
    expect(format('')).toBe('');
    expect(format('   ')).toBe('');
  });

  it('kalitlarni katta qiladi', () => {
    expect(format('select a from t')).toContain('SELECT');
  });
});

describe("SQL tool'lari", () => {
  it('analyse jadvallar, xavf va murakkablikni beradi', async () => {
    const sql = `WITH recent AS (SELECT user_id, COUNT(*) n FROM events GROUP BY user_id)
                 SELECT u.name FROM users u JOIN recent r ON r.user_id = u.id WHERE u.id = $1`;
    const result = body(await dispatch('pro_sql_analyse', { sql }));
    expect(result.statements).toBe(1);
    const first = (result.results as Array<Record<string, unknown>>)[0]!;
    expect((first.tables as unknown[]).length).toBe(3);
    expect((first.risk as Record<string, unknown>).level).toBe('read');
    expect(result.placeholder_style).toBe('numbered');
  });

  it("analyse WHERE clausesiz DELETE'ni belgilaydi", async () => {
    const result = body(await dispatch('pro_sql_analyse', { sql: 'DELETE FROM sessions' }));
    const first = (result.results as Array<Record<string, unknown>>)[0]!;
    expect((first.risk as Record<string, unknown>).unfiltered_write).toBe(true);
  });

  it('split funksiya tanasini birga saqlaydi', async () => {
    const sql = `CREATE FUNCTION f() RETURNS int AS $$ BEGIN; RETURN 1; END; $$ LANGUAGE plpgsql;
                 SELECT 1; SELECT 2`;
    const result = body(await dispatch('pro_sql_split', { sql }));
    expect(result.statements).toBe(3);
    expect(Number(result.semicolons_inside_literals)).toBeGreaterThan(0);
  });

  it('tables ishlatilmagan jadvalni topadi', async () => {
    const result = body(
      await dispatch('pro_sql_tables', {
        sql: 'SELECT * FROM users u JOIN orders o ON o.user_id = u.id',
        missing: ['users', 'orders', 'products'],
      }),
    );
    expect(result.count).toBe(2);
    expect(result.unused_from_list).toEqual(['products']);
  });

  it('risk eng yomon darajani qaytaradi', async () => {
    expect(body(await dispatch('pro_sql_risk', { sql: 'SELECT 1; DROP TABLE t' })).overall).toBe('destructive');
  });

  it('format token oqimini saqlaganini tasdiqlaydi', async () => {
    const result = body(await dispatch('pro_sql_format', { sql: 'select a,b from t where c=1' }));
    expect(result.tokens_preserved).toBe(true);
  });

  it('tokenize izohlarni saqlaydi', async () => {
    const result = body(await dispatch('pro_sql_tokenize', { sql: 'SELECT a -- note\nFROM t' }));
    expect((result.kinds as Record<string, number>).comment).toBe(1);
  });

  it("complexity oddiy so'rovda nol", async () => {
    const result = body(await dispatch('pro_sql_complexity', { sql: 'SELECT a FROM t' }));
    expect((result.worst as Record<string, unknown>).fanout).toBe(0);
  });

  it('dialect argument bermasdan jadvalni qaytaradi', async () => {
    // `anyOf: [{ required: ['sql'] }]` said a query was required, so the only way to get the comparison
    // table was to pass a query and ignore the query section.
    const result = body(await dispatch('pro_sql_dialect', {}));
    expect(Number(result.features)).toBeGreaterThanOrEqual(10);
  });

  it("dialect so'rovga tegishli qismini ajratadi", async () => {
    const result = body(await dispatch('pro_sql_dialect', { sql: 'SELECT a::text FROM t LIMIT 10' }));
    expect((result.used_in_query as unknown[]).length).toBe(2);
  });

  it("check to'g'ri SQL'ni tasdiqlaydi", async () => {
    const result = body(await dispatch('pro_sql_check', { sql: 'SELECT a FROM t WHERE b = 1' }));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["SELECT 'unclosed FROM t", 'UNTERMINATED_LITERAL'],
    ['SELECT (a FROM t', 'UNBALANCED_PAREN'],
    ['SELECT * FROM t WHERE a = $1 AND b = $3', 'PARAMETER_GAP'],
  ])('check topadi: %s', async (sql, code) => {
    const result = body(await dispatch('pro_sql_check', { sql }));
    expect(result.ok).toBe(false);
    expect((result.problems as Array<{ code: string }>).map((p) => p.code)).toContain(code);
  });

  it('check yopilmagan izohni topadi', async () => {
    const result = body(await dispatch('pro_sql_check', { sql: 'SELECT 1 /* unclosed' }));
    expect((result.problems as Array<{ code: string }>).map((p) => p.code)).toContain('UNTERMINATED_COMMENT');
  });

  it('parameters ? har biriga alohida qiymat beradi', async () => {
    const result = body(await dispatch('pro_sql_parameters', { sql: 'SELECT * FROM t WHERE a = ? AND b = ?' }));
    expect(result.count).toBe(2);
    expect(String(result.preview)).toContain("'param_1'");
    expect(String(result.preview)).toContain("'param_2'");
  });

  it('parameters aralash usulni ogohlantiradi', async () => {
    const result = body(await dispatch('pro_sql_parameters', { sql: 'SELECT * FROM t WHERE a = ? AND b = $1' }));
    expect(result.style).toBe('mixed');
    expect(result.warning).toBeTruthy();
  });

  it("substitute qiymatlarni to'g'ri qo'yadi", async () => {
    const result = body(
      await dispatch('pro_sql_substitute', {
        sql: 'SELECT * FROM t WHERE a = $1 AND b = $2',
        values: ['hello', '42'],
      }),
    );
    expect(String(result.statement)).toContain("'hello'");
    expect(String(result.statement)).toContain('42');
  });

  it("substitute apostrofni xavfsiz qo'shadi", async () => {
    // The reason this exists rather than a regex replace: a raw splice turns `O'Brien` into a literal
    // that ends early, and the rest of the value becomes SQL.
    const result = body(
      await dispatch('pro_sql_substitute', { sql: 'SELECT * FROM t WHERE name = $1', values: ["O'Brien"] }),
    );
    expect(String(result.statement)).toContain("'O''Brien'");
  });

  it("substitute har bir ? ga o'z qiymatini beradi", async () => {
    const result = body(
      await dispatch('pro_sql_substitute', {
        sql: 'SELECT * FROM t WHERE a = ? AND b = ?',
        values: ['one', 'two'],
      }),
    );
    const statement = String(result.statement);
    expect(statement).toContain("'one'");
    expect(statement).toContain("'two'");
  });

  it('substitute nomlangan parametrlarni beradi', async () => {
    const result = body(
      await dispatch('pro_sql_substitute', { sql: 'SELECT * FROM t WHERE a = :x', named: { x: 'val' } }),
    );
    expect(String(result.statement)).toContain("'val'");
  });

  it.each([
    ['parameter yo q', { sql: 'SELECT 1', values: ['x'] }, /parameter yo.q/i],
    ['qiymat berilmagan', { sql: 'SELECT * FROM t WHERE a = $1', values: [] }, /Qiymat berilmagan/],
    ['aralash usul', { sql: 'SELECT * FROM t WHERE a = ? AND b = $1', values: ['x', 'y'] }, /aralash/],
  ])('substitute rad etadi: %s', async (_label, args, pattern) => {
    const text = textOf(await dispatch('pro_sql_substitute', args as Record<string, unknown>));
    expect(text).toMatch(pattern);
  });

  it('SQL injection namunasi bajarilmaydi va DROP topiladi', async () => {
    // The pattern a caller pastes in to check it. Nothing is executed; the second statement is reported.
    const result = body(
      await dispatch('pro_sql_risk', { sql: "SELECT * FROM users WHERE name = 'x' OR 1=1; DROP TABLE users; --" }),
    );
    expect(result.overall).toBe('destructive');
    expect((result.details as unknown[]).length).toBe(2);
  });
});
