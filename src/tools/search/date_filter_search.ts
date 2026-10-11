import { defineTool } from '../../core/tool.js';
import { searchWeb } from '../../core/search-providers.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_date_filter_search — Web search restricted to a date range
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_date_filter_search',
  description: 'Search web results within an ISO date range',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
      after: { type: 'string', description: 'Boshlanish sanasi, YYYY-MM-DD' },
      before: { type: 'string', description: 'Tugash sanasi, YYYY-MM-DD' },
      from: { type: 'string', description: 'Boshlanish sanasining aliasi, YYYY-MM-DD' },
      to: { type: 'string', description: 'Tugash sanasining aliasi, YYYY-MM-DD' },
      limit: { type: 'number', description: 'Natijalar soni (1-25)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const after =
      typeof input.after === 'string' ? input.after.trim() : typeof input.from === 'string' ? input.from.trim() : '';
    const before =
      typeof input.before === 'string' ? input.before.trim() : typeof input.to === 'string' ? input.to.trim() : '';
    const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    if ((after && !isDate(after)) || (before && !isDate(before)))
      throw new Error('after/before ISO sana YYYY-MM-DD bo‘lishi kerak.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    let searchQuery = query + (after ? ' after:' + after : '') + (before ? ' before:' + before : '');
    const searched = await searchWeb(searchQuery, limit);
    return result(
      JSON.stringify(
        {
          provider: searched.provider,
          query,
          dateRange: { after: after || null, before: before || null },
          count: searched.results.length,
          results: searched.results,
        },
        null,
        2,
      ),
    );
  },
});
