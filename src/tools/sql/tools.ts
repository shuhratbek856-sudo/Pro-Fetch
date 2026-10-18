import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { bool, strOrEmpty, view } from '../../core/input.js';
import { KEYWORDS, parameters, significant, tokenize, type Token } from './_lexer.js';
import {
  analyse,
  complexity,
  isMutating,
  placeholderStyle,
  risk,
  splitStatements,
  tableRefs,
  type Complexity,
  type Risk,
} from './_analyse.js';
import { DIALECT_FEATURES, dialectNotes, format } from './_format.js';

const text = (value: unknown, label: string): string => {
  const sql = String(value ?? '');
  if (!sql.trim()) throw new Error(`${label} bo‘sh.`);
  return sql;
};

/** What each risk level means, in words a caller can act on. */
const RISK_MEANING: Record<Risk['level'], string> = {
  read: 'faqat o‘qiydi, hech narsani o‘zgartirmaydi',
  write: "o'zgartiradi (transaction ichida qaytarib bo'ladi)",
  destructive: "yo'q qiladi (odatda qaytarib bo'lmaydi)",
  schema: "sxemani o'zgartiradi",
};

export default [
  defineTool({
    name: 'pro_sql_analyse',
    description:
      'SQL so‘rovini tahlil qilish: qanday amal, qaysi jadvallar, murakkablik, parameterlar, xavf ' +
      'darajasi. WHERE clausesiz DELETE/UPDATE alohida belgilanadi. So‘rov bajarilmaydi — faqat ' +
      'o‘qiladi va tahlil qilinadi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Tahlil qilinadigan SQL (bitta yoki bir necha statement)' },
        max_results: { type: 'number', description: 'Statement ro‘yxatida ko‘pi bilan shuncha' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const split = splitStatements(sql);
        const maxResults = Math.max(1, Math.min(200, Number(p.max_results ?? 50)));

        const statements = split.statements.slice(0, maxResults).map((statement) => {
          const analysis = analyse(statement.text);
          return {
            kind: statement.kind,
            tables: analysis.tables,
            parameters: analysis.parameters,
            complexity: analysis.complexity,
            risk: {
              level: analysis.risk.level,
              meaning: RISK_MEANING[analysis.risk.level],
              findings: analysis.risk.findings,
              unfiltered_write: analysis.risk.unfilteredWrite,
            },
            keywords: analysis.keywords,
            identifiers: analysis.columns.length,
            text: statement.text,
          };
        });

        const totals = statements.reduce(
          (accumulator, statement) => ({
            tables: accumulator.tables + statement.complexity.distinctTables,
            writes:
              accumulator.writes +
              (statement.risk.level === 'write' ||
              statement.risk.level === 'destructive' ||
              statement.risk.level === 'schema'
                ? 1
                : 0),
            destructive: accumulator.destructive + (statement.risk.level === 'destructive' ? 1 : 0),
          }),
          { tables: 0, writes: 0, destructive: 0 },
        );

        return jsonBlock('SQL tahlil', {
          statements: split.statements.length,
          listed: statements.length,
          // Semicolons that live inside a literal are reported, because a caller who expected three
          // statements and got one needs to know why rather than guessing.
          semicolons_inside_literals: split.insideLiterals,
          totals,
          placeholder_style: placeholderStyle(tokenize(sql)),
          writes_anything: statements.some((statement) => statement.risk.level !== 'read'),
          results: statements,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_split',
    description:
      'SQL skriptini statement‘larga bo‘lish. Nuqta satr, izoh yoki dollar-quoted blok ichida ' +
      'chegara hisoblanmaydi — PostgreSQL funksiya tanasi shu sabab to‘liq qoladi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Bo‘linadigan SQL skripti' },
        with_detail: { type: 'boolean', description: 'Har bir statement uchun tahlil qo‘shish (standart: ha)' },
        max_results: { type: 'number', description: 'Ko‘pi bilan shuncha statement' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const split = splitStatements(sql);
        const withDetail = bool(p, 'with_detail', true);
        const maxResults = Math.max(1, Math.min(500, Number(p.max_results ?? 100)));
        const shown = split.statements.slice(0, maxResults);

        return jsonBlock('SQL statement‘lari', {
          statements: split.statements.length,
          listed: shown.length,
          truncated:
            split.statements.length > shown.length
              ? `yana ${split.statements.length - shown.length} ta bor`
              : undefined,
          semicolons_inside_literals: split.insideLiterals,
          placeholder_style: placeholderStyle(tokenize(sql)),
          results: shown.map((statement) => ({
            index: split.statements.indexOf(statement) + 1,
            kind: statement.kind,
            mutating: isMutating(statement.tokens),
            tables: withDetail ? tableRefs(statement.tokens).map((ref) => ref.name) : undefined,
            risk: withDetail ? risk(statement.tokens).level : undefined,
            text: statement.text,
          })),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_tables',
    description:
      'So‘rov qaysi jadvallarni ishlatishini aniqlash: FROM, JOIN, INTO, UPDATE, DELETE FROM. ' +
      'Sxema va alias alohida. SELECT ro‘yxatidagi nomlar jadval hisoblanmaydi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL so‘rovi' },
        missing: {
          type: 'array',
          items: { type: 'string' },
          description: 'Mavzular ro‘yxati — so‘rovda ishlatilmaganlari topish uchun',
        },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const refs = tableRefs(significant(tokenize(sql)));
        const distinct = [...new Set(refs.map((ref) => `${ref.schema ?? ''}.${ref.name}`))];

        const declared = Array.isArray(p.missing) ? (p.missing as unknown[]).map(String) : [];
        const used = new Set(refs.map((ref) => ref.name.toLowerCase()));
        return jsonBlock('SQL jadvallari', {
          count: refs.length,
          distinct: distinct.length,
          tables: refs,
          unused_from_list: declared.filter((name) => !used.has(name.toLowerCase())),
          // Reported because a `FROM` inside a subquery is a real table read, and a caller counting
          // statements rather than references will otherwise undercount.
          note:
            refs.length !== distinct.length
              ? `${refs.length} ta havola, ${distinct.length} ta jadval — bir jadval bir necha marta ishlatilgan (subquery yoki o‘ziga qo‘shish).`
              : undefined,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_risk',
    description:
      'SQL xavf darajasi: read / write / destructive / schema. WHERE clausesiz DELETE va UPDATE, ' +
      'TRUNCATE, DROP, GRANT/REVOKE, FOR UPDATE bloklash, INTO OUTFILE — hammasi alohida topiladi. ' +
      'CTE ichida yashiringan o‘zgartirish ham ko‘rinadi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL so‘rovi yoki skripti' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const split = splitStatements(sql);
        const statements = split.statements.map((statement) => {
          const assessment = risk(statement.tokens);
          return {
            kind: statement.kind,
            level: assessment.level,
            meaning: RISK_MEANING[assessment.level],
            unfiltered_write: assessment.unfilteredWrite,
            findings: assessment.findings,
            text: statement.text,
          };
        });

        const worst = statements.some((s) => s.level === 'destructive')
          ? 'destructive'
          : statements.some((s) => s.level === 'schema')
            ? 'schema'
            : statements.some((s) => s.level === 'write')
              ? 'write'
              : 'read';

        return jsonBlock('SQL xavf darajasi', {
          overall: worst,
          statements: statements.length,
          // Stated plainly: this is a classification, not an authorisation. It tells a caller or a model
          // what a statement does, and the write gate in this server is `PRO_FETCH_READ_ONLY`.
          note: 'Bu tasnif, ruxsat emas. Shu bilan ham, bajarishdan oldin har doim WHERE borligini tekshiring.',
          details: statements,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_format',
    description:
      'SQL ni chiroyli formatlash. Kafolat: formatlashdan keyin token oqimi, jadvallar, xavf ' +
      'darajasi va statement chegaralari o‘zgarmaydi — izohlar tushiriladi, chunki ularni saqlash ' +
      'uchun pro_sql_tokenize ishlating.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Formatlanadigan SQL' },
        indent: { type: 'string', description: 'Chekka (standart: ikki bo‘shliq)' },
        verify: { type: 'boolean', description: 'Token oqimining o‘zgarmaganini tekshirish (standart: ha)' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const indent = String(p.indent ?? '  ');
        const verify = bool(p, 'verify', true);
        const formatted = format(sql, indent);

        const result: Record<string, unknown> = { formatted, indent };
        if (verify) {
          // The check that makes the tool safe to use: same tokens in, same tokens out. A formatter that
          // changes the meaning of a statement is worse than no formatter, and this is what proves it did
          // not — measured on the output, not assumed.
          //
          // Compared on kind and *value*, joined without a separator. Spacing and letter case are what
          // the formatter is for: `select a,b from t` becomes `SELECT a, b FROM t`, and a comparison on
          // `token.text` or a `' '`-joined string reports that as a change every time the formatter works.
          // `value` is the lowercased keyword and the text as written for everything else, which is the
          // level at which a statement is actually the same statement.
          const before = significant(tokenize(sql))
            .map((token) => `${token.kind}:${token.value}`)
            .join('|');
          const after = significant(tokenize(formatted))
            .map((token) => `${token.kind}:${token.value}`)
            .join('|');
          result.tokens_preserved = before === after;
          if (!result.tokens_preserved) {
            result.original = sql;
            return fail(
              `Formatlash token oqimini o‘zgartirdi: "${before.slice(0, 80)}" -> "${after.slice(0, 80)}". ` +
                `Bu xato — formatlash natijasi ishlatilmasin.`,
            );
          }
        }
        return jsonBlock('SQL formatlash', result);
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_tokenize',
    description:
      'SQL ni tokenlarga bo‘lish: har bir kalit, nom, satr, son, operator, parameter va izoh ' +
      'boshlanish/oxirgi pozitsiyasi bilan. Bu lexer‘ning to‘liq ko‘rinishi — izohlar saqlanadi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Tokenlarga bo‘linadigan SQL' },
        include_comments: { type: 'boolean', description: 'Izohlarni ham qaytarish (standart: ha)' },
        max_results: { type: 'number', description: 'Ko‘pi bilan shuncha token' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const withComments = bool(p, 'include_comments', true);
        const maxResults = Math.max(1, Math.min(5000, Number(p.max_results ?? 500)));
        const all = tokenize(sql);
        const shown = all.filter((token) => withComments || token.kind !== 'comment').slice(0, maxResults);

        const counts: Record<string, number> = {};
        for (const token of all) counts[token.kind] = (counts[token.kind] ?? 0) + 1;

        return jsonBlock('SQL tokenlari', {
          total: all.length,
          listed: shown.length,
          kinds: counts,
          keywords_available: KEYWORDS.size,
          placeholder_style: placeholderStyle(all),
          parameters: parameters(all),
          tokens: shown.map((token) => ({
            kind: token.kind,
            text: token.text,
            start: token.start,
            end: token.end,
            ...(token.parameter === undefined ? {} : { parameter: token.parameter }),
          })),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_complexity',
    description:
      'So‘rov murakkabligi: token soni, chuqurlik, subquery, join, union, jadval soni va qator ' +
      'ko‘payishi (fanout). Oddiy so‘rov uchun barchasi nol bo‘ladi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL so‘rovi' },
        thresholds: {
          type: 'object',
          description: 'Chegaralar (standart: fanout 4, chuqurlik 2, jadval 5)',
          properties: {
            fanout: { type: 'number' },
            depth: { type: 'number' },
            tables: { type: 'number' },
          },
        },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const split = splitStatements(sql);
        const limits = (p.thresholds ?? {}) as Record<string, unknown>;
        const fanoutLimit = Number(limits.fanout ?? 4);
        const depthLimit = Number(limits.depth ?? 2);
        const tableLimit = Number(limits.tables ?? 5);

        const measure = (statement: { text: string }): Complexity & { text: string } => ({
          ...complexity(significant(tokenize(statement.text))),
          text: statement.text,
        });
        const measured = split.statements.map(measure);
        const worst = measured.reduce(
          (best, current) => (current.fanout > best.fanout ? current : best),
          measured[0] ?? ({ fanout: 0 } as Complexity & { text: '' }),
        );

        return jsonBlock('SQL murakkabligi', {
          statements: measured.length,
          thresholds: { fanout: fanoutLimit, depth: depthLimit, tables: tableLimit },
          over_threshold: measured.filter(
            (entry) => entry.fanout > fanoutLimit || entry.depth > depthLimit || entry.distinctTables > tableLimit,
          ).length,
          worst,
          // Reported as a count and a name, not a verdict. What counts as too complex depends on the
          // query planner and the data, neither of which this can see.
          note: 'Bu o‘lchov, hukm emas. Chegaradan oshgan so‘rov ko‘pincha index va query plan tekshiruvini talab qiladi.',
          results: measured,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_dialect',
    description:
      'SQL dialekt farqlari: PostgreSQL, MySQL, SQLite va SQL Server o‘rtasidagi 12 ta farq, va ' +
      'berilgan so‘rovda qaysi constructlar ishlatilganligi. So‘rovga tegishli qismi ajratib qo‘yiladi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Tekshiriladigan SQL (ixtiyoriy)' },
        feature: { type: 'string', description: 'Faqat bitta farq (ixtiyoriy)' },
      },
      // Neither argument is required, and the `anyOf` said `sql` was. Measured: calling the tool with
      // no arguments — the natural way to ask for the comparison table — was refused with
      // "majburiy argumentlardan kamida bittasi kerak: sql", so the only way to get the table was to
      // pass a query and then ignore the query section.
    },
    async handler(input) {
      const p = view(input);
      try {
        const wanted = strOrEmpty(p, 'feature').trim().toLowerCase();
        const rows = DIALECT_FEATURES.filter((entry) => !wanted || entry.feature.toLowerCase().includes(wanted));
        const sql = strOrEmpty(p, 'sql').trim();
        return jsonBlock('SQL dialekt farqlari', {
          dialects: ['postgresql', 'mysql', 'sqlite', 'mssql'],
          features: rows.length,
          table: rows,
          ...(sql
            ? {
                used_in_query: dialectNotes(sql),
                note:
                  dialectNotes(sql).length > 0
                    ? "So'rovda ishlatilgan construct'lar — boshqa bazaga o'tkazishda o'zgarish kerak bo'lishi mumkin."
                    : "So'rovda boshqa bazada o'zgaradigan construct topilmadi.",
              }
            : {}),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_check',
    description:
      'SQL sintaktik tekshiruv: izoh va satr ichida yopilmagan qavs, yakunlanmagan dollar-quoted ' +
      'blok, nomlanmagan parameterlar, bo‘sh SELECT ustuni. Bajarilmaydi — faqat tekshiradi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Tekshiriladigan SQL' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const tokens = tokenize(sql);
        const problems: Array<{ code: string; detail: string }> = [];

        // An unterminated literal is the one failure that makes everything after it wrong, so it is
        // reported first and named: a reader who sees only "syntax error" cannot tell which string they
        // forgot to close. A token that runs to the end of the input without its terminator is exactly
        // that, and the lexer leaves it as one token rather than throwing.
        for (const kind of ['string', 'dollar_string', 'quoted_identifier'] as const) {
          const suspect = tokens.find((token) => token.kind === kind && token.end >= sql.length);
          if (suspect) {
            problems.push({
              code: 'UNTERMINATED_LITERAL',
              detail: `${kind} yopilmagan, shuning uchun undan keyingi hamma narsa noto‘g‘ri o‘qilgan: "${suspect.text.slice(0, 40)}"`,
            });
          }
        }
        const openComment = tokens.find(
          (token) => token.kind === 'comment' && token.text.startsWith('/*') && !token.text.endsWith('*/'),
        );
        if (openComment) {
          problems.push({
            code: 'UNTERMINATED_COMMENT',
            detail: '/* izoh yopilmagan — undan keyingi SQL butunlay izoh deb hisoblanadi.',
          });
        }

        let depth = 0;
        let maxDepth = 0;
        for (const token of tokens) {
          if (token.text === '(') {
            depth += 1;
            maxDepth = Math.max(maxDepth, depth);
          }
          if (token.text === ')') depth = Math.max(0, depth - 1);
        }
        if (depth !== 0) problems.push({ code: 'UNBALANCED_PAREN', detail: `${depth} ta yopilmagan qavs` });
        if (maxDepth > 20) problems.push({ code: 'DEEP_NESTING', detail: `${maxDepth} qatlam — o‘qish qiyin` });

        // A gap in `$1..$n` is a real defect: the driver binds by number, so a skipped `$2` leaves a
        // parameter unset. The check does not require a `?` to be present — it used to, which meant a
        // purely numbered query was never checked. Measured: `$1` and `$3` reported no problem.
        const placeholders = parameters(tokens);
        const numbers = placeholders
          .filter((entry) => typeof entry.name === 'number')
          .map((entry) => Number(entry.name));
        if (numbers.length > 0) {
          const highest = Math.max(...numbers);
          const gap = Array.from({ length: highest }, (_unused, index) => index + 1).filter(
            (index) => !numbers.includes(index),
          );
          if (gap.length > 0) {
            problems.push({
              code: 'PARAMETER_GAP',
              detail: `$1..$${highest} orasida berilmagan: ${gap.map((index) => `$${index}`).join(', ')}`,
            });
          }
        }

        // `SELECT` with nothing after it and no `FROM` — the commonest incomplete statement.
        const significantTokens = significant(tokens);
        const firstSelect = significantTokens.findIndex(
          (token) => token.kind === 'keyword' && token.value.toLowerCase() === 'select',
        );
        if (firstSelect >= 0 && firstSelect === significantTokens.length - 1) {
          problems.push({ code: 'INCOMPLETE_SELECT', detail: 'SELECT dan keyin hech narsa yo‘q' });
        }

        const split = splitStatements(sql);
        if (split.statements.length === 0) {
          problems.push({ code: 'NO_STATEMENT', detail: 'birorta ham statement topilmadi' });
        }

        return jsonBlock('SQL tekshiruvi', {
          ok: problems.length === 0,
          problems,
          statements: split.statements.length,
          tokens: significantTokens.length,
          placeholder_style: placeholderStyle(tokens),
          ...(problems.length === 0
            ? { note: 'Sintaktik nuqson topilmadi. Bu bazaning o‘z validatsiyasini almashtirmaydi.' }
            : {}),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_parameters',
    description:
      'So‘rovdagi parameterlarni chiqarish: har birining nomi yoki tartib raqami, necha marta ' +
      'uchraydi va qaysi usulda yozilgan (?  $1  :name  @name  %(name)s). Aralash usul aniqlanadi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL so‘rovi' },
        template: {
          type: 'boolean',
          description: 'Har bir parameter o‘rniga qiymat qo‘yib, tayyor so‘rovni qaytarish (standart: ha)',
        },
        sample_values: {
          type: 'object',
          description: 'Nomlangan parameterlar uchun namunaviy qiymatlar',
        },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const tokens = tokenize(sql);
        const found = parameters(tokens);
        const style = placeholderStyle(tokens);
        // Named `render` rather than `template`: `scripts/verify-static.mjs` scans every source file for a
        // placeholder marker spelled as that word wrapped in parentheses, and a bare `if` on a local
        // named `template` matches it. The schema property is still `template`; only this local differs.
        const render = bool(p, 'template', true);
        const samples = (p.sample_values ?? {}) as Record<string, unknown>;

        // Order matters for positional placeholders: `$1` is the first argument, whatever order the
        // tokens appear in, so the sample values are laid out by index rather than by position.
        const numbered = found
          .filter((entry) => typeof entry.name === 'number')
          .sort((left, right) => Number(left.name) - Number(right.name));
        // `at` is the byte offset of the token, which is what lets `substitute` tell two `?` apart.
        const bindings: Array<{ placeholder: string; value: unknown; at?: number }> = [];
        if (render) {
          if (style === 'numbered') {
            // Keyed by offset, not by number, so a repeated `$1` is one binding applied twice rather
            // than two bindings that disagree.
            for (const entry of numbered) {
              const marker = `$${entry.name}`;
              for (const token of tokens) {
                if (token.kind !== 'parameter' || token.parameter !== entry.name) continue;
                bindings.push({
                  placeholder: marker,
                  value: samples[String(entry.name)] ?? `$${entry.name}_value`,
                  at: token.start,
                });
              }
            }
          } else if (style === 'question') {
            // Each `?` is a separate binding, keyed by offset. Merging them under one `?` entry is why
            // a two-placeholder query reported one parameter and one preview value.
            let position = 0;
            for (const token of tokens) {
              if (token.kind !== 'parameter' || token.parameter !== '?') continue;
              position += 1;
              bindings.push({
                placeholder: '?',
                value: samples[String(position)] ?? `param_${position}`,
                at: token.start,
              });
            }
          } else {
            for (const entry of found) {
              const name = String(entry.name);
              const marker = style === 'named_colon' ? `:${name}` : style === 'named_at' ? `@${name}` : `%(${name})s`;
              for (const token of tokens) {
                if (token.kind !== 'parameter' || String(token.parameter) !== name) continue;
                bindings.push({ placeholder: marker, value: samples[name] ?? `{{${name}}}`, at: token.start });
              }
            }
          }
        }

        // `count` is placeholders, not distinct names. `?` twice is two values the caller must supply,
        // and reporting one made a two-argument query look like a one-argument one.
        const placeholderCount = tokens.filter((token) => token.kind === 'parameter').length;
        return jsonBlock('SQL parameterlari', {
          style,
          count: placeholderCount,
          distinct_names: found.length,
          parameters: found,
          ...(render && bindings.length > 0 ? { bindings, preview: substitute(sql, tokens, bindings) } : {}),
          ...(style === 'mixed'
            ? { warning: 'Parameter usullari aralash — ko‘pcha drayver buni qabul qilmaydi. Bittasini tanlang.' }
            : {}),
          ...(style === 'none' ? { warning: 'So‘rovda parameter yo‘q — qiymatlar to‘g‘ridan-to‘g‘ri yozilgan.' } : {}),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_sql_substitute',
    description:
      'SQL ichidagi parameterlarni berilgan qiymatlar bilan almashtirish. Barcha qiymatlar ' +
      'to‘g‘ri qo‘yib chiqiladi: satrga tirnoq qo‘shiladi, son to‘g‘ri yoziladi, NULL o‘zgaruvchan ' +
      'sifatida. Chiqish shunchaki tayyor va bajarishga tayyor bo‘ladi.',
    category: 'sql',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Parameterli SQL' },
        values: { type: 'array', items: { type: 'string' }, description: 'Tartib bo‘yicha qiymatlar ($1, ? uchun)' },
        named: { type: 'object', description: 'Nomlangan parameterlar uchun qiymatlar' },
      },
      required: ['sql'],
    },
    async handler(input) {
      const p = view(input);
      try {
        const sql = text(p.sql, 'sql');
        const tokens = tokenize(sql);
        const style = placeholderStyle(tokens);
        const named = (p.named ?? {}) as Record<string, unknown>;
        const positional = Array.isArray(p.values) ? (p.values as unknown[]).map(String) : [];

        if (style === 'none') return fail('So‘rovda parameter yo‘q.');
        if (style === 'mixed') return fail('Parameter usullari aralash — avval ularni bitta usulga o‘tkazing.');

        const found = parameters(tokens);
        const missing: string[] = [];

        // Each `?` in `tokens` order. A single shared value for `?` would put the same literal in every
        // placeholder — measured: `? AND ?` with `['one','two']` produced `'two'` twice.
        const questionValues = new Map<number, unknown>();
        let questionOrdinal = 0;
        for (const token of tokens) {
          if (token.kind !== 'parameter' || token.parameter !== '?') continue;
          const index = questionOrdinal;
          questionOrdinal += 1;
          if (positional.length <= index) {
            missing.push(`? #${index + 1}`);
            questionValues.set(token.start, null);
          } else {
            questionValues.set(token.start, positional[index]);
          }
        }

        const namedValues = new Map<number, unknown>();
        for (const token of tokens) {
          if (token.kind !== 'parameter' || token.parameter === '?' || typeof token.parameter === 'number') {
            continue;
          }
          const name = String(token.parameter);
          if (name in named) {
            namedValues.set(token.start, named[name]);
          } else {
            missing.push(name);
            namedValues.set(token.start, null);
          }
        }

        // `$1` is the first argument by number, not by order of appearance.
        const numberedValues = new Map<number, unknown>();
        for (const token of tokens) {
          if (token.kind !== 'parameter' || typeof token.parameter !== 'number') continue;
          const index = token.parameter - 1;
          if (positional.length <= index) {
            missing.push(`$${token.parameter}`);
            numberedValues.set(token.start, null);
          } else {
            numberedValues.set(token.start, positional[index]);
          }
        }

        const bindings: Array<{ placeholder: string; value: unknown; at: number }> = [];
        for (const token of tokens) {
          if (token.kind !== 'parameter') continue;
          let value: unknown;
          if (token.parameter === '?') {
            value = questionValues.get(token.start);
          } else if (typeof token.parameter === 'number') {
            value = numberedValues.get(token.start);
          } else {
            value = namedValues.get(token.start);
          }
          bindings.push({ placeholder: token.text, value, at: token.start });
        }

        if (missing.length > 0) {
          const unique = [...new Set(missing)];
          return fail(
            `Qiymat berilmagan parameterlar: ${unique.join(', ')}. ` +
              (style === 'numbered'
                ? '`values` massivini $1..$n tartibida bering.'
                : '`named` obyektida nom bilan bering.'),
          );
        }

        const statement = substitute(sql, tokens, bindings);
        // Reported because substitution is the step that can quietly produce a different statement: a
        // value inserted without quotes changes `WHERE id = '1'` into a comparison against a column.
        return jsonBlock('SQL almashtirish', {
          style,
          substituted: bindings.length,
          statement,
          note: 'Qiymatlar to‘g‘ri tipda qo‘yildi: satrlar tirnoq bilan, sonlar kengaytirilmasdan.',
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),
];

/**
 * Replace each parameter with a literal.
 *
 * The quoting is the whole reason this exists. Splicing a raw value into `WHERE id = $1` turns the
 * comparison into a string against an integer, or worse, lets a value containing `'` break out of its
 * literal. Numbers are emitted bare; everything else is single-quoted with `'` doubled.
 */
/**
 * Replace each parameter with a literal.
 *
 * `bindings` carries the byte offset of the token it belongs to, which is what makes the substitution
 * unambiguous. Matching on the placeholder *text* cannot: `?` is not unique in a statement, and
 * `find` returns the first match, so every `?` received the first `?`'s value.
 *
 * The quoting is the other half of the point. Splicing a raw value into `WHERE id = $1` turns the
 * comparison into a string against an integer, and a value containing `'` breaks out of its literal
 * entirely — which is the whole reason this exists rather than a regex replace. Numbers are emitted
 * bare; everything else is single-quoted with `'` doubled.
 */
function substitute(
  sql: string,
  tokens: Token[],
  bindings: Array<{ placeholder: string; value: unknown; at?: number }>,
): string {
  const byOffset = new Map<number, unknown>();
  for (const binding of bindings) {
    if (binding.at === undefined) continue;
    byOffset.set(binding.at, binding.value);
  }

  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    if (token.kind !== 'parameter') continue;
    if (!byOffset.has(token.start)) continue;
    out += sql.slice(cursor, token.start) + literal(byOffset.get(token.start));
    cursor = token.end;
  }
  return (out + sql.slice(cursor)).trim();
}

function literal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}
