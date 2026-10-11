import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_pypi_package_read — Read PyPI package metadata and docs
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_pypi_package_read',
  description: 'Read PyPI package metadata and docs',
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
    const r = await fetchWithOptions('https://pypi.org/pypi/' + encodeURIComponent(String(p.query)) + '/json');
    if (r.status >= 400) return fail('Paket topilmadi: ' + p.query);
    const info = JSON.parse(r.text).info;
    return jsonBlock('# PyPI: ' + p.query, {
      version: info.version,
      summary: info.summary,
      license: info.license,
      home_page: info.home_page,
      requires_python: info.requires_python,
      dependencies: (info.requires_dist ?? []).slice(0, 20),
    });
  },
});
