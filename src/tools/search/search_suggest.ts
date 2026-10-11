import { getCredential } from '../../core/credentials.js';
import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_search_suggest — Get search autocomplete suggestions for a seed term
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_search_suggest',
  description: 'Get autocomplete suggestions via Serper (Google) with a Google Suggest fallback',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const key = getCredential('SERPER_API_KEY');
    if (key) {
      const response = await fetchWithOptions('https://google.serper.dev/autocomplete', {
        method: 'POST',
        headers: { 'x-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ q: query }),
        maxBytes: 500_000,
        cache: false,
      });
      if (response.status < 400) {
        const payload = JSON.parse(response.text) as { suggestions?: Array<{ value?: string }> };
        const results = (payload.suggestions ?? []).map((item) => item.value ?? '').filter(Boolean);
        if (results.length)
          return result(
            JSON.stringify({ provider: 'Serper Autocomplete', query, count: results.length, results }, null, 2),
          );
      }
    }
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('q', query);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 500_000,
      cache: false,
    });
    if (response.status >= 400) throw new Error('Google Suggest autocomplete HTTP ' + response.status);
    const payload = JSON.parse(response.text) as [string, string[]];
    const results = Array.isArray(payload?.[1])
      ? [...new Set(payload[1].filter((item) => typeof item === 'string' && item !== query))]
      : [];
    return result(JSON.stringify({ provider: 'Google Suggest', query, count: results.length, results }, null, 2));
  },
});
