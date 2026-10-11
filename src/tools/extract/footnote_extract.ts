import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_footnote_extract — Extract footnotes and references from a page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_footnote_extract',
  description: 'Extract footnotes and references from a page',
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
    const notes: string[] = [];
    $('[class*="footnote"], [id*="footnote"], [class*="reference"]').each((i: any, el: AnyNode) => {
      if (i < 30) notes.push('- ' + $(el).text().replace(/\s+/g, ' ').trim());
    });
    const inline = [...new Set(fr.text.match(/\[\d+\]/g) ?? [])];
    return md(
      '# Izohlar\n\nInline havolalar: ' + inline.join(', ') + '\n\n' + (notes.join('\n') || '(izoh bloki topilmadi)'),
    );
  },
});
