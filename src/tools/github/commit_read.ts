import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_commit_read — Read one commit with its full diff
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_commit_read',
  description: 'Read one commit with its full diff',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'sha'], ['sha', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.sha) return fail('sha kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/commits/' + p.sha);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = (r.json.files ?? []).map(
      (f: JsonRow) =>
        '- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')',
    );
    return md(
      '# Commit ' +
        r.json.sha.slice(0, 7) +
        '\n\n' +
        (r.json.commit?.message ?? '') +
        '\n\n**Muallif:** ' +
        (r.json.commit?.author?.name ?? '') +
        '\n\n## Fayllar\n\n' +
        files.join('\n'),
    );
  },
});
