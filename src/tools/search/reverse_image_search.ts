import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_reverse_image_search — Find pages using a similar image
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_reverse_image_search',
  description: 'Find visually similar pages using SerpApi Google Reverse Image',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      image_url: { type: 'string', description: 'Ommaviy rasm URL manzili' },
      limit: { type: 'number', description: 'Natijalar soni (1-25)' },
    },
    required: ['image_url'],
  },
  async handler(input) {
    const imageUrl = typeof input.image_url === 'string' ? input.image_url.trim() : '';
    if (!imageUrl) throw new Error('image_url parametri kerak.');
    const apiKey = process.env.SERPAPI_API_KEY;
    if (!apiKey) throw new Error('Reverse image search uchun SERPAPI_API_KEY sozlang.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const url = new URL('https://serpapi.com/search.json');
    for (const [key, value] of Object.entries({ engine: 'google_reverse_image', image_url: imageUrl, api_key: apiKey }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('Reverse image provider HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      visual_matches?: Array<{ title?: string; link?: string; source?: string; thumbnail?: string }>;
    };
    const results = (payload.visual_matches ?? []).slice(0, limit).map((item) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      source: item.source ?? '',
      thumbnail: item.thumbnail ?? '',
    }));
    return result(
      JSON.stringify({ provider: 'SerpApi Google Reverse Image', imageUrl, count: results.length, results }, null, 2),
    );
  },
});
