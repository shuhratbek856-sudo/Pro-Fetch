import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_meta_og_extract — Extract Open Graph and Twitter card metadata from HTML
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_meta_og_extract',
  description: 'Extract Open Graph and Twitter card metadata from HTML',
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
    const out: Record<string, string> = {};
    $('meta[property^="og:"],meta[name^="og:"]').each((i: number, el: AnyNode) => {
      const k = $(el).attr('property') || $(el).attr('name');
      if (k) out[k] = $(el).attr('content') || '';
    });
    $('meta[name^="twitter:"]').each((i: number, el: AnyNode) => {
      const k = $(el).attr('name');
      if (k) out[k] = $(el).attr('content') || '';
    });
    return jsonBlock('# Open Graph / Twitter meta', out);
  },
});
