import { fetchWithOptions } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_wayback_lookup — List Wayback Machine snapshots availability of a URL
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_wayback_lookup',
  description: 'List Wayback Machine snapshots availability of a URL',
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
    const r = await fetchWithOptions('https://archive.org/wayback/available?url=' + encodeURIComponent(String(p.url)));
    return jsonBlock('# Wayback: ' + p.url, JSON.parse(r.text || '{}'));
  },
});
