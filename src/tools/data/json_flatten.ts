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
    // A null-prototype object, not `{}`.
    //
    // Measured: a `__proto__` key whose value was a scalar disappeared from the output,
    // because assigning to `__proto__` with a non-object value is silently ignored. The same
    // key with an object value survived, because that path recursed instead of assigning.
    const out: Record<string, unknown> = Object.create(null);
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
