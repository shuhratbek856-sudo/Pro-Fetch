import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_hreflang_extract — Extract hreflang alternate links from HTML
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_hreflang_extract',
  description: 'Extract hreflang alternate links from HTML',
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
    const items: any[] = [];
    $('link[rel="alternate"][hreflang],a[hreflang]')
      .slice(0, 200)
      .each((i: number, el: AnyNode) => {
        items.push({ hreflang: $(el).attr('hreflang') || '', href: $(el).attr('href') || '' });
      });
    return jsonBlock('# Hreflang alternates', { count: items.length, alternates: items });
  },
});
