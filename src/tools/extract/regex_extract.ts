import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_regex_extract — Extract all regex matches from a fetched page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_regex_extract',
  description: 'Extract all regex matches from a fetched page',
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
    let re: RegExp;
    try {
      re = new RegExp(String(p.selector), 'g');
    } catch (e) {
      return fail('Regex xato: ' + (e as Error).message);
    }
    const matches = fr.text.match(re) ?? [];
    if (!matches.length) return fail('Moslama topilmadi');
    return md(
      '# Regex: ' +
        p.selector +
        ' — ' +
        matches.length +
        ' moslama\n\n' +
        matches
          .slice(0, 100)
          .map((m, i) => i + 1 + '. ' + m)
          .join('\n'),
    );
  },
});
