import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_form_extract — Extract forms and input fields from a page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
export default defineTool({
  name: 'pro_fetch_form_extract',
  description: 'Extract forms and input fields from a page',
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
    const forms: unknown[] = [];
    $('form').each((i: any, f: any) => {
      const fields = $(f)
        .find('input, select, textarea')
        .map((j: any, el: AnyNode) => ({
          tag: (el as any).tagName,
          type: $(el).attr('type') ?? '',
          name: $(el).attr('name') ?? '',
          required: $(el).attr('required') !== undefined,
        }))
        .get();
      forms.push({ action: $(f).attr('action') ?? '', method: $(f).attr('method') ?? 'get', fields });
    });
    if (!forms.length) return fail('Forma topilmadi');
    return jsonBlock('# Formalar (' + forms.length + ')', forms);
  },
});
