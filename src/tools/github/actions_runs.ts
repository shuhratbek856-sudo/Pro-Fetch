import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_actions_runs — List GitHub Actions workflow runs
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_actions_runs',
  description: 'List GitHub Actions workflow runs',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'per_page'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/actions/runs?per_page=' + (p.per_page ?? 20));
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.workflow_runs ?? []).map(
      (run: JsonRow) =>
        '- ' +
        (run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⏳') +
        ' ' +
        run.name +
        ' [' +
        run.status +
        '/' +
        (run.conclusion ?? '-') +
        '] ' +
        run.created_at,
    );
    return md('# Actions runlar\n\n' + items.join('\n'));
  },
});
