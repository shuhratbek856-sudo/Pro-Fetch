import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_npm_package_read — Read npm package metadata and README
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_npm_package_read',
  description: 'Read npm package metadata and README',
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
    const j = JSON.parse(r.text);
    const latest = j['dist-tags']?.latest;
    const v = j.versions?.[latest] ?? {};
    return jsonBlock('# npm: ' + p.query + ' (latest: ' + latest + ')', {
      description: j.description,
      latest,
      license: v.license,
      homepage: v.homepage,
      dependencies: Object.keys(v.dependencies ?? {}),
      maintainers: (j.maintainers ?? []).map((m: any) => m.name),
    });
  },
});
