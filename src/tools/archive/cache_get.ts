import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_cache_get — Get the cached response for a key or URL
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_cache_get',
  description: 'Get the cached response for a key or URL',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Cache kalit yoki URL' },
    },
    required: ['key'],
  },
  async handler(input) {
    const p = view(input);
    const hit = cache.get(String(p.key ?? p.url ?? ''));
    if (!hit) return fail('Cache da topilmadi: ' + (p.key ?? p.url));
    return result(
      '# ' + (p.key ?? p.url) + '\n\n_saqlangan: ' + new Date(hit.createdAt).toISOString() + '_\n\n' + hit.value,
    );
  },
});
