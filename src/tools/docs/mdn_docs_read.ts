import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_mdn_docs_read — Read MDN documentation for a web API
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_mdn_docs_read',
  description: 'Read MDN documentation for a web API',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const route = String(p.query ?? '').replace(/^\/+/, '');
    const r = await fetchUrl('https://developer.mozilla.org/en-US/docs/' + route);
    if (r.status >= 400) return fail('MDN sahifasi topilmadi: ' + route);
    return md('# MDN: ' + route + '\n\n' + r.markdown);
  },
});
