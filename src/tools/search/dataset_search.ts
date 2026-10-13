import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_dataset_search — Search datasets hosted on Hugging Face Hub
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_dataset_search',
  description: 'Search datasets hosted on Hugging Face Hub',
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
    const url = new URL('https://huggingface.co/api/datasets');
    url.searchParams.set('search', query);
    url.searchParams.set('limit', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Hugging Face dataset API HTTP ' + response.status);
    const datasets = parseUpstreamJson(response, 'pro_fetch_dataset_search') as Array<{
      id?: string;
      downloads?: number;
      likes?: number;
      tags?: string[];
      gated?: boolean;
    }>;
    const results = datasets.map((item) => ({
      id: item.id ?? '',
      url: item.id ? 'https://huggingface.co/datasets/' + item.id : '',
      downloads: item.downloads ?? 0,
      likes: item.likes ?? 0,
      tags: item.tags ?? [],
      gated: Boolean(item.gated),
    }));
    return result(JSON.stringify({ provider: 'Hugging Face Hub', query, count: results.length, results }, null, 2));
  },
});
