import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_pr_read — Read a pull request with metadata and description
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_pr_read',
  description: 'Read a pull request with metadata and description',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'pr_number'], ['pr_number', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.pr_number) return fail('pr_number kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/pulls/' + p.pr_number);
    if (r.status >= 400) return ghErr(r.status, r.json);
    return md(
      '# PR #' +
        r.json.number +
        ' — ' +
        r.json.title +
        '\n\n**Holat:** ' +
        r.json.state +
        ' | **Muallif:** ' +
        (r.json.user?.login ?? '(o‘chirilgan)') +
        ' | **Branch:** ' +
        (r.json.head?.ref ?? '?') +
        ' → ' +
        (r.json.base?.ref ?? '?') +
        '\n\n' +
        (r.json.body ?? ''),
    );
  },
});
