import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_market_search — Search products pricing and marketplaces
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_market_search',
  description: 'Search Google Shopping products through SerpApi',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
      limit: { type: 'number', description: 'Natijalar soni (1-25)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) throw new Error('Shopping search учун SERPAPI_API_KEY sozlang.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const url = new URL('https://serpapi.com/search.json');
    for (const [key, value] of Object.entries({
      engine: 'google_shopping',
      q: query,
      num: String(limit),
      api_key: apiKey,
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('Google Shopping provider HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      shopping_results?: Array<{ title?: string; price?: string; source?: string; link?: string; product_id?: string }>;
    };
    const results = (payload.shopping_results ?? []).slice(0, limit).map((item) => ({
      title: item.title ?? '',
      price: item.price ?? '',
      merchant: item.source ?? '',
      url: item.link ?? '',
      productId: item.product_id ?? '',
    }));
    return result(
      JSON.stringify({ provider: 'SerpApi Google Shopping', query, count: results.length, results }, null, 2),
    );
  },
});
