import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_pr_files — List the files changed in a pull request
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_pr_files',
  description: 'List the files changed in a pull request',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'pr_number'], ['pr_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.pr_number) return fail('pr_number kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/pulls/' + p.pr_number + '/files?per_page=100');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (f: JsonRow) =>
        '- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')',
    );
    return md('# PR #' + p.pr_number + " — o'zgargan fayllar\n\n" + items.join('\n'));
  },
});
