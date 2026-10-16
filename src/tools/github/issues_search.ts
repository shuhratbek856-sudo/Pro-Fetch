import { ghApi, ghApiPaginated, paginationNotice, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_issues_search — Advanced issue search by label author and state
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_issues_search',
  description: 'Advanced issue search by label author and state',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'per_page', 'max_pages', 'query'], ['owner', 'repo', 'query']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    if (!p.query) return fail('query kerak');
    // GitHub's issue search rejects a query with no `is:` qualifier outright:
    //   422 "Query must include 'is:issue' or 'is:project'".
    // The qualifier was never added, so every call failed - the tool could not search anything.
    //
    // It is added only when the caller has not chosen, so `is:pr` in the query still searches pull
    // requests. Rewriting a deliberate `is:issue` to `is:issue` is harmless; rewriting `is:pr` to
    // `is:issue` would return the wrong set and look correct.
    const raw = String(p.query);
    const qualifier = /\bis:(issue|pr|pull_request|project)\b/.test(raw) ? '' : ' is:issue';
    const q = encodeURIComponent(`repo:${p.owner}/${p.repo} ${raw}${qualifier}`);
    const r = await ghApiPaginated(
      '/search/issues?q=' + q + '&per_page=' + Math.max(1, Math.min(100, Number(p.per_page ?? 15))),
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json.items ?? []).map(
      (i: JsonRow) => '- #' + pathNum(i, 'number') + ' [' + pathStr(i, 'state') + '] ' + pathStr(i, 'title'),
    );
    return md('# Issue qidiruv\n\n' + items.join('\n') + paginationNotice(r));
  },
});
