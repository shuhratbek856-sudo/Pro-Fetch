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
    const raw = Array.isArray(p.items) ? p.items : [];
    // Say so rather than returning an empty string. A caller cannot otherwise tell "nothing was
    // merged" from "everything merged was blank", and will read the blank result as success.
    if (raw.length === 0) return fail('items bo‘sh — birlashtiriladigan matnlar ro‘yxati kerak.');
    const items = raw.map(String);
    const merged = items.map((text, index) => '## Natija ' + (index + 1) + '\n\n' + text).join('\n\n---\n\n');
    const blank = items.filter((text) => !text.trim()).length;
    const footer = blank > 0 ? `\n\n---\n\n${blank} ta element bo‘sh.` : '';
    return result(merged + footer);
  },
});
