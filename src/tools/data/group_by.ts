import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_group_by — Group JSON rows by a key with counts
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_group_by',
  description: 'Group JSON rows by a key with counts',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      rows: { type: 'array', description: 'JSON qatorlar' },
      key: { type: 'string', description: 'Guruh kaliti' },
    },
    required: ['rows', 'key'],
  },
  async handler(input) {
    const p = view(input);
    const rows: any[] = Array.isArray(p.rows) ? p.rows : [];
    // A null-prototype object, not `{}`.
    //
    // Measured: a row whose key was `__proto__` vanished from the result entirely, and a row
    // whose key was `toString` produced the *source text of the inherited function*
    // concatenated with the count. `groups['__proto__']` is `Object.prototype`, not
    // `undefined`, so the `?? 0` never applied; and assigning a non-object to `__proto__` is
    // silently ignored.
    const groups: Record<string, number> = Object.create(null);
    for (const r of rows) {
      const k = String(r?.[String(p.key)] ?? '(boshqa)');
      groups[k] = (groups[k] ?? 0) + 1;
    }
    return jsonBlock('# Guruhlash: ' + p.key, groups);
  },
});
