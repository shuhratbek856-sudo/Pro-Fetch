import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';
import { parseCsvObjects } from './_csv.js';

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
    return result(JSON.stringify(parseCsvObjects(text, { delimiter, hasHeader: input.has_header !== false }), null, 2));
  },
});
