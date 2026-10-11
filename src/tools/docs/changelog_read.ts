import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_changelog_read — Read a project changelog from GitHub releases
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_changelog_read',
  description: 'Read a project changelog from GitHub releases',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository egasi' },
      repo: { type: 'string', description: 'Repository nomi' },
      per_page: { type: 'number', description: 'Reliz soni (default 10)' },
    },
    required: ['owner', 'repo'],
  },
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/releases?per_page=' + (p.per_page ?? 10));
    if (r.status >= 400) return ghErr(r.status, r.json);
    const items = (r.json ?? []).map(
      (rel: any) =>
        '## ' +
        rel.name +
        ' (' +
        rel.tag_name +
        ' — ' +
        rel.published_at +
        ')\n\n' +
        clipToTokens(rel.body ?? '', 1000),
    );
    return md('# Changelog: ' + p.owner + '/' + p.repo + '\n\n' + items.join('\n\n---\n\n'));
  },
});
