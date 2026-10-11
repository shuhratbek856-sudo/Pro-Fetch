import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_stream_fetch — Fetch URL with streaming response and return first N bytes
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_stream_fetch',
  description: 'Fetch URL with streaming response and return first N bytes',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      bytes: { type: 'number', description: 'Birinchi N bayt (default 2048)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), { maxBytes: Number(p.bytes ?? 2048), retries: 0 });
    return result('# ' + p.url + ' — birinchi baytlar (HTTP ' + r.status + ')\n\n' + r.text);
  },
});
