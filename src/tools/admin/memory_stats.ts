import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_memory_stats — Report process memory usage and runtime uptime
 * Pack: admin (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_memory_stats',
  description: 'Report process memory usage and runtime uptime',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const m = process.memoryUsage();
    return jsonBlock('# Memory stats', {
      uptime_sec: Math.round(process.uptime()),
      rss_mb: Math.round(m.rss / 1048576),
      heap_used_mb: Math.round(m.heapUsed / 1048576),
      heap_total_mb: Math.round(m.heapTotal / 1048576),
      external_mb: Math.round(m.external / 1048576),
    });
  },
});
