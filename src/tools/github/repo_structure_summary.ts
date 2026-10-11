import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_structure_summary — Produce an AI-oriented map of what each folder does
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_structure_summary',
  description: 'Produce an AI-oriented map of what each folder does',
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
    const dirs: Record<string, number> = {};
    const exts: Record<string, number> = {};
    for (const t of r.json.tree ?? []) {
      if (t.type !== 'blob') continue;
      const parts = String(t.path).split('/');
      const top = parts.length > 1 ? parts[0] + '/' : parts[0];
      dirs[top] = (dirs[top] ?? 0) + 1;
      const e = (parts[parts.length - 1].split('.').pop() ?? '').toLowerCase();
      if (e && e.length < 6) exts[e] = (exts[e] ?? 0) + 1;
    }
    const dirLines = Object.entries(dirs)
      .sort((a, b) => b[1] - a[1])
      .map(([d, n]) => '- ' + d + ' — ' + n + ' fayl');
    const extLines = Object.entries(exts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([e, n]) => '- .' + e + ' — ' + n);
    return md(
      '# ' +
        p.owner +
        '/' +
        p.repo +
        ' — struktura xaritasi\n\n## Papkalar (fayl soni)\n\n' +
        dirLines.join('\n') +
        '\n\n## Tillar (kengaytma)\n\n' +
        extLines.join('\n'),
    );
  },
});
