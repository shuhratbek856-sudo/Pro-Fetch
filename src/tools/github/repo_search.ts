import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_search — Search repositories on GitHub
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_search',
  description: 'Search repositories on GitHub',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Qidiruv so'rovi" },
      per_page: { type: 'number', description: 'Natija soni (default 10)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const r = await ghApi(
      '/search/repositories?q=' + encodeURIComponent(String(p.query)) + '&per_page=' + (p.per_page ?? 10),
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.items ?? []).map(
      (x: JsonRow) => '- **' + x.full_name + '** ⭐ ' + x.stargazers_count + ' — ' + (x.description ?? ''),
    );
    return md('# Qidiruv: ' + p.query + ' (' + (r.json.total_count ?? 0) + ' natija)\n\n' + items.join('\n'));
  },
});
