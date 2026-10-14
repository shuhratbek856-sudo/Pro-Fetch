import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_issue_timeline — Get the full event timeline of an issue
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_issue_timeline',
  description: 'Get the full event timeline of an issue',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'issue_number'], ['issue_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.issue_number) return fail('issue_number kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/issues/' + p.issue_number + '/timeline?per_page=50');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (e: JsonRow) =>
        '- ' + pathStr(e, 'event') + ' — ' + pathStr(e, 'actor.login') + ' (' + pathStr(e, 'created_at') + ')',
    );
    return md('# Issue #' + p.issue_number + ' — timeline\n\n' + items.join('\n'));
  },
});
