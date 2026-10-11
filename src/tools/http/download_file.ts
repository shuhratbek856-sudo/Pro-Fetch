import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_download_file — Download a file from URL into the local cache
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_download_file',
  description: 'Download a file from URL into the local cache',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      filename: { type: 'string', description: 'Saqlanadigan nom (ixtiyoriy)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const name = String(p.filename ?? new URL(String(p.url)).pathname.split('/').pop() ?? 'fayl');
    const dest = path.join(cacheDir(), name.replace(/[^a-zA-Z0-9._-]/g, '_'));
    const info = await downloadToFile(String(p.url), dest);
    if (info.status >= 400) return fail('Yuklashda xato: HTTP ' + info.status);
    return result('✅ Yuklandi: ' + dest + ' (' + Math.round(info.bytes / 1024) + ' KB)');
  },
});
