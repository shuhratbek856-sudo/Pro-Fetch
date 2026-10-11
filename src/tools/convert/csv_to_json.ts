import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function parseCsv(text: string, delimiter: string, hasHeader: boolean): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') {
      if (field.length) throw new Error('CSV format xatosi: quote field o‘rtasida keldi.');
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('CSV format xatosi: yopilmagan quote.');
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmptyRows = rows.filter((values) => values.some((value) => value.length > 0));
  if (!nonEmptyRows.length) return [];
  const width = Math.max(...nonEmptyRows.map((values) => values.length));
  const sourceHeaders = hasHeader ? nonEmptyRows.shift()! : [];
  const headers: string[] = [];
  const seen = new Map<string, number>();
  for (let index = 0; index < width; index++) {
    const base = (sourceHeaders[index] ?? '').trim() || `column_${index + 1}`;
    const duplicate = (seen.get(base) ?? 0) + 1;
    seen.set(base, duplicate);
    headers.push(duplicate === 1 ? base : `${base}_${duplicate}`);
  }
  return nonEmptyRows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])),
  );
}

/**
 * pro_fetch_csv_to_json — Convert CSV to a JSON array
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_csv_to_json',
  description: 'Convert CSV to a JSON array',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "CSV faylining manzil URL'i" },
      text: { type: 'string', description: 'CSV manba matni' },
      content: { type: 'string', description: 'CSV manba matni' },
      data: { type: 'string', description: 'CSV manba matni' },
      delimiter: { type: 'string', description: 'Ustun ajratgichi (default comma)', minLength: 1, maxLength: 1 },
      has_header: { type: 'boolean', description: 'Birinchi qator ustun nomlari ekanligi (default true)' },
    },
  },
  async handler(input) {
    const delimiter = typeof input.delimiter === 'string' && input.delimiter.length === 1 ? input.delimiter : ',';
    if (input.delimiter !== undefined && (typeof input.delimiter !== 'string' || input.delimiter.length !== 1))
      throw new Error('delimiter bitta belgidan iborat bo‘lishi kerak.');
    const text = await readTextSource(input, 'CSV to JSON');
    return result(
      JSON.stringify(parseCsv(text.replace(/^\uFEFF/, ''), delimiter, input.has_header !== false), null, 2),
    );
  },
});
