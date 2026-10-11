import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_heading_outline — Build a heading outline (h1-h6) from HTML
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_heading_outline',
  description: 'Build a heading outline (h1-h6) from HTML',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      text: { type: 'string', description: 'Inline HTML/matn' },
      content: { type: 'string', description: 'Inline HTML (text alternativi)' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    let html = String(p.text ?? p.content ?? '');
    if (!html && p.url) {
      const fr = await fetchWithOptions(String(p.url));
      html = fr.text;
    }
    if (!html) return fail('text, content yoki url kerak.');
    const $ = (await import('cheerio')).load(html);
    const items: Array<{ level: number; text: string }> = [];
    $('h1,h2,h3,h4,h5,h6')
      .slice(0, 200)
      .each((_i, el) => {
        items.push({
          level: Number(String(el.tagName).replace('h', '')),
          text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120),
        });
      });
    return jsonBlock('# Heading outline', { count: items.length, outline: items });
  },
});
