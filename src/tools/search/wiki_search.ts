import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { htmlToText } from '../../core/parser.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_wiki_search — Search Wikipedia and wiki knowledge bases
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_wiki_search',
  description: 'Search English Wikipedia articles',
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
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const url = new URL('https://en.wikipedia.org/w/api.php');
    for (const [key, value] of Object.entries({
      action: 'query',
      list: 'search',
      format: 'json',
      origin: '*',
      srlimit: String(limit),
      srsearch: query,
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Wikipedia API HTTP ' + response.status);
    const payload = parseUpstreamJson(response, 'pro_fetch_wiki_search') as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    const results = (payload.query?.search ?? []).map((item) => ({
      title: item.title ?? '',
      url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent((item.title ?? '').replace(/ /g, '_')),
      snippet: htmlToText(item.snippet ?? ''),
    }));
    return result(JSON.stringify({ provider: 'Wikipedia', query, count: results.length, results }, null, 2));
  },
});
