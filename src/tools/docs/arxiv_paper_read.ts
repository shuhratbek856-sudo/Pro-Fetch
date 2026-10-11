import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_arxiv_paper_read — Read a full arXiv paper by ID with abstract and authors
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_arxiv_paper_read',
  description: 'Read a full arXiv paper by ID with abstract and authors',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'arXiv ID (masalan 2301.00001)' },
    },
    required: ['id'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions('https://export.arxiv.org/api/query?id_list=' + encodeURIComponent(String(p.id)));
    const $ = (await import('cheerio')).load(r.text, { xmlMode: true });
    const title = $('entry > title').first().text().replace(/\s+/g, ' ').trim();
    const summary = $('entry > summary').first().text().replace(/\s+/g, ' ').trim();
    const authors = $('entry > author > name')
      .map((i: any, el: any) => $(el).text().trim())
      .get()
      .join(', ');
    const link = $('entry > id').first().text().trim();
    if (!title) return fail('arXiv ID topilmadi: ' + p.id);
    return md(
      '# ' + title + '\n\n**Mualliflar:** ' + authors + '\n**Link:** ' + link + '\n\n## Abstract\n\n' + summary,
    );
  },
});
