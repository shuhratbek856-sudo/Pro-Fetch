import { defineTool } from '../../core/tool.js';
import { allTools } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_tool_search — Search the tool registry by name or description keyword
 * Pack: admin (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_tool_search',
  description: 'Search the tool registry by name or description keyword',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Qidiruv so‘zi' },
      limit: { type: 'number', description: 'Maksimal natija' },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const q = String(p.query ?? '').toLowerCase();
    const hits = allTools()
      .filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q))
      .slice(0, Math.max(1, Math.min(200, Number(p.limit ?? 50))));
    return jsonBlock('# Tool search: ' + q, {
      count: hits.length,
      tools: hits.map((t) => ({ name: t.name, category: t.category, description: t.description })),
    });
  },
});
