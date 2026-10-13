import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_registry_api_read — Read npm registry versions and deprecations
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { parseUpstreamJson } from '../../core/json-response.js';
export default defineTool({
  name: 'pro_fetch_registry_api_read',
  description: 'Read npm registry versions and deprecations',
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
    const pkg = encodeURIComponent(String(p.query));
    const r = await fetchWithOptions('https://registry.npmjs.org/' + pkg);
    if (r.status >= 400) return fail('Paket topilmadi: ' + p.query);
    const j = parseUpstreamJson<{
      time?: Record<string, string>;
      versions?: Record<string, { deprecated?: string }>;
      'dist-tags'?: { latest?: string };
    }>(r, 'pro_fetch_registry_api_read');
    const versions = Object.entries(j.time ?? {})
      .filter(([k]: any) => k !== 'created' && k !== 'modified')
      .slice(-20);
    const deprecated = Object.entries(j.versions ?? {})
      .filter(([, meta]: any) => (meta as any).deprecated)
      .map(([k]: any) => k);
    return jsonBlock('# npm registry: ' + p.query, {
      latest: j['dist-tags']?.latest,
      recent_versions: versions.map(([k, t]: any) => k + ' (' + t.slice(0, 10) + ')'),
      deprecated,
    });
  },
});
