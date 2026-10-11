import { jsonBlock } from '../../core/format.js';
import { randomUUID } from 'node:crypto';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_uuid_generate — Generate RFC-4122 version 4 UUIDs
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_uuid_generate',
  description: 'Generate RFC-4122 version 4 UUIDs',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: { count: { type: 'number', description: 'Nechta UUID (1-100)' } },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const n = Math.max(1, Math.min(100, Number(p.count ?? 1)));
    return jsonBlock('# UUID', { count: n, uuids: Array.from({ length: n }, () => randomUUID()) });
  },
});
