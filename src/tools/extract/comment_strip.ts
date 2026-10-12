import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_comment_strip — Remove code comments from fetched source text
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_comment_strip',
  description: 'Remove code comments from fetched source text',
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
    const stripped = fr.text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|\s)\/\/[^\n]*/g, '$1')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(^|\s)#[^\n]*/g, '$1');
    return md('# Izohlar olib tashlandi (' + (fr.text.length - stripped.length) + ' belgi)\n\n' + stripped);
  },
});
