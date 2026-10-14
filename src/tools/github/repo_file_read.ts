import { ghApi, ghErr, md } from './_api.js';
import { ghSchema } from './_schema.js';

/**
 * pro_gh_repo_file_read — Read a single file from a repository in chunks
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_file_read',
  description: 'Read a single file from a repository in chunks',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path', 'ref'], ['owner', 'repo', 'path']),
  async handler(input) {
    const p = view(input);
    // `owner`, `repo` and `path` are declared required, and `assertRequiredPresent` in
    // src/core/github-input-guard.ts rejects the call before it gets here, so no handler-level
    // presence check is needed. Verified: this tool used to build `/repos/undefined/undefined`.
    let api = '/repos/' + p.owner + '/' + p.repo + '/contents/' + String(p.path).replace(/^\/+/, '');
    if (p.ref) api += '?ref=' + encodeURIComponent(String(p.ref));
    const r = await ghApi(api, 'application/vnd.github.raw');
    if (r.status >= 400) return ghErr(r.status, r.json);
    return md('# ' + p.path + '\n\n' + r.text);
  },
});
