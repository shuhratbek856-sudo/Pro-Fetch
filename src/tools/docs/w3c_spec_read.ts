import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_w3c_spec_read — Read a W3C specification page
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_w3c_spec_read',
  description: 'Read a W3C specification page',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Spec sahifasi URL' },
      section: { type: 'string', description: "Bo'lim (ixtiyoriy)" },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchUrl(String(p.url));
    if (r.status >= 400) return fail('Sahifa topilmadi');
    return md('# ' + p.url + '\n\n' + r.markdown);
  },
});
