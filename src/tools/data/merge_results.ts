import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_merge_results — Merge multiple text results into one
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_merge_results',
  description: 'Merge multiple text results into one',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', description: "Matnlar ro'yxati" },
    },
    required: ['items'],
  },
  async handler(input) {
    const p = view(input);
    const items = (Array.isArray(p.items) ? p.items : []).map(String);
    return result(items.map((t: string, i: number) => '## Natija ' + (i + 1) + '\n\n' + t).join('\n\n---\n\n'));
  },
});
