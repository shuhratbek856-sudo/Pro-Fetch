import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_snapshot_diff — Diff the cached and fresh versions of the same URL
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_snapshot_diff',
  description: 'Diff the cached and fresh versions of the same URL',
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
    const key = 'watch:' + String(p.url);
    const prev = cache.get(key);
    const fresh = await fetchWithOptions(String(p.url));
    if (!prev) return fail('Avval monitoring url_watch bilan nusxa saqlang');
    const a = prev.value.split('\n');
    const b = clipToTokens(fresh.text, 2000).split('\n');
    const setB = new Set(b);
    const changed = a.filter((l: string) => l.trim() && !setB.has(l)).slice(0, 30);
    cache.put(key, clipToTokens(fresh.text, 2000), 86_400_000);
    return result('# Farq (' + p.url + ')\n\n' + (changed.map((l) => '- ' + l).join('\n') || "(o'zgarish yo'q)"));
  },
});
