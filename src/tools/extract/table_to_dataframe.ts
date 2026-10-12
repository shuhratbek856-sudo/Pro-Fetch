import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_table_to_dataframe — Convert the first HTML table to structured rows
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import type { AnyNode } from 'domhandler';
import { sourceFrom } from '../../core/source-from.js';
export default defineTool({
  name: 'pro_fetch_table_to_dataframe',
  description: 'Convert the first HTML table to structured rows',
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
    const table = $('table').first();
    if (!table.length) return fail('Jadval topilmadi');
    const headers = table
      .find('tr')
      .first()
      .find('th,td')
      .map((i: any, el: AnyNode) => $(el).text().trim())
      .get();
    const rows: string[][] = [];
    table
      .find('tr')
      .slice(1)
      .each((i: any, tr: any) => {
        if (i < 20)
          rows.push(
            $(tr)
              .find('th,td')
              .map((j: any, td: any) => $(td).text().trim())
              .get(),
          );
      });
    return jsonBlock('# Jadval (' + rows.length + ' qator)', { headers, rows });
  },
});
