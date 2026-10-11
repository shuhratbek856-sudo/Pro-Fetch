import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_options — Send OPTIONS request to inspect CORS and allowed methods
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_options',
  description: 'Send OPTIONS request to inspect CORS and allowed methods',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), { method: 'OPTIONS', retries: 0 });
    return jsonBlock('# OPTIONS ' + p.url, {
      status: r.status,
      allow: r.headers['allow'] ?? null,
      cors: r.headers['access-control-allow-origin'] ?? null,
      headers: r.headers,
    });
  },
});
