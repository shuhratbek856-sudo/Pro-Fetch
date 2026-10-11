import { defineTool } from '../../core/tool.js';
import { allTools } from '../../core/tool.js';
import { listTools } from '../../router.js';
import { jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_category_stats — Report tool counts per category and per profile
 * Pack: admin (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_category_stats',
  description: 'Report tool counts per category and per profile',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const counts: Record<string, number> = {};
    for (const t of allTools()) counts[t.category] = (counts[t.category] ?? 0) + 1;
    return jsonBlock('# Category stats', {
      total: allTools().length,
      categories: counts,
      profiles: {
        smart: listTools('smart').length,
        minimal: listTools('minimal').length,
        standard: listTools('standard').length,
        full: listTools('full').length,
      },
    });
  },
});
