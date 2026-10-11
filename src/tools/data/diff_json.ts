import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_diff_json — Diff two JSON documents with path output
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_diff_json',
  description: 'Diff two JSON documents with path output',
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
    try {
      const a = JSON.parse(String(p.text ?? '{}'));
      const b = JSON.parse(String(p.text2 ?? p.other ?? '{}'));
      const flat = (o: any, pre = ''): Record<string, unknown> => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o ?? {})) {
          const key = pre ? pre + '.' + k : k;
          if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flat(v, key));
          else out[key] = JSON.stringify(v);
        }
        return out;
      };
      const fa = flat(a);
      const fb = flat(b);
      const added = Object.keys(fb).filter((k) => !(k in fa));
      const removed = Object.keys(fa).filter((k) => !(k in fb));
      const changed = Object.keys(fb).filter((k) => k in fa && fa[k] !== fb[k]);
      return jsonBlock('# JSON diff', {
        added,
        removed,
        changed: changed.map((k) => k + ': ' + fa[k] + ' → ' + fb[k]),
      });
    } catch {
      return fail('JSON parse xatosi');
    }
  },
});
