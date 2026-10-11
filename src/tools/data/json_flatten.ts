import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_json_flatten — Flatten nested JSON to a flat table
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_json_flatten',
  description: 'Flatten nested JSON to a flat table',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: { type: 'string', description: 'Ikkinchi matn (diff uchun)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    let obj: any;
    try {
      obj = JSON.parse(String(p.text ?? '{}'));
    } catch {
      return fail('Yaroqsiz JSON');
    }
    const out: Record<string, unknown> = {};
    function walk(o: any, prefix: string): void {
      for (const [k, v] of Object.entries(o ?? {})) {
        const key = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, key);
        else out[key] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }
    walk(obj, '');
    return jsonBlock('# Flatten JSON', out);
  },
});
