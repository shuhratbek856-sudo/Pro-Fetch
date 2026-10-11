import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_cached_search — Search locally cached fetch content
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_cached_search',
  description: 'Search locally cached fetch content',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
      limit: { type: 'number', description: 'Natijalar soni (1-50)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(50, Math.floor(limitValue))) : 10;
    const matches = cache
      .search(query)
      .slice(0, limit)
      .map((item) => ({ key: item.key, excerpt: item.value.slice(0, 2000) }));
    return result(JSON.stringify({ provider: 'local cache', query, count: matches.length, results: matches }, null, 2));
  },
});
