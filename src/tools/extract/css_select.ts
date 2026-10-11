import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_css_select — Select elements from HTML via a CSS selector
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_css_select',
  description: 'Select elements from HTML via a CSS selector',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      selector: { type: 'string', description: 'CSS selektor / regex / JSONPath' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const fr = await fetchWithOptions(String(p.url));
    const $ = (await import('cheerio')).load(fr.text);
    const sel = String(p.selector ?? '*');
    const els = $(sel);
    if (!els.length) return fail("Selektor bo'sh natija berdi: " + sel);
    const items: string[] = [];
    els.each((i: any, el: AnyNode) => {
      if (i < 50) items.push('- ' + $(el).text().replace(/\s+/g, ' ').trim());
    });
    return md('# ' + sel + ' — ' + els.length + ' element\n\n' + items.join('\n'));
  },
});
