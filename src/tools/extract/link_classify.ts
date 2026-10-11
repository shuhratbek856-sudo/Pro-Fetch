import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_link_classify — Classify links as internal external download or social
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_link_classify',
  description: 'Classify links as internal external download or social',
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
    const base = new URL(String(p.url));
    const internal: string[] = [];
    const external: string[] = [];
    const downloads: string[] = [];
    $('a[href]').each((i: any, el: AnyNode) => {
      const href = $(el).attr('href') ?? '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      try {
        const u = new URL(href, base);
        if (u.hostname === base.hostname) internal.push(u.toString());
        else external.push(u.toString());
        if (/\.(zip|pdf|tar\.gz|dmg|exe|deb|rpm)$/i.test(u.pathname)) downloads.push(u.toString());
      } catch {
        /* noto'g'ri href */
      }
    });
    return jsonBlock('# Havolalar', {
      internal: internal.length,
      external: external.length,
      downloads: [...new Set(downloads)].slice(0, 20),
      sample_internal: internal.slice(0, 15),
      sample_external: external.slice(0, 15),
    });
  },
});
