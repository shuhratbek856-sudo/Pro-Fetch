import { ghApi, ghErr, md, fail } from './_api.js';
import { clipToTokens } from '../../core/chunker.js';

/**
 * pro_gh_release_read — Read one release (by tag, or the latest) with notes and assets
 * Pack: github (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_release_read',
  description: 'Read one release (by tag, or the latest) with notes and assets',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository egasi' },
      repo: { type: 'string', description: 'Repository nomi' },
      tag: { type: 'string', description: 'Release tag nomi. Berilmasa — eng oxirgi release' },
    },
    required: ['owner', 'repo'],
  },
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo parametrlari kerak.');
    const base =
      '/repos/' + encodeURIComponent(String(p.owner)) + '/' + encodeURIComponent(String(p.repo)) + '/releases';
    const r = await ghApi(p.tag ? base + '/tags/' + encodeURIComponent(String(p.tag)) : base + '/latest');
    if (r.status >= 400) return ghErr(r.status, r.json);
    const rel = r.json ?? {};
    const assets: any[] = Array.isArray(rel.assets) ? rel.assets : [];
    const assetLines = assets.map(
      (a) => '- ' + a.name + ' (' + (a.size ?? 0) + ' bayt, ' + (a.download_count ?? 0) + ' yuklab olish)',
    );
    const flags = [rel.draft ? 'draft' : '', rel.prerelease ? 'prerelease' : ''].filter(Boolean).join(', ');
    return md(
      '# ' +
        (rel.name || rel.tag_name) +
        ' (' +
        rel.tag_name +
        ')\n\n' +
        '**Nashr qilingan:** ' +
        (rel.published_at ?? 'noma’lum') +
        (rel.author?.login ? ' — **Muallif:** ' + rel.author.login : '') +
        (flags ? ' — ' + flags : '') +
        '\n\n' +
        clipToTokens(rel.body ?? '', 3000) +
        '\n\n## Assetlar\n\n' +
        (assetLines.join('\n') || 'Asset yo‘q.'),
    );
  },
});
