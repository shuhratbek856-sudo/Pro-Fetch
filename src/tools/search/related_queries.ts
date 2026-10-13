import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_related_queries — Get related search queries for a term
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_related_queries',
  description: 'Get related query suggestions from Google Suggest',
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
    const url = new URL('https://suggestqueries.google.com/complete/search');
    url.searchParams.set('client', 'firefox');
    url.searchParams.set('q', query);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 500_000,
    });
    if (response.status >= 400) throw new Error('Google related-query API HTTP ' + response.status);
    const payload = parseUpstreamJson(response, 'pro_fetch_related_queries') as [string, string[]];
    const results = Array.isArray(payload?.[1])
      ? [...new Set(payload[1].filter((item) => typeof item === 'string' && item !== query))]
      : [];
    return result(JSON.stringify({ provider: 'Google Suggest', query, count: results.length, results }, null, 2));
  },
});
