import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { rankAndDedupeSearchResults } from '../../core/search-ranking.js';
import { searchWeb } from '../../core/search-providers.js';

/**
 * pro_fetch_web_search — Multi-engine web search with ranked results
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_web_search',
  description: 'Search the web using Brave Search or DuckDuckGo',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Web qidiruv so'rovi" },
      limit: { type: 'number', description: 'Natijalar soni (1-25)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const searched = await searchWeb(query, limit);
    const results = searched.results;
    const provider = searched.provider;
    const ranked = rankAndDedupeSearchResults(query, results, limit);
    return result(
      JSON.stringify(
        {
          provider,
          query,
          count: ranked.length,
          deduplicated: results.length - ranked.length,
          failedProviders: searched.failedProviders,
          results: ranked,
        },
        null,
        2,
      ),
    );
  },
});
