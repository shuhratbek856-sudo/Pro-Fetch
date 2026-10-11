import { defineTool } from '../../core/tool.js';
import { allTools } from '../../core/tool.js';
import { listTools } from '../../router.js';
import { jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_registry_summary — Summarize the tool registry: totals, categories and profile sizes
 * Pack: admin (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_registry_summary',
  description: 'Summarize the tool registry: totals, categories and profile sizes',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const cats = new Set(allTools().map((t) => t.category));
    return jsonBlock('# Registry summary', {
      total: allTools().length,
      category_count: cats.size,
      categories: [...cats].sort(),
      smart: listTools('smart').length,
      minimal: listTools('minimal').length,
      standard: listTools('standard').length,
      full: listTools('full').length,
    });
  },
});
