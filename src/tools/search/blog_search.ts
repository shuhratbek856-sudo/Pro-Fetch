import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_blog_search — Search DEV Community articles by tag
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_blog_search',
  description: 'Search DEV Community articles by tag',
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
    const url = new URL('https://dev.to/api/articles');
    url.searchParams.set('tag', query.replace(/^#/, '').replace(/\s+/g, ','));
    url.searchParams.set('per_page', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('DEV Community API HTTP ' + response.status);
    const articles = parseUpstreamJson(response, 'pro_fetch_blog_search') as Array<{
      title?: string;
      url?: string;
      description?: string;
      published_at?: string;
      tag_list?: string[];
      user?: { name?: string; username?: string };
    }>;
    const results = articles.map((item) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      description: item.description ?? '',
      publishedAt: item.published_at ?? '',
      tags: item.tag_list ?? [],
      author: item.user?.name ?? item.user?.username ?? '',
    }));
    return result(JSON.stringify({ provider: 'DEV Community', query, count: results.length, results }, null, 2));
  },
});
