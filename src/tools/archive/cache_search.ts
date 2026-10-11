import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_cache_search — Search cached content by keyword
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_cache_search',
  description: 'Search cached content by keyword',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      needle: { type: 'string', description: 'Qidiruv matni' },
    },
    required: ['needle'],
  },
  async handler(input) {
    const p = view(input);
    const hits = cache.search(String(p.needle ?? ''));
    return result(
      '# Cache qidiruv: ' + p.needle + ' (' + hits.length + ')\n\n' + hits.map((h: any) => '- ' + h.key).join('\n'),
    );
  },
});
