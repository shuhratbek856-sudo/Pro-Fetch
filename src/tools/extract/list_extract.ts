import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_list_extract — Extract ordered and unordered lists from HTML
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_list_extract',
  description: 'Extract ordered and unordered lists from HTML',
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
    const lists: unknown[] = [];
    $('ul, ol').each((i: any, ul: any) => {
      if (i >= 10) return;
      const items = $(ul)
        .children('li')
        .map((j: any, li: any) => $(li).text().replace(/\s+/g, ' ').trim())
        .get()
        .slice(0, 20);
      if (items.length) lists.push({ type: (ul as any).tagName, items });
    });
    return jsonBlock("# Ro'yxatlar (" + lists.length + ')', lists);
  },
});
