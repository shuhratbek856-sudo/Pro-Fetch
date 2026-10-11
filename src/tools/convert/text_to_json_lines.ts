import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_text_to_json_lines — Convert plain text lines to JSON Lines (JSONL)
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_text_to_json_lines',
  description: 'Convert plain text lines to JSON Lines (JSONL)',
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
    const txt = await readTextSource(input, 'Text to JSONL');
    const lines = txt.split(/\r?\n/).filter((l) => l.length);
    return result(lines.map((l, i) => JSON.stringify({ index: i, line: l })).join('\n'));
  },
});
