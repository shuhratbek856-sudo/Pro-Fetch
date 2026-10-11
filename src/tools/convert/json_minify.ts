import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_json_minify — Minify JSON by removing whitespace
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_minify',
  description: 'Minify JSON by removing whitespace',
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
    const raw = await readTextSource(input, 'JSON minify');
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return fail('Yaroqli JSON bo‘lishi kerak.');
    }
    return result(JSON.stringify(obj));
  },
});
