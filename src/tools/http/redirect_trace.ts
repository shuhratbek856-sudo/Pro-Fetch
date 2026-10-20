import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_redirect_trace — Trace the full redirect chain of a URL
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_redirect_trace',
  description: 'Trace the full redirect chain of a URL',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      timeout_ms: { type: 'number', description: 'Zanjir uchun umumiy timeout ms (standart 15000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    // A chain against a server that accepts connections and never answers used to hang forever:
    // no caller asked for a bound, so none existed. The trace is now time-boxed like any fetch.
    const chain = await traceRedirects(String(p.url), 10, Number(p.timeout_ms));
    return result(
      '# Redirect zanjiri (' +
        (chain.length - 1) +
        ' qadam)\n\n' +
        chain.map((u: string, i: number) => i + 1 + '. ' + u).join('\n'),
    );
  },
});
