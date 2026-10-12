import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_json_path — Query a JSON document via a dotted JSONPath
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_json_path',
  description: 'Query a JSON document via a dotted JSONPath',
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
    let obj: any;
    try {
      obj = JSON.parse(fr.text);
    } catch {
      return fail('Javob JSON emas');
    }
    const pathStr = String(p.selector ?? '').replace(/\[(\d+)\]/g, '.$1');
    let cur = obj;
    for (const part of pathStr.split('.').filter(Boolean)) cur = cur?.[part];
    if (cur === undefined) return fail('Path topilmadi: ' + pathStr);
    return jsonBlock('# ' + pathStr, cur);
  },
});
