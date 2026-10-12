import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_json_ld_extract — Extract JSON-LD structured data from a page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_json_ld_extract',
  description: 'Extract JSON-LD structured data from a page',
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
    const blocks: unknown[] = [];
    $('script[type="application/ld+json"]').each((i: any, el: AnyNode) => {
      try {
        blocks.push(JSON.parse($(el).text()));
      } catch {
        /* skip */
      }
    });
    if (!blocks.length) return fail('JSON-LD topilmadi');
    return jsonBlock('# JSON-LD (' + blocks.length + ' blok)', blocks);
  },
});
