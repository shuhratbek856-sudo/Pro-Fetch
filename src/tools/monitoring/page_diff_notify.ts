import { fetchWithOptions } from '../../core/http-client.js';
import { result, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_page_diff_notify — Report changes since the last watch snapshot
 * Pack: monitoring (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_page_diff_notify',
  description: 'Report changes since the last watch snapshot',
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
    const prev = cache.get(key);
    if (!prev) return fail('Avval url_watch bilan nusxa saqlang');
    const fresh = await fetchWithOptions(String(p.url), { cache: false });
    const a = prev.value.split('\n');
    const b = clipToTokens(fresh.text, 2000).split('\n');
    const setB = new Set(b);
    const changed = a.filter((l: string) => l.trim() && !setB.has(l)).slice(0, 30);
    cache.put(key, clipToTokens(fresh.text, 2000), 86_400_000);
    return result(
      '# ' + p.url + " o'zgarishlari\n\n" + (changed.map((l) => '- ' + l).join('\n') || "(o'zgarish yo'q ✅)"),
    );
  },
});
