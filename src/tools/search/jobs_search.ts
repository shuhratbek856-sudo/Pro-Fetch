import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { USER_AGENT } from '../../core/version.js';

/**
 * pro_fetch_jobs_search — Search job postings by role and location
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_jobs_search',
  description: 'Search remote job listings through the Remote OK API',
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
    const url = new URL('https://remoteok.com/api');
    url.searchParams.set('tag', query);
    url.searchParams.set('limit', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json', 'user-agent': `${USER_AGENT} (+https://remoteok.com)` },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('Remote OK jobs API HTTP ' + response.status);
    const payload = JSON.parse(response.text) as Array<{
      id?: string;
      position?: string;
      company?: string;
      location?: string;
      url?: string;
      date?: string;
      tags?: string[];
    }>;
    const results = payload
      .filter((item) => item.position)
      .slice(0, limit)
      .map((item) => ({
        id: item.id ?? '',
        title: item.position ?? '',
        company: item.company ?? '',
        location: item.location ?? '',
        url: item.url ?? '',
        postedAt: item.date ?? '',
        tags: item.tags ?? [],
      }));
    return result(JSON.stringify({ provider: 'Remote OK', query, count: results.length, results }, null, 2));
  },
});
