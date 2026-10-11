import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_academic_search — Search academic papers on arXiv and Semantic Scholar
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_academic_search',
  description: 'Search scholarly works and publication metadata using Crossref',
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
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query', query);
    url.searchParams.set('rows', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Crossref HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      message?: {
        items?: Array<{
          title?: string[];
          author?: Array<{ given?: string; family?: string }>;
          published?: { 'date-parts'?: number[][] };
          DOI?: string;
          URL?: string;
          'container-title'?: string[];
          type?: string;
        }>;
      };
    };
    const results = (payload.message?.items ?? []).map((item) => ({
      title: item.title?.[0] ?? '',
      authors: (item.author ?? []).map((author) => [author.given, author.family].filter(Boolean).join(' ')),
      year: item.published?.['date-parts']?.[0]?.[0] ?? null,
      doi: item.DOI ?? '',
      url: item.URL ?? (item.DOI ? 'https://doi.org/' + item.DOI : ''),
      publication: item['container-title']?.[0] ?? '',
      type: item.type ?? '',
    }));
    return result(JSON.stringify({ provider: 'Crossref', query, count: results.length, results }, null, 2));
  },
});
