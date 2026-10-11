import { defineTool } from '../../core/tool.js';
import { searchWeb } from '../../core/search-providers.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_site_search — Search within a specific site using the site operator
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_site_search',
  description: 'Search a host or domain with the web search site operator',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Qidiruv so'rovi" },
      site: { type: 'string', description: 'Qidiruv cheklanadigan host yoki domen' },
      limit: { type: 'number', description: 'Natijalar soni (1-25)' },
    },
    required: ['query', 'site'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    const site =
      typeof input.site === 'string'
        ? input.site
            .trim()
            .replace(/^https?:\/\//i, '')
            .replace(/\/$/, '')
        : '';
    if (!query || !site) throw new Error('query va site parametrlari kerak.');
    if (!/^[a-z0-9.-]+(?::\d+)?$/i.test(site)) throw new Error('site host yoki domain bo‘lishi kerak.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const searchQuery = `site:${site} ${query}`;
    const searched = await searchWeb(searchQuery, limit);
    return result(
      JSON.stringify(
        { provider: searched.provider, query, site, count: searched.results.length, results: searched.results },
        null,
        2,
      ),
    );
  },
});
