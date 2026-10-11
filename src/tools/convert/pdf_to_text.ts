import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

async function extractPages(bytes: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item: unknown) => (item && typeof item === 'object' && 'str' in item ? String(item.str ?? '') : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    page.cleanup();
  }
  return pages;
}

/**
 * pro_fetch_pdf_to_text — Extract text from a PDF by URL
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_pdf_to_text',
  description: 'Extract text from a PDF by URL',
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
    const pages = await extractPages(await readBinarySource(input, 'PDF to text'));
    return result(pages.map((text, index) => `## Page ${index + 1}\n\n${text}`).join('\n\n'));
  },
});
