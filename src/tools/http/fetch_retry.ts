import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_retry — Fetch URL with a custom retry policy and backoff
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_retry',
  description: 'Fetch URL with a custom retry policy and backoff',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      retries: { type: 'number', description: 'Qayta urinishlar (default 5)' },
      timeout_ms: { type: 'number', description: 'Timeout ms' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), {
      retries: Number(p.retries ?? 5),
      timeoutMs: Number(p.timeout_ms ?? 15000),
    });
    return md('# ' + p.url + '\n\nstatus: ' + r.status + '\n\n' + r.text, 8000);
  },
});
