import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_schema_org_extract — Extract schema.org metadata from a page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_schema_org_extract',
  description: 'Extract schema.org metadata from a page',
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
    const out: Record<string, unknown> = {};
    $('meta[name^="twitter:"], meta[property^="og:"]').each((i: any, el: AnyNode) => {
      const name = $(el).attr('name') ?? $(el).attr('property') ?? '';
      out[name] = $(el).attr('content');
    });
    $('[itemtype]').each((i: any, el: AnyNode) => {
      if (i < 5) out['itemtype_' + i] = $(el).attr('itemtype');
    });
    return jsonBlock('# Meta / schema.org', out);
  },
});
