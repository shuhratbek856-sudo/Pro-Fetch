import { defineTool } from '../../core/tool.js';
import { allTools } from '../../core/tool.js';
import { jsonBlock, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_tool_schema — Return the full input schema of a named tool
 * Pack: admin (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_tool_schema',
  description: 'Return the full input schema of a named tool',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Tool nomi (pro_fetch_ prefiksi ixtiyoriy)' } },
    required: ['name'],
  },
  async handler(input) {
    const p = view(input);
    const want = String(p.name ?? '').trim();
    const t = allTools().find((x) => x.name === want || x.name === 'pro_fetch_' + want || x.name === 'pro_' + want);
    if (!t) return fail('Tool topilmadi: ' + want);
    return jsonBlock('# Schema: ' + t.name, {
      category: t.category,
      description: t.description,
      inputSchema: t.inputSchema,
    });
  },
});
