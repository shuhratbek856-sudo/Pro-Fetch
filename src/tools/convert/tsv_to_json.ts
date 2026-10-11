import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function parseTsv(text: string, hasHeader: boolean): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let index = 0; index < text.length; index++) {
    const current = text[index];
    if (inQuotes && current === '"' && text[index + 1] === '"') {
      cell += '"';
      index++;
    } else if (current === '"') inQuotes = !inQuotes;
    else if (!inQuotes && current === '\t') {
      row.push(cell);
      cell = '';
    } else if (!inQuotes && (current === '\n' || current === '\r')) {
      if (current === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += current;
  }
  if (inQuotes) throw new Error('TSV format xatosi: yopilmagan quote.');
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const populated = rows.filter((values) => values.some((value) => value.length > 0));
  if (!populated.length) return [];
  const width = Math.max(...populated.map((values) => values.length));
  const sourceHeaders = hasHeader ? populated.shift()! : [];
  const duplicates = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, index) => {
    const name = (sourceHeaders[index] ?? '').trim() || `column_${index + 1}`;
    const count = (duplicates.get(name) ?? 0) + 1;
    duplicates.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });
  return populated.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

/**
 * pro_fetch_tsv_to_json — Convert TSV to a JSON array
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_tsv_to_json',
  description: 'Convert TSV to a JSON array',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "TSV manba URL'i" },
      text: { type: 'string', description: 'TSV manba matni' },
      content: { type: 'string', description: 'TSV manba matni' },
      data: { type: 'string', description: 'TSV manba matni' },
      has_header: { type: 'boolean', description: 'Birinchi qator ustun nomlari (default true)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = await readTextSource(input, 'TSV to JSON');
    return result(JSON.stringify(parseTsv(text.replace(/^\uFEFF/, ''), input.has_header !== false), null, 2));
  },
});
