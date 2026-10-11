import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_cache_put — Store custom data in the cache
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_cache_put',
  description: 'Store custom data in the cache',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Kalit' },
      value: { type: 'string', description: 'Qiymat' },
      ttl_ms: { type: 'number', description: 'TTL ms (default 3600000)' },
    },
    required: ['key', 'value'],
  },
  async handler(input) {
    const p = view(input);
    cache.put(String(p.key), String(p.value ?? ''), Number(p.ttl_ms ?? 3_600_000));
    return result('✅ Saqlandi: ' + p.key);
  },
});
