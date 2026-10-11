import { result, jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_json_diff — Deep-diff two JSON documents into added, removed, and changed paths
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_diff',
  description: 'Deep-diff two JSON documents into added, removed, and changed paths',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Birinchi JSON' },
      text2: { type: 'string', description: 'Ikkinchi JSON' },
    },
    required: ['text', 'text2'],
  },
  async handler(input) {
    const p = view(input);
    let a: any, b: any;
    try {
      a = JSON.parse(String(p.text ?? '{}'));
      b = JSON.parse(String(p.text2 ?? '{}'));
    } catch {
      return fail('Ikkala kirish ham yaroqli JSON bo‘lishi kerak.');
    }
    const flat = (o: any, pre = '', out: Record<string, string> = {}) => {
      for (const [k, v] of Object.entries(o ?? {})) {
        const key = pre ? pre + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
        else out[key] = JSON.stringify(v);
      }
      return out;
    };
    const fa = flat(a),
      fb = flat(b);
    const added: any[] = [],
      removed: any[] = [],
      changed: any[] = [];
    for (const k of Object.keys(fb)) if (!(k in fa)) added.push({ path: k, value: JSON.parse(fb[k]) });
    for (const k of Object.keys(fa)) if (!(k in fb)) removed.push({ path: k, value: JSON.parse(fa[k]) });
    for (const k of Object.keys(fa))
      if (k in fb && fa[k] !== fb[k]) changed.push({ path: k, from: JSON.parse(fa[k]), to: JSON.parse(fb[k]) });
    return jsonBlock('# JSON diff', { added, removed, changed });
  },
});
