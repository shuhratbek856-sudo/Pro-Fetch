import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_raw_file — Fetch raw file content from a ref
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_raw_file',
  description: 'Fetch raw file content from a ref',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path', 'ref'], ['path', 'owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.path) return fail('path kerak');
    const ref = p.ref ?? 'HEAD';
    const r = await fetchUrl(
      'https://raw.githubusercontent.com/' +
        p.owner +
        '/' +
        p.repo +
        '/' +
        ref +
        '/' +
        String(p.path).replace(/^\/+/, ''),
    );
    return md('# ' + p.path + ' @ ' + ref + '\n\n' + r.markdown);
  },
});
