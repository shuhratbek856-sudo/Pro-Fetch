import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_comment_strip — Remove code comments from fetched source text
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_comment_strip',
  description: 'Remove code comments from fetched source text',
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
    const stripped = fr.text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(^|\s)#[^\n]*/g, '$1');
    return md('# Izohlar olib tashlandi (' + (fr.text.length - stripped.length) + ' belgi)\n\n' + stripped);
  },
});
