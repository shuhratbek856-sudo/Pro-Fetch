import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_soap — Send a SOAP XML request to a web service
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_soap',
  description: 'Send a SOAP XML request to a web service',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'SOAP endpoint' },
      xml: { type: 'string', description: "SOAP XML so'rov" },
    },
    required: ['url', 'xml'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: typeof p.action === 'string' ? p.action : '' },
      body: String(p.xml),
    });
    return md('# SOAP javob (HTTP ' + r.status + ')\n\n' + r.text, 8000);
  },
});
