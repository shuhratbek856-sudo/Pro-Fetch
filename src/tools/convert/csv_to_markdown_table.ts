import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_csv_to_markdown_table — Convert CSV to a Markdown table
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_csv_to_markdown_table',
  description: 'Convert CSV to a Markdown table',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manba URL' },
      text: { type: 'string', description: 'Manba matni' },
      content: { type: 'string', description: 'Manba matni' },
      data: { type: 'string', description: 'Manba matni' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const csv = await readTextSource(input, 'CSV to Markdown');
    const rows = csv
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '')));
    if (!rows.length) return fail('CSV bo‘sh.');
    const header = rows[0];
    const body = rows.slice(1);
    const md =
      '| ' +
      header.join(' | ') +
      ' |\n| ' +
      header.map(() => '---').join(' | ') +
      ' |\n' +
      body.map((r) => '| ' + r.join(' | ') + ' |').join('\n');
    return result(md);
  },
});
