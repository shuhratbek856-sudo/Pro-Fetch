import { getCredential } from '../../core/credentials.js';
import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_code_search — Search GitHub code (requires GITHUB_TOKEN)
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_code_search',
  description: 'Search GitHub code (requires GITHUB_TOKEN)',
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
    const token = getCredential('GITHUB_TOKEN');
    if (!token)
      throw new Error('Code search uchun GITHUB_TOKEN sozlang; GitHub code search autentifikatsiya talab qiladi.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(25, Math.floor(limitValue))) : 10;
    const url = new URL('https://api.github.com/search/code');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('GitHub code search HTTP ' + response.status);
    const payload = parseUpstreamJson(response, 'pro_fetch_code_search') as {
      items?: Array<{ name?: string; path?: string; html_url?: string; repository?: { full_name?: string } }>;
    };
    const results = (payload.items ?? []).map((item) => ({
      repository: item.repository?.full_name ?? '',
      path: item.path ?? '',
      name: item.name ?? '',
      url: item.html_url ?? '',
    }));
    return result(JSON.stringify({ provider: 'GitHub Code Search', query, count: results.length, results }, null, 2));
  },
});
