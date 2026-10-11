import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_export_bundle — Export cache data as a portable bundle
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_export_bundle',
  description: 'Export cache data as a portable bundle',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const keys = cache.keys('');
    const bundle: Record<string, unknown> = {};
    for (const k of keys.slice(0, 100)) {
      const hit = cache.get(k);
      if (hit) bundle[k] = { value: hit.value.slice(0, 2000), createdAt: hit.createdAt };
    }
    return jsonBlock('# Bundle (' + Object.keys(bundle).length + ' yozuv)', bundle);
  },
});
