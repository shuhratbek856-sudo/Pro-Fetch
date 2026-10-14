import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_dependents — Get packages depending on this repository
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_dependents',
  description: 'Get packages depending on this repository',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const fr = await fetchWithOptions('https://github.com/' + p.owner + '/' + p.repo + '/network/dependents');
    const $ = (await import('cheerio')).load(fr.text);
    const count = $('[href*="/network/dependents"]').first().text().trim();
    const pkgs = $('a[data-hovercard-type="repository"]')
      .map((i: any, el: any) => (i < 30 ? $(el).text().trim() : null))
      .get()
      .filter(Boolean);
    return md(
      '# ' +
        p.owner +
        '/' +
        p.repo +
        " — bog'liq loyihalar\n\n" +
        (count || '') +
        '\n\n' +
        pkgs.map((x: string) => '- ' + x).join('\n'),
    );
  },
});
