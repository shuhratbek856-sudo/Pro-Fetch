import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_directory_read — Read all files in a repository directory
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_directory_read',
  description: 'Read all files in a repository directory',
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
    const dir = String(p.path ?? '').replace(/^\/+|\/+$/g, '');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/contents/' + dir);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = asRecordArray(r.json)
      .filter((e) => pathStr(e, 'type') === 'file')
      .slice(0, 20);
    const parts: string[] = [];
    for (const f of files) {
      const fr = await ghApi('/repos/' + p.owner + '/' + p.repo + '/contents/' + f.path, 'application/vnd.github.raw');
      parts.push('## ' + f.path + '\n\n' + (fr.status < 400 ? clipToTokens(fr.text, 2000) : "(o'qilmadi)"));
    }
    return md('# ' + (dir || 'root') + ' — ' + files.length + ' fayl\n\n' + parts.join('\n\n---\n\n'));
  },
});
