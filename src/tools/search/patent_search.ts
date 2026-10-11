import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_patent_search — Search patents by keyword or number
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_patent_search',
  description: 'Search patent records through Google Patents',
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
    const url = new URL('https://patents.google.com/xhr/query');
    url.searchParams.set('url', 'q=' + query);
    url.searchParams.set('exp', '');
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('Google Patents HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      results?: {
        cluster?: Array<{
          result?: Array<{
            patent?: {
              title?: string;
              number?: string;
              filingDate?: string;
              priorityDate?: string;
              assignee?: string;
              snippet?: string;
            };
          }>;
        }>;
      };
    };
    const results = (payload.results?.cluster ?? [])
      .flatMap((cluster) => cluster.result ?? [])
      .map((entry) => entry.patent)
      .filter((patent): patent is NonNullable<typeof patent> => Boolean(patent))
      .slice(0, limit)
      .map((patent) => ({ ...patent, url: patent.number ? 'https://patents.google.com/patent/' + patent.number : '' }));
    return result(JSON.stringify({ provider: 'Google Patents', query, count: results.length, results }, null, 2));
  },
});
