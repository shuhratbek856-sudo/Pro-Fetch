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
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_search',
  description: 'Search repositories on GitHub',
  category: 'github',
  inputSchema: ghSchema(['per_page', 'query'], ['query']),
  async handler(input) {
    const p = view(input);
    // Without this the request goes out as `q=undefined`, GitHub matches nothing, and the tool
    // reports "no repositories found" for a query that was never sent.
    if (!p.query || !String(p.query).trim()) return fail('MISSING_INPUT: query majburiy.');
    const r = await ghApi(
      '/search/repositories?q=' + encodeURIComponent(String(p.query).trim()) + '&per_page=' + (p.per_page ?? 10),
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.items ?? []).map(
      (x: JsonRow) => '- **' + x.full_name + '** ⭐ ' + x.stargazers_count + ' — ' + (x.description ?? ''),
    );
    return md('# Qidiruv: ' + p.query + ' (' + (r.json.total_count ?? 0) + ' natija)\n\n' + items.join('\n'));
  },
});
