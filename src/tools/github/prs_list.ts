import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_prs_list — List pull requests with open closed or merged filters
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_prs_list',
  description: 'List pull requests with open closed or merged filters',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'state', 'per_page', 'max_pages'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const r = await ghApiPaginated(
      '/repos/' +
        encodeURIComponent(String(p.owner)) +
        '/' +
        encodeURIComponent(String(p.repo)) +
        '/pulls?state=' +
        encodeURIComponent(String(p.state ?? 'open')) +
        '&per_page=' +
        Math.max(1, Math.min(100, Number(p.per_page ?? 20) || 20)),
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (x: JsonRow) =>
        '- #' +
        pathNum(x, 'number') +
        ' [' +
        pathStr(x, 'state') +
        '] ' +
        pathStr(x, 'title') +
        ' (' +
        pathStr(x, 'user.login') +
        ')',
    );
    return md('# Pull requests (' + (p.state ?? 'open') + ')\n\n' + items.join('\n') + paginationNotice(r));
  },
});
