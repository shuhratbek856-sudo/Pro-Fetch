import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_release_diff — Get the diff between two releases
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_release_diff',
  description: 'Get the diff between two releases',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'base', 'head'], ['base', 'head', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.base || !p.head) return fail('base va head (tag/branch) kerak');
    const r = await ghApi(
      '/repos/' +
        p.owner +
        '/' +
        p.repo +
        '/compare/' +
        encodeURIComponent(String(p.base)) +
        '...' +
        encodeURIComponent(String(p.head)),
      'application/vnd.github.diff',
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    return md('# ' + p.base + '... ' + p.head + ' — diff\n\n```diff\n' + r.text + '\n```', 12000);
  },
});
