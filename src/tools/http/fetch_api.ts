import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_api — Call a JSON REST API endpoint and return parsed JSON
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { parseUpstreamJson } from '../../core/json-response.js';
export default defineTool({
  name: 'pro_fetch_fetch_api',
  description: 'Call a JSON REST API endpoint and return parsed JSON',
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
    const r = await fetchWithOptions(String(p.url));
    // The helper's error already names the status, the content type and the body preview, so it is
    // reported rather than replaced with a generic message that discards what the server sent.
    let body: unknown;
    try {
      body = parseUpstreamJson(r, 'pro_fetch_fetch_api');
    } catch (error) {
      return fail(error instanceof Error ? error.message : 'Javob JSON emas');
    }
    return jsonBlock('# GET ' + p.url + ' (HTTP ' + r.status + ')', body);
  },
});
