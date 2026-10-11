import { result } from '../../core/format.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_watch_list — List stored monitoring snapshots and their status
 * Pack: monitoring (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
export default defineTool({
  name: 'pro_fetch_watch_list',
  description: 'List all active watches and their status',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'number', description: 'Ko‘rsatiladigan monitoring yozuvlari soni (1-100)' },
    },
  },
  async handler(input) {
    const limitValue = Number(input.limit ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
    const keys = cache.keys('monitor:');
    const watches = keys
      .slice(0, limit)
      .map((key) => {
        const entry = cache.get(key);
        if (!entry) return undefined;
        return {
          type: key.split(':')[1] ?? 'unknown',
          id: key.split(':').at(-1) ?? '',
          url: typeof entry.meta?.url === 'string' ? entry.meta.url : undefined,
          status: typeof entry.meta?.status === 'number' ? entry.meta.status : undefined,
          changedAt: new Date(entry.createdAt).toISOString(),
          current: entry.value.slice(0, 500),
        };
      })
      .filter((entry) => entry !== undefined);
    return result(
      JSON.stringify(
        { count: keys.length, returned: watches.length, truncated: keys.length > limit, watches },
        null,
        2,
      ),
    );
  },
});
