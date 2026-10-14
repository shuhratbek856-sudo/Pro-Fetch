import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_file_blame — Get per-line authorship blame approximation of a file
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_file_blame',
  description: 'Get per-line authorship blame approximation of a file',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path'], ['path', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.path) return fail('path kerak');
    const r = await ghApi(
      '/repos/' + p.owner + '/' + p.repo + '/commits?path=' + encodeURIComponent(String(p.path)) + '&per_page=20',
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (c: JsonRow) =>
        '- ' +
        pathStr(c, 'sha').slice(0, 7) +
        ' (' +
        pathStr(c, 'commit.author.name') +
        ') — ' +
        pathStr(c, 'commit.message').split('\n')[0],
    );
    return md(
      '# ' +
        p.path +
        " — blame yaqinlashuvi\n\nGitHub REST API to'liq blame bermaydi; faylga tegishli oxirgi commitlar:\n\n" +
        items.join('\n'),
    );
  },
});
