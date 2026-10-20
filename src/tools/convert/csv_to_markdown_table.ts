import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { parseCsvRows } from './_csv.js';
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
    // A shared parser, not a split. Measured: `"a,b"` became three cells and a quoted field
    // containing a newline became two table rows, because the text was split on `,` and on `\n`.
    // `pro_fetch_csv_to_json` in the same directory already had the right parser; the same question
    // now has one answer.
    const rows = parseCsvRows(csv);
    if (!rows.length) return fail('CSV bo‘sh.');
    const header = rows[0]!;
    const body = rows.slice(1);
    // A pipe inside a cell ends the cell in a Markdown table, so it is escaped. Measured: `has|pipe`
    // produced a row that no longer had the shape of a table row.
    //
    // A newline inside a cell ends the row the same way, and no amount of escaping fixes that —
    // Markdown has no way to carry a literal newline in a table cell. It becomes a line break, so the
    // value is still readable and the table still has one row per record.
    const cell = (value: string): string => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    const md =
      '| ' +
      header.map(cell).join(' | ') +
      ' |\n| ' +
      header.map(() => '---').join(' | ') +
      ' |\n' +
      body.map((r) => '| ' + r.map(cell).join(' | ') + ' |').join('\n');
    return result(md);
  },
});
