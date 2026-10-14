import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_docs_extract — Extract the docs folder plus CONTRIBUTING and ARCHITECTURE
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_docs_extract',
  description: 'Extract the docs folder plus CONTRIBUTING and ARCHITECTURE',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const base = '/repos/' + p.owner + '/' + p.repo + '/contents/';
    const candidates = ['README.md', 'CONTRIBUTING.md', 'ARCHITECTURE.md', 'docs/README.md'];
    const parts: string[] = [];
    for (const c of candidates) {
      const fr = await ghApi(base + c, 'application/vnd.github.raw');
      if (fr.status < 400) parts.push('## ' + c + '\n\n' + clipToTokens(fr.text, 3000));
    }
    if (!parts.length) return fail('Hujjat fayllari topilmadi');
    return md('# ' + p.owner + '/' + p.repo + ' — docs\n\n' + parts.join('\n\n---\n\n'));
  },
});
