import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_issues_list — List repository issues with filters
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_issues_list',
  description: 'List repository issues with filters',
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
      max_pages: { type: 'number', description: 'Avtomatik kuzatiladigan GitHub API sahifalari (1-20)' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const r = await ghApiPaginated(
      '/repos/' +
        encodeURIComponent(String(p.owner)) +
        '/' +
        encodeURIComponent(String(p.repo)) +
        '/issues?state=' +
        encodeURIComponent(String(p.state ?? 'open')) +
        '&per_page=' +
        Math.max(1, Math.min(100, Number(p.per_page ?? 20) || 20)),
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? [])
      .filter((i: JsonRow) => !i.pull_request)
      .map((i: JsonRow) => '- #' + pathNum(i, 'number') + ' [' + pathStr(i, 'state') + '] ' + pathStr(i, 'title'));
    return md('# Issues (' + (p.state ?? 'open') + ')\n\n' + items.join('\n') + paginationNotice(r));
  },
});
