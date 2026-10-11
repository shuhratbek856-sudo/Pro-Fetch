import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function csvValue(value: unknown): string {
  const text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * pro_fetch_json_to_csv — Convert a JSON array to CSV
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_to_csv',
  description: 'Convert a JSON array to CSV',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "JSON manba URL'i" },
      text: { type: 'string', description: 'JSON array manba matni' },
      content: { type: 'string', description: 'JSON array manba matni' },
      data: { type: 'string', description: 'JSON array manba matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = await readTextSource(input, 'JSON to CSV');
    let rows: unknown;
    try {
      rows = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (error) {
      throw new Error('JSON parse xatosi: ' + (error instanceof Error ? error.message : String(error)));
    }
    if (!Array.isArray(rows) || rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error('JSON ildizi objectlardan iborat array bo‘lishi kerak.');
    }
    const records = rows as Array<Record<string, unknown>>;
    const columns = [...new Set(records.flatMap((row) => Object.keys(row)))];
    if (!columns.length) return result('');
    const output = [
      columns.map(csvValue).join(','),
      ...records.map((row) => columns.map((column) => csvValue(row[column])).join(',')),
    ].join('\n');
    return result(output);
  },
});
