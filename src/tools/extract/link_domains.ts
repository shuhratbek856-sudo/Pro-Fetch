import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_link_domains — List unique hostnames linked from HTML
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_link_domains',
  description: 'List unique hostnames linked from HTML',
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
    const base = $('base').attr('href') || 'http://example.com/';
    const hosts = new Set<string>();
    $('a[href]').each((i: number, el: AnyNode) => {
      try {
        const h = new URL($(el).attr('href') || '', base);
        if (h.protocol === 'http:' || h.protocol === 'https:') hosts.add(h.hostname);
      } catch {
        /* skip */
      }
    });
    return jsonBlock('# Link domains', { count: hosts.size, domains: [...hosts].sort().slice(0, 300) });
  },
});
