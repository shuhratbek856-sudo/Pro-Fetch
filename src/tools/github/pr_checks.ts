import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_pr_checks — Get CI check run statuses for a pull request
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_pr_checks',
  description: 'Get CI check run statuses for a pull request',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'pr_number'], ['pr_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.pr_number) return fail('pr_number kerak');
    const pr = await ghApi('/repos/' + p.owner + '/' + p.repo + '/pulls/' + p.pr_number);
    if (pr.status >= 400) return ghErr(pr.status, pr.json);
    const sha = pr.json.head?.sha;
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/commits/' + sha + '/check-runs');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.check_runs ?? []).map(
      (c: JsonRow) =>
        '- ' +
        (c.conclusion === 'success' ? '✅' : c.conclusion === 'failure' ? '❌' : '⏳') +
        ' ' +
        c.name +
        ' [' +
        c.status +
        '/' +
        (c.conclusion ?? '-') +
        ']',
    );
    return md('# PR #' + p.pr_number + ' — CI checklar\n\n' + items.join('\n'));
  },
});
