import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_wiki_read — Read repository wiki pages
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_wiki_read',
  description: 'Read repository wiki pages',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const r = await fetchUrl('https://github.com/' + p.owner + '/' + p.repo + '/wiki');
    if (r.status >= 400) return fail('Wiki ochilmadi (private yoki mavjud emas)');
    return md('# ' + p.owner + '/' + p.repo + ' — Wiki\n\n' + r.markdown);
  },
});
