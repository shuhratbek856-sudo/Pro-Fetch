import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_rfc_read — Read an RFC document by number
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_rfc_read',
  description: 'Read an RFC document by number',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'RFC raqami' },
      section: { type: 'string', description: "Bo'lim kaliti (ixtiyoriy)" },
    },
    required: ['id'],
  },
  async handler(input) {
    const p = view(input);
    const id = String(p.id).replace(/\D/g, '');
    const r = await fetchWithOptions('https://www.rfc-editor.org/rfc/rfc' + id + '.txt');
    if (r.status >= 400) return fail('RFC topilmadi: ' + id);
    let text = r.text;
    if (p.section) {
      const idx = text.toLowerCase().indexOf(String(p.section).toLowerCase());
      if (idx >= 0) text = text.slice(Math.max(0, idx - 200), idx + 4000);
    }
    return md('# RFC ' + id + (p.section ? ' — ' + p.section : '') + '\n\n' + text);
  },
});
