import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_post_form — Send POST request with form-urlencoded body
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_post_form',
  description: 'Send POST request with form-urlencoded body',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      body: { type: 'string', description: 'form-urlencoded matn' },
    },
    required: ['url', 'body'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: String(p.body),
    });
    return md('# POST ' + p.url + ' (HTTP ' + r.status + ')\n\n' + r.text);
  },
});
