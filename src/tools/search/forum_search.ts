import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { htmlToText } from '../../core/parser.js';

/**
 * pro_fetch_forum_search — Search Stack Overflow questions through the Stack Exchange API
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_forum_search',
  description: 'Search Stack Overflow questions through the Stack Exchange API',
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
    const url = new URL('https://api.stackexchange.com/2.3/search/advanced');
    for (const [key, value] of Object.entries({
      site: 'stackoverflow',
      order: 'desc',
      sort: 'relevance',
      q: query,
      pagesize: String(limit),
      filter: 'withbody',
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Stack Exchange API HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      items?: Array<{
        title?: string;
        link?: string;
        score?: number;
        answer_count?: number;
        is_answered?: boolean;
        body?: string;
      }>;
    };
    const results = (payload.items ?? []).map((item) => ({
      title: htmlToText(item.title ?? ''),
      url: item.link ?? '',
      score: item.score ?? 0,
      answerCount: item.answer_count ?? 0,
      answered: Boolean(item.is_answered),
      excerpt: htmlToText(item.body ?? '').slice(0, 1000),
    }));
    return result(JSON.stringify({ provider: 'Stack Exchange', query, count: results.length, results }, null, 2));
  },
});
