import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_commits_list — List commits with author and message filters
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_commits_list',
  description: 'List commits with author and message filters',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path', 'per_page', 'max_pages', 'sha'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    let api =
      '/repos/' +
      encodeURIComponent(String(p.owner)) +
      '/' +
      encodeURIComponent(String(p.repo)) +
      '/commits?per_page=' +
      Math.max(1, Math.min(100, Number(p.per_page ?? 20) || 20));
    if (p.sha) api += '&sha=' + encodeURIComponent(String(p.sha));
    if (p.path) api += '&path=' + encodeURIComponent(String(p.path));
    const r = await ghApiPaginated(api, typeof p.max_pages === 'number' ? p.max_pages : undefined);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (c: JsonRow) =>
        '- ' +
        pathStr(c, 'sha').slice(0, 7) +
        ' ' +
        pathStr(c, 'commit.author.date') +
        ' — ' +
        pathStr(c, 'commit.message').split('\n')[0],
    );
    return md('# Commitlar\n\n' + items.join('\n') + paginationNotice(r));
  },
});
