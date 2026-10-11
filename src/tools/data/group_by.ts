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
    const groups: Record<string, number> = {};
    for (const r of rows) {
      const k = String(r?.[String(p.key)] ?? '(boshqa)');
      groups[k] = (groups[k] ?? 0) + 1;
    }
    return jsonBlock('# Guruhlash: ' + p.key, groups);
  },
});
