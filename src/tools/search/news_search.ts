import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { parseUpstreamJson } from '../../core/json-response.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_news_search — Search recent news articles by topic and date
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_news_search',
  description: 'Search indexed news articles through the GDELT DOC API',
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
    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    for (const [key, value] of Object.entries({
      query,
      mode: 'ArtList',
      format: 'json',
      maxrecords: String(limit),
      sort: 'HybridRel',
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('GDELT news API HTTP ' + response.status);

    // GDELT answers throttling and overload with a 200 and a non-JSON body ("OK", an HTML page, an
    // empty document). The shared helper names the provider and the body preview instead of
    // surfacing `Unexpected token 'O'`, which told the caller nothing. Observed live.
    const payload = parseUpstreamJson<{
      articles?: Array<{
        title?: string;
        url?: string;
        domain?: string;
        seendate?: string;
        language?: string;
        sourceCountry?: string;
      }>;
    }>(response, 'GDELT news API');
    const results = (payload.articles ?? []).map((article) => ({
      title: article.title ?? '',
      url: article.url ?? '',
      domain: article.domain ?? '',
      seenAt: article.seendate ?? '',
      language: article.language ?? '',
      sourceCountry: article.sourceCountry ?? '',
    }));
    return result(JSON.stringify({ provider: 'GDELT DOC API', query, count: results.length, results }, null, 2));
  },
});
