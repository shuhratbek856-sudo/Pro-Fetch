import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_fork_network — Get the fork network of a repository
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_fork_network',
  description: 'Get the fork network of a repository',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/forks?sort=oldest&per_page=50');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map((f: JsonRow) => '- ' + f.full_name + ' ⭐ ' + f.stargazers_count);
    return md("# Fork tarmog'i (" + items.length + ')\n\n' + items.join('\n'));
  },
});
