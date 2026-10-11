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
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_tree',
  description: 'List the full repository file tree with lazy loading',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository egasi' },
      repo: { type: 'string', description: 'Repository nomi' },
      path: { type: 'string', description: "Fayl yoki papka yo'li" },
      ref: { type: 'string', description: 'Branch, tag yoki SHA' },
      issue_number: { type: 'number', description: 'Issue raqami' },
      pr_number: { type: 'number', description: 'PR raqami' },
      sha: { type: 'string', description: 'Commit SHA' },
      base: { type: 'string', description: 'Taqqoslash bazasi' },
      head: { type: 'string', description: 'Taqqoslash boshi' },
      state: { type: 'string', description: 'open | closed | all' },
      per_page: { type: 'number', description: 'Natija soni (default 20-30)' },
      page: { type: 'number', description: 'Sahifa raqami' },
      query: { type: 'string', description: "Qidiruv so'rovi" },
      user: { type: 'string', description: 'Foydalanuvchi' },
      org: { type: 'string', description: 'Tashkilot' },
      gist_id: { type: 'string', description: 'Gist ID' },
      tag: { type: 'string', description: 'Tag nomi' },
    },
    required: [],
  },
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
