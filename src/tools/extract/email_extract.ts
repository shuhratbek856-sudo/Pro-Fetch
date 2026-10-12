import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_email_extract — Extract email addresses from a fetched page
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_email_extract',
  description: 'Extract email addresses from a fetched page',
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
    const emails = [...new Set(fr.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])];
    return result('# Email manzillar (' + emails.length + ')\n\n' + (emails.slice(0, 50).join('\n') || '(topilmadi)'));
  },
});
