import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_releases_list — List releases with notes
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_releases_list',
  description: 'List releases with notes',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'per_page'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const r = await ghApiPaginated(
      '/repos/' +
        encodeURIComponent(String(p.owner)) +
        '/' +
        encodeURIComponent(String(p.repo)) +
        '/releases?per_page=' +
        Math.max(1, Math.min(100, Number(p.per_page ?? 20) || 20)),
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (rel: JsonRow) =>
        '## ' +
        pathStr(rel, 'name') +
        ' (' +
        pathStr(rel, 'tag_name') +
        ' — ' +
        pathStr(rel, 'published_at') +
        ')\n\n' +
        clipToTokens(pathStr(rel, 'body'), 1000),
    );
    return md('# Relizlar\n\n' + items.join('\n\n---\n\n') + paginationNotice(r));
  },
});
