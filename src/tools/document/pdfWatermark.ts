import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { StandardFonts, degrees, rgb, PDFDocument } from 'pdf-lib';
import { readBinarySource } from '../../core/binary-source.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
async function open(input: Record<string, unknown>, label: string): Promise<PDFDocument> {
  const bytes = await readBinarySource(input, label);
  // `updateMetadata: false` - pdf-lib otherwise rewrites ModDate on load, which changes a document the
  // caller asked to inspect rather than modify.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

async function save(
  pdf: PDFDocument,
  label: string,
  prefix: string,
): Promise<{ path: string; bytes: number; pages: number }> {
  const bytes = await pdf.save({ useObjectStreams: false });
  const directory = path.join(process.env.PRO_FETCH_OUTPUT_ROOT ?? '.', 'pdf-out');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${prefix}-${randomUUID()}.pdf`);
  await writeFile(target, bytes);
  return { path: target, bytes: bytes.length, pages: pdf.getPageCount() };
}

/** Parse "1-3,7,10-12" into [1,2,3,7,10,11,12], validating against the document. */
function parsePages(spec: string, pageCount: number, what = 'pages'): number[] {
  const out: number[] = [];
  for (const part of spec.split(',')) {
    const chunk = part.trim();
    if (!chunk) continue;
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < from || to > pageCount) {
        throw new Error(`${what}: ${chunk} diapazoni 1..${pageCount} oralig'ida emas.`);
      }
      for (let page = from; page <= to; page++) out.push(page);
      continue;
    }
    const single = Number(chunk);
    if (!Number.isInteger(single) || single < 1 || single > pageCount) {
      throw new Error(`${what}: "${chunk}" 1..${pageCount} oralig'ida emas.`);
    }
    out.push(single);
  }
  if (out.length === 0) throw new Error(`${what}: hech narsa ko'rsatilmagan.`);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------------------------

export const pdfWatermark = defineTool({
  name: 'pro_pdf_watermark',
  description: 'Har bir sahifaga matnli suv belgisi qo‘shish. Shaffoflik, burchak va o‘lcham sozlanadi.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      text: { type: 'string', description: 'Suv belgisi matni' },
      opacity: { type: 'number', description: 'Shaffoflik 0-1 (standart 0.25)' },
      angle: { type: 'number', description: 'Burchak, gradus (standart 45)' },
      font_size: { type: 'number', description: 'Shrift o‘lchami (standart 48)' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url', 'text'] }, { required: ['base64', 'text'] }],
  },
  async handler(input) {
    const p = view(input);
    const text = strOrEmpty(p, 'text').trim();
    if (!text) return fail('text talab qilinadi.');
    const opacity = Math.max(0.01, Math.min(1, num(p, 'opacity', 0.25, 0, 1)));
    const angle = num(p, 'angle', 45, -180, 180);
    const fontSize = Math.max(6, Math.min(200, num(p, 'font_size', 48, 6, 200)));

    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF watermark'), { updateMetadata: false });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const width = font.widthOfTextAtSize(text, fontSize);
      for (const page of pdf.getPages()) {
        const { width: pageWidth, height: pageHeight } = page.getSize();
        page.drawText(text, {
          x: (pageWidth - width) / 2,
          y: pageHeight / 2,
          size: fontSize,
          font,
          // Rotation about the drawn origin, so the mark sits at an angle across the page.
          rotate: degrees(angle),
          color: rgb(0.5, 0.5, 0.5),
          opacity,
        });
      }
      const saved = await save(pdf, 'watermark', 'watermarked');
      return jsonBlock('Suv belgisi qo‘shildi', { ...saved, text, opacity, angle, font_size: fontSize });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
