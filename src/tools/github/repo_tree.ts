import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_tree — List the full repository file tree with lazy loading
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_tree',
  description: 'List the full repository file tree with lazy loading',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'ref'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    let ref = p.ref;
    if (!ref) {
      const info = await ghApi('/repos/' + p.owner + '/' + p.repo);
      if (info.status >= 400) return ghErr(info.status, info.json);
      ref = info.json.default_branch;
    }
    const r = await ghApi(
      '/repos/' + p.owner + '/' + p.repo + '/git/trees/' + encodeURIComponent(String(ref)) + '?recursive=1',
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const tree = r.json.tree ?? [];
    const lines = tree.slice(0, 2000).map((t: JsonRow) => (t.type === 'tree' ? '📁 ' : '📄 ') + t.path);
    const more = tree.length > 2000 ? '\n... va yana ' + (tree.length - 2000) + ' element' : '';
    return md(
      '# ' + p.owner + '/' + p.repo + ' @ ' + ref + ' (' + tree.length + ' element)\n\n' + lines.join('\n') + more,
    );
  },
});
