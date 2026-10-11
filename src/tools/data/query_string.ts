import { result, jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_query_string — Parse a URL query string to JSON or build one from JSON
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_query_string',
  description: 'Parse a URL query string to JSON or build one from JSON',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Query string yoki JSON' },
      action: { type: 'string', description: 'parse|build' },
    },
    required: ['text', 'action'],
  },
  async handler(input) {
    const p = view(input);
    const a = String(p.action || 'parse').toLowerCase();
    if (a === 'parse') {
      const sp = new URLSearchParams(String(p.text ?? ''));
      return jsonBlock('# Query params', Object.fromEntries(sp.entries()));
    }
    if (a === 'build') {
      let obj: any;
      try {
        obj = JSON.parse(String(p.text ?? '{}'));
      } catch {
        return fail('build uchun JSON object kerak.');
      }
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(obj)) sp.set(k, String(v));
      return result(sp.toString());
    }
    return fail('action parse|build.');
  },
});
