import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_tags_list — List the tags of a repository
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_tags_list',
  description: 'List the tags of a repository',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const r = await ghApiPaginated(
      '/repos/' + encodeURIComponent(String(p.owner)) + '/' + encodeURIComponent(String(p.repo)) + '/tags?per_page=50',
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (t: JsonRow) => '- ' + pathStr(t, 'name') + ' (' + pathStr(t, 'commit.sha').slice(0, 7) + ')',
    );
    return md('# Taglar\n\n' + items.join('\n') + paginationNotice(r));
  },
});
