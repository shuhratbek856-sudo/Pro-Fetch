import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_submodules — List repository submodules
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_submodules',
  description: 'List repository submodules',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/contents/.gitmodules', 'application/vnd.github.raw');
    if (r.status === 404) return result("Submodul yo'q (.gitmodules topilmadi)");
    if (r.status >= 400) return ghErr(r.status, r.json);
    const lines = r.text.split('\n').filter((l: string) => l.includes('path =') || l.includes('url ='));
    return md('# .gitmodules\n\n' + lines.join('\n'));
  },
});
