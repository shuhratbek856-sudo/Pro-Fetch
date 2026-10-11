import { defineTool } from '../../core/tool.js';
import JSZip from 'jszip';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

function docxMarkdown(xml: string): string {
  const $ = load(xml, { xmlMode: true });
  const blocks = $('w\\:p')
    .toArray()
    .map((paragraph) => {
      const block = $(paragraph);
      const style = block.find('w\\:pPr > w\\:pStyle').attr('w:val') ?? '';
      const runs = block
        .children('w\\:r')
        .toArray()
        .map((run) => {
          const item = $(run);
          let text = item
            .find('w\\:t')
            .toArray()
            .map((node) => $(node).text())
            .join('');
          if (item.find('w\\:tab').length) text = text.replace(/\t/g, '    ');
          if (item.find('w\\:b').length) text = `**${text}**`;
          if (item.find('w\\:i').length) text = `*${text}*`;
          return text;
        })
        .join('');
      const value = runs.trim();
      if (!value) return '';
      const heading = style.match(/^Heading([1-6])$/i);
      if (heading) return `${'#'.repeat(Number(heading[1]))} ${value}`;
      if (style === 'Title') return `# ${value}`;
      if (block.find('w\\:numPr').length) return `- ${value}`;
      return value;
    })
    .filter(Boolean);
  return blocks.join('\n\n');
}

/**
 * pro_fetch_docx_to_markdown — Convert a DOCX document to Markdown
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_docx_to_markdown',
  description: 'Convert a DOCX document to Markdown',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "DOCX faylining URL'i" },
      base64: { type: 'string', description: "DOCX faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta DOCX hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const zip = await JSZip.loadAsync(await readBinarySource(input, 'DOCX to Markdown'));
    const document = await zip.file('word/document.xml')?.async('text');
    if (!document) throw new Error('DOCX package ichida word/document.xml topilmadi.');
    return result(docxMarkdown(document));
  },
});
