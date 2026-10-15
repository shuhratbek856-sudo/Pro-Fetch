import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_org_repos — List the repositories of an organization
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_org_repos',
  description: 'List the repositories of an organization',
  category: 'github',
  inputSchema: ghSchema(['per_page', 'max_pages', 'org'], ['org']),
  async handler(input) {
    const p = view(input);
    if (!p.org) return fail('org parametri kerak.');
    const r = await ghApiPaginated(
      '/orgs/' +
        encodeURIComponent(String(p.org)) +
        '/repos?per_page=' +
        Math.max(1, Math.min(100, Number(p.per_page ?? 30) || 30)) +
        '&sort=updated',
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (x: JsonRow) => '- **' + x.full_name + '** ⭐ ' + x.stargazers_count + ' — ' + (x.description ?? ''),
    );
    return md('# ' + p.org + ' repolari\n\n' + items.join('\n') + paginationNotice(r));
  },
});
