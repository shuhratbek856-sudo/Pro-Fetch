import { getCredential } from '../../core/credentials.js';
import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_code_search — Search code across GitHub repositories
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view, pathStr } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_code_search',
  description: 'Search code across GitHub repositories',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Kod qidiruv (repo: bilan cheklash mumkin)' },
      per_page: { type: 'number', description: 'Natija soni (default 10)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    if (!getCredential('GITHUB_TOKEN')) return fail('code_search uchun GITHUB_TOKEN kerak (GitHub talabi).');
    const r = await ghApi('/search/code?q=' + encodeURIComponent(String(p.query)) + '&per_page=' + (p.per_page ?? 10));
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.items ?? []).map(
      (x: JsonRow) => '- **' + pathStr(x, 'repository.full_name') + '** — ' + pathStr(x, 'path'),
    );
    return md('# Kod qidiruv: ' + p.query + '\n\n' + items.join('\n'));
  },
});
