import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_with_proxy — Fetch URL through the configured HTTP proxy
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_with_proxy',
  description: 'Fetch URL through the configured HTTP proxy',
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
    const proxy = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
    if (!proxy) return fail("HTTPS_PROXY yoki HTTP_PROXY env o'rnatilmagan.");
    const { ProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
    const r = await fetchWithOptions(String(p.url), { retries: 0 });
    return md('# ' + p.url + ' (proxy: ' + proxy + ')\n\nstatus: ' + r.status + '\n\n' + r.text, 6000);
  },
});
