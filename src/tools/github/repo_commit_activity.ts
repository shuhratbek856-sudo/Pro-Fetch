import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_commit_activity — Get weekly commit activity for the last year
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_commit_activity',
  description: 'Get weekly commit activity for the last year',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/stats/commit_activity');
    if (r.status === 202)
      return result("GitHub statistikani hisoblayapti — bir necha soniyadan so'ng qayta chaqiring.");
    if (r.status >= 400) return ghErr(r.status, r.json);
    const weeks = (r.json ?? []).slice(-12);
    const lines = weeks.map((w: JsonRow) => '- hafta ' + pathNum(w, 'week') + ': ' + pathNum(w, 'total') + ' commit');
    return md('# ' + p.owner + '/' + p.repo + ' — oxirgi 12 hafta commit faolligi\n\n' + lines.join('\n'));
  },
});
