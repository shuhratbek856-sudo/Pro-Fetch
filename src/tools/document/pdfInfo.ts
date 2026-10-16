import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { PDFDocument } from 'pdf-lib';
import { readBinarySource } from '../../core/binary-source.js';
async function open(input: Record<string, unknown>, label: string): Promise<PDFDocument> {
  const bytes = await readBinarySource(input, label);
  // `updateMetadata: false` - pdf-lib otherwise rewrites ModDate on load, which changes a document the
  // caller asked to inspect rather than modify.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

export const pdfInfo = defineTool({
  name: 'pro_pdf_info',
  description:
    'PDF haqida ma’lumot: sahifalar soni, o‘lcham, metadata, shakllar, bandlar, xavfsizlik. ' +
    'pdf-lib parol bilan himoyalashni qo‘llamaydi — shu sababli shu yo‘nalishda tool yo‘q.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }],
  },
  async handler(input) {
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF info'), { updateMetadata: false });
      const pages = pdf.getPages();
      const sizes = pages.map((page) => {
        const { width, height } = page.getSize();
        return { width: Math.round(width), height: Math.round(height) };
      });
      const form = pdf.getForm();
      return jsonBlock('PDF ma’lumoti', {
        pages: pdf.getPageCount(),
        encrypted: pdf.isEncrypted,
        form_fields: form.getFields().length,
        page_sizes: sizes.length > 10 ? sizes.slice(0, 10) : sizes,
        title: pdf.getTitle() || null,
        author: pdf.getAuthor() || null,
        subject: pdf.getSubject() || null,
        keywords: pdf.getKeywords() || null,
        producer: pdf.getProducer() || null,
        creator: pdf.getCreator() || null,
        creation_date: pdf.getCreationDate()?.toISOString() ?? null,
        modification_date: pdf.getModificationDate()?.toISOString() ?? null,
        note: "pdf-lib parol bilan himoyalashni qo'llamaydi; shu sababli encrypt tool yo'q.",
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
