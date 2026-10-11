import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_doi_resolve — Resolve a DOI to metadata and source links
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_doi_resolve',
  description: 'Resolve a DOI to metadata and source links',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      doi: { type: 'string', description: 'DOI (masalan 10.1145/3442188.3445922)' },
    },
    required: ['doi'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions('https://doi.org/api/handles/' + encodeURIComponent(String(p.doi)));
    if (r.status >= 400) return fail('DOI topilmadi: ' + p.doi);
    return jsonBlock('# DOI: ' + p.doi, JSON.parse(r.text));
  },
});
