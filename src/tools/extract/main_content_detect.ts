import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_main_content_detect — Detect and isolate the main content block of a page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_main_content_detect',
  description: 'Detect and isolate the main content block of a page',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Oldindan yuklangan HTML/matn. Berilsa, tarmoq so‘rovi qilinmaydi' },
      url: { type: 'string', description: 'Manzil (URL)' },
      selector: { type: 'string', description: 'CSS selektor / regex / JSONPath' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const fr = await sourceFrom(p);
    const $ = (await import('cheerio')).load(fr.text);
    $('script, style, nav, footer, aside, header, noscript').remove();
    let best = '';
    let bestSel = '';
    for (const sel of ['article', 'main', '[role="main"]', 'body']) {
      const t = $(sel).first().text().replace(/\s+/g, ' ').trim();
      if (t.length > best.length) {
        best = t;
        bestSel = sel;
      }
    }
    return md('# Asosiy kontent (' + bestSel + ')\n\n' + best);
  },
});
