import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_post_multipart — Send POST request with multipart form-data
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_post_multipart',
  description: 'Send POST request with multipart form-data',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      fields: { type: 'object', description: 'Maydonlar' },
      file_url: { type: 'string', description: 'Yuklanadigan fayl URL (ixtiyoriy)' },
      filename: { type: 'string', description: 'Fayl nomi' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const boundary = '----profetch' + Date.now();
    const parts: string[] = [];
    for (const [k, v] of Object.entries(p.fields ?? {})) {
      parts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="' + k + '"\r\n\r\n' + String(v) + '\r\n');
    }
    if (p.file_url && p.filename) {
      const fr = await fetchWithOptions(String(p.file_url));
      parts.push(
        '--' +
          boundary +
          '\r\nContent-Disposition: form-data; name="file"; filename="' +
          p.filename +
          '"\r\nContent-Type: application/octet-stream\r\n\r\n' +
          fr.text +
          '\r\n',
      );
    }
    const body = parts.join('') + '--' + boundary + '--\r\n';
    const r = await fetchWithOptions(String(p.url), {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
      body,
    });
    return md('# POST (multipart) ' + p.url + ' (HTTP ' + r.status + ')\n\n' + r.text);
  },
});
