import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_compare — Compare two branches or commits
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_compare',
  description: 'Compare two branches or commits',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'base', 'head'], ['base', 'head', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.base || !p.head) return fail('base va head kerak');
    const r = await ghApi(
      '/repos/' +
        p.owner +
        '/' +
        p.repo +
        '/compare/' +
        encodeURIComponent(String(p.base)) +
        '...' +
        encodeURIComponent(String(p.head)),
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = (r.json.files ?? []).map(
      (f: JsonRow) =>
        '- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')',
    );
    return md('# ' + p.base + '... ' + p.head + ' — ' + (r.json.total_commits ?? 0) + ' commit\n\n' + files.join('\n'));
  },
});
