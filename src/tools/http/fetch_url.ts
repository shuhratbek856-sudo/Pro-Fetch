import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_url — Fetch any URL and return clean readable content as markdown
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_url',
  description: 'Fetch any URL and return clean readable content as markdown',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      // `fetchUrl(url, { maxTokens: Number(p.max_tokens ?? 8000) })`. Without it the response is cut at
      // 8 000 tokens and the caller has no way to ask for more.
      max_tokens: { type: 'number', description: 'Javob uzunligi limiti, token' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchUrl(String(p.url), { maxTokens: Number(p.max_tokens ?? 8000) });
    return {
      content: [
        {
          type: 'text',
          text:
            '# ' +
            r.url +
            '\n\n' +
            r.markdown +
            '\n\n---\nstatus: ' +
            r.status +
            ' | ' +
            r.contentType +
            ' | ~' +
            r.tokens +
            ' token' +
            (r.cached ? ' | cache' : ''),
        },
      ],
    };
  },
});
