import { fetchWithOptions } from '../../core/http-client.js';
import { result, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_url_watch — Register a URL snapshot for change watching
 * Pack: monitoring (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_url_watch',
  description: 'Register a URL snapshot for change watching',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Kuzatiladigan manzil' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const key = 'watch:' + String(p.url);
    const r = await fetchWithOptions(String(p.url), { cache: false });
    cache.put(key, clipToTokens(r.text, 2000), 86_400_000);
    const prev = cache.get('watch-prev:' + p.url);
    if (!prev) cache.put('watch-prev:' + p.url, String(Date.now()), 86_400_000);
    return result("✅ Watch qo'shildi: " + p.url + ' (HTTP ' + r.status + '). Farq uchun page_diff_notify ishlating.');
  },
});
