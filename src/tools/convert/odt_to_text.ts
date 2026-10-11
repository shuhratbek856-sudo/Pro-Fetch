import { defineTool } from '../../core/tool.js';
import JSZip from 'jszip';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

/**
 * pro_fetch_odt_to_text — Extract text from an ODT document
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_odt_to_text',
  description: 'Extract text from an ODT document',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "ODT faylining URL'i" },
      base64: { type: 'string', description: "ODT faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta ODT hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const zip = await JSZip.loadAsync(await readBinarySource(input, 'ODT to text'));
    const contentXml = await zip.file('content.xml')?.async('text');
    if (!contentXml) throw new Error('ODT content.xml topilmadi.');
    const $ = load(contentXml, { xmlMode: true });
    const output: string[] = [];
    $('text\\:h,text\\:p,text\\:list-item').each((_index, node) => {
      const element = $(node);
      const value = element.text().replace(/\s+/g, ' ').trim();
      if (!value) return;
      if (node.name === 'text:h') {
        const level = Math.max(1, Math.min(6, Number(element.attr('text:outline-level') ?? 1)));
        output.push(`${'#'.repeat(level)} ${value}`);
      } else if (node.name === 'text:list-item') output.push(`- ${value}`);
      else output.push(value);
    });
    return result(output.join('\n\n'));
  },
});
