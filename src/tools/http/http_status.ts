import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_http_status — Check HTTP status code and response headers of a URL
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_http_status',
  description: 'Check HTTP status code and response headers of a URL',
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
    const r = await fetchWithOptions(String(p.url), { retries: 0 });
    return jsonBlock('# ' + p.url, {
      status: r.status,
      ok: r.status < 400,
      contentType: r.contentType,
      contentLength: r.headers['content-length'] ?? null,
      server: r.headers['server'] ?? null,
    });
  },
});
