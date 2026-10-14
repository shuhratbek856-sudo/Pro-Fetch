import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_pr_review_comments — Read inline review comments of a pull request
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_pr_review_comments',
  description: 'Read inline review comments of a pull request',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'pr_number'], ['pr_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.pr_number) return fail('pr_number kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/pulls/' + p.pr_number + '/comments?per_page=50');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (c: JsonRow) =>
        '- **' +
        pathStr(c, 'user.login') +
        '** `' +
        pathStr(c, 'path') +
        ':' +
        pathNum(c, 'line') +
        '` — ' +
        clipToTokens(pathStr(c, 'body'), 300),
    );
    return md('# PR #' + p.pr_number + ' — inline izohlar\n\n' + items.join('\n'));
  },
});
