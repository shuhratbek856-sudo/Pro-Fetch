import { ghApiPaginated, paginationNotice, ghErr, md, fail } from './_api.js';

/**
 * pro_gh_repo_contributors — List repository contributors ranked by commit count
 * Pack: github (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_contributors',
  description: 'List repository contributors ranked by commit count',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'per_page'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const perPage = Math.max(1, Math.min(100, Math.floor(Number(p.per_page ?? 30)) || 30));
    const r = await ghApiPaginated(
      '/repos/' +
        encodeURIComponent(String(p.owner)) +
        '/' +
        encodeURIComponent(String(p.repo)) +
        '/contributors?per_page=' +
        perPage,
      typeof p.max_pages === 'number' ? p.max_pages : undefined,
    );
    if (r.status >= 400) return ghErr(r.status, r.json);
    const rows: any[] = Array.isArray(r.json) ? r.json : [];
    const items = rows.map(
      (c, index) =>
        index +
        1 +
        '. **' +
        (c.login ?? c.name ?? 'anonymous') +
        '** — ' +
        (c.contributions ?? 0) +
        ' commit' +
        (c.type && c.type !== 'User' ? ' (' + c.type + ')' : ''),
    );
    return md(
      '# Contributors: ' +
        p.owner +
        '/' +
        p.repo +
        '\n\n' +
        (items.join('\n') || 'Contributor topilmadi (bo‘sh repository bo‘lishi mumkin).') +
        paginationNotice(r),
    );
  },
});
