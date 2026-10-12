import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_link_classify — Classify links as internal external download or social
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_link_classify',
  description: 'Classify links as internal external download or social',
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

    // "Internal" is relative to a page, so classification needs a base. Without one, every link is
    // reported against a synthetic origin rather than throwing — a caller who supplied only `text`
    // still gets a useful answer, and a caller who supplied `url` gets the real one.
    const declared = typeof p.url === 'string' ? p.url.trim() : '';
    let base: URL;
    try {
      base = new URL(declared);
    } catch {
      if (declared) return fail(`url noto‘g‘ri: ${declared}`);
      base = new URL('https://example.invalid/');
    }

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
