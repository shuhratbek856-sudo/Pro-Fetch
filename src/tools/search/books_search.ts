import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_books_search — Search book catalog records using Open Library
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_books_search',
  description: 'Search book catalog records using Open Library',
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
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'title,author_name,first_publish_year,edition_count,key,isbn');
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Open Library HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      docs?: Array<{
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        edition_count?: number;
        key?: string;
        isbn?: string[];
      }>;
    };
    const results = (payload.docs ?? []).map((book) => ({
      title: book.title ?? '',
      authors: book.author_name ?? [],
      firstPublished: book.first_publish_year ?? null,
      editions: book.edition_count ?? 0,
      url: book.key ? 'https://openlibrary.org' + book.key : '',
      isbn: book.isbn?.[0] ?? '',
    }));
    return result(JSON.stringify({ provider: 'Open Library', query, count: results.length, results }, null, 2));
  },
});
