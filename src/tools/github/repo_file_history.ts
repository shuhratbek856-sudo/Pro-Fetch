import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_file_history — Get the commit history of a single file
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_file_history',
  description: 'Get the commit history of a single file',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path', 'per_page'], ['path', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.path) return fail('path kerak');
    const r = await ghApi(
      '/repos/' +
        p.owner +
        '/' +
        p.repo +
        '/commits?path=' +
        encodeURIComponent(String(p.path)) +
        '&per_page=' +
        (p.per_page ?? 20),
    );
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
    return md('# ' + p.path + ' — tarix\n\n' + items.join('\n'));
  },
});
