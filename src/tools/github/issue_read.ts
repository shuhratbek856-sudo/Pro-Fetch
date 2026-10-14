import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_issue_read — Read a single issue with body and labels
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_issue_read',
  description: 'Read a single issue with body and labels',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'issue_number'], ['issue_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.issue_number) return fail('issue_number kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/issues/' + p.issue_number);
    if (r.status >= 400) return ghErr(r.status, r.json);
    return md(
      '# #' +
        r.json.number +
        ' — ' +
        r.json.title +
        '\n\n**Holat:** ' +
        r.json.state +
        ' | **Label:** ' +
        asRecordArray(r.json.labels)
          .map((l) => pathStr(l, 'name'))
          .join(', ') +
        '\n\n' +
        (r.json.body ?? ''),
    );
  },
});
