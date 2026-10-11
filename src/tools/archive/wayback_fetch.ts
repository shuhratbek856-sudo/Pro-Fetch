import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail, md } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_wayback_fetch — Fetch the latest Wayback snapshot of a URL
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_wayback_fetch',
  description: 'Fetch the latest Wayback snapshot of a URL',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchUrl('https://web.archive.org/web/2/' + String(p.url));
    if (r.status >= 400) return fail('Wayback snapshot topilmadi');
    return md('# Wayback: ' + p.url + '\n\n' + r.markdown);
  },
});
