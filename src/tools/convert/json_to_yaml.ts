import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { stringify } from 'yaml';
import { view } from '../../core/input.js';

/**
 * pro_fetch_json_to_yaml — Convert JSON to YAML
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_to_yaml',
  description: 'Convert JSON to YAML',
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
    const raw = await readTextSource(input, 'JSON to YAML');
    let obj: unknown;
    try {
      obj = JSON.parse(raw);
    } catch {
      return fail('Yaroqli JSON bo‘lishi kerak.');
    }
    return result(stringify(obj));
  },
});
