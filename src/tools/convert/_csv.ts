/**
 * A CSV/TSV parser, shared by every tool that reads delimited text.
 *
 * ## Why one parser
 *
 * The interesting part of CSV is not the commas. It is `"a,b"` — one field with a comma in it — and
 * `"line1\nline2"` — one field with a newline in it. Splitting on `,` and on `\n` turns those into
 * three fields and two records, and the damage is silent: the output looks like data.
 *
 * Measured: `pro_fetch_csv_stats` and `pro_fetch_csv_to_markdown_table` both did that, while
 * `pro_fetch_csv_to_json` in the same directory had a correct state-machine parser. So the same
 * question had two different answers in one repository, and the wrong ones lost fields.
 *
 * ## The rules it implements
 *
 * - A field may be quoted with `"`; inside it, `""` is a literal quote.
 * - A quoted field may contain the delimiter, a newline, or a carriage return.
 * - A quote in the middle of an unquoted field is an error, not a shrug.
 * - An unterminated quote is an error, not a field that runs to the end of the input.
 * - `\r\n` and a bare `\n` both end a record.
 * - A trailing newline does not produce an empty final record.
 */

export interface CsvParseOptions {
  /** The field separator. A tab for TSV. */
  delimiter?: string;
  /** Whether the first record is a header row. */
  hasHeader?: boolean;
  /** Strip a UTF-8 byte order mark from the start. */
  stripBom?: boolean;
}

/**
 * Parse delimited text into rows of raw fields.
 *
 * Every record has the same width: the widest record defines it, and shorter records are padded
 * with empty strings. A ragged CSV is a real thing — a trailing empty line, a row with a missing
 * column — and padding it is better than letting a later `row[3]` read `undefined`.
 */
export function parseCsvRows(text: string, options: CsvParseOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let index = 0;
  const source = options.stripBom === false ? text : text.replace(/^﻿/, '');

  while (index < source.length) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 2;
        continue;
      }
      if (character === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }
    if (character === '"') {
      if (field.length) throw new Error('CSV format xatosi: quote field o‘rtasida keldi.');
      quoted = true;
      index += 1;
      continue;
    }
    if (character === delimiter) {
      row.push(field);
      field = '';
      index += 1;
      continue;
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      index += 1;
      continue;
    }
    field += character;
    index += 1;
  }

  if (quoted) throw new Error('CSV format xatosi: yopilmagan quote.');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((values) => values.some((value) => value.length > 0));
  if (!nonEmpty.length) return [];
  const width = nonEmpty.reduce((widest, values) => Math.max(widest, values.length), 0);
  return nonEmpty.map((values) => {
    const padded = values.slice();
    while (padded.length < width) padded.push('');
    return padded;
  });
}

/**
 * Parse delimited text into objects keyed by header.
 *
 * A duplicate header is suffixed rather than dropped: two columns called `name` are two columns,
 * and silently keeping only the second loses a value without saying so.
 */
export function parseCsvObjects(text: string, options: CsvParseOptions = {}): Array<Record<string, string>> {
  const hasHeader = options.hasHeader !== false;
  const rows = parseCsvRows(text, options);
  if (!rows.length) return [];
  const width = rows.reduce((widest, values) => Math.max(widest, values.length), 0);
  const sourceHeaders = hasHeader ? rows.shift()! : [];
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (let index = 0; index < width; index += 1) {
    const base = (sourceHeaders[index] ?? '').trim() || `column_${index + 1}`;
    const duplicate = (seen.get(base) ?? 0) + 1;
    seen.set(base, duplicate);
    headers.push(duplicate === 1 ? base : `${base}_${duplicate}`);
  }
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}
