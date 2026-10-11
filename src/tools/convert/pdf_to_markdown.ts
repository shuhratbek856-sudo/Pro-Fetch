import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

async function extractPdfMarkdown(bytes: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const sections: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => (item && typeof item === 'object' && 'str' in item ? String(item.str ?? '') : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    sections.push(`## Page ${pageNumber}\n\n${text}`);
    page.cleanup();
  }
  return sections.join('\n\n');
}

/**
 * pro_fetch_pdf_to_markdown — Convert PDF to Markdown with structure preserved
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_pdf_to_markdown',
  description: 'Convert PDF to Markdown with structure preserved',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "PDF faylining URL'i" },
      base64: { type: 'string', description: "PDF faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta PDF hajmi, byte (max 100 MiB)' },
      timeout_ms: { type: 'number', description: 'Download timeout millisekundda' },
    },
    required: ['url'],
  },
  async handler(input) {
    return result(await extractPdfMarkdown(await readBinarySource(input, 'PDF to Markdown')));
  },
});
