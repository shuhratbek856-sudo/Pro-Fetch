import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_import_bundle — Import a previously exported bundle
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_import_bundle',
  description: 'Import a previously exported bundle',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'string', description: 'Bundle JSON' },
    },
    required: ['data'],
  },
  async handler(input) {
    const p = view(input);
    let data: any;
    try {
      data = JSON.parse(String(p.data ?? '{}'));
    } catch {
      return fail('Bundle JSON xato');
    }
    let n = 0;
    for (const [k, v] of Object.entries(data)) {
      cache.put(k, String((v as any)?.value ?? ''), 86_400_000);
      n++;
    }
    return result('✅ ' + n + ' yozuv import qilindi');
  },
});
