import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_version_history — List stored cache entries for a URL
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_version_history',
  description: 'List stored cache entries for a URL',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: "URL yoki kalit bo'lagi" },
    },
    required: ['key'],
  },
  async handler(input) {
    const p = view(input);
    const keys = cache.keys('').filter((k: string) => k.includes(String(p.key)));
    return result(
      '# Cache yozuvlari: ' +
        p.key +
        ' (' +
        keys.length +
        ')\n\n' +
        keys.map((k) => '- ' + k).join('\n') +
        '\n\n(Eslatma: har URL uchun oxirgi nusxa saqlanadi)',
    );
  },
});
