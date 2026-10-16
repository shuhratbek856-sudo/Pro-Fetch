import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { StandardFonts, rgb, PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
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

export const pdfNew = defineTool({
  name: 'pro_pdf_new',
  description:
    'Bo‘sh PDF yaratish. Sahifa o‘lchamlari A4/Letter/A3/Legal yoki millimetrda. Ixtiyoriy ' + 'sarlavha matni bilan.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['a4', 'letter', 'a3', 'legal', 'custom'],
        description: 'Sahifa formati (standart a4)',
      },
      width_mm: { type: 'number', description: 'custom formatda kenglik, mm' },
      height_mm: { type: 'number', description: 'custom formatda balandlik, mm' },
      pages: { type: 'number', description: 'Sahifalar soni (standart 1)' },
      title: { type: 'string', description: 'Sarlavha (sahifaga yoziladi)' },
    },
  },
  async handler(input) {
    const p = view(input);
    const FORMATS: Record<string, [number, number]> = {
      // PDF points: 1 mm = 72/25.4 pt.
      a4: [210, 297],
      letter: [215.9, 279.4],
      a3: [297, 420],
      legal: [215.9, 355.6],
    };
    try {
      const format = strOrEmpty(p, 'format') || 'a4';
      const mm =
        format === 'custom' ? [num(p, 'width_mm', 210, 10, 5000), num(p, 'height_mm', 297, 10, 5000)] : FORMATS[format];
      if (!mm) return fail(`Noma'lum format: "${format}". a4, letter, a3, legal, custom.`);
      const [widthMm, heightMm] = mm;
      const count = Math.max(1, Math.min(5000, num(p, 'pages', 1, 1, 5000)));

      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.HelveticaBold);
      for (let index = 0; index < count; index++) {
        const page = pdf.addPage([widthMm * (72 / 25.4), heightMm * (72 / 25.4)]);
        const title = strOrEmpty(p, 'title');
        if (title) {
          page.drawText(title, {
            x: 56,
            y: heightMm * (72 / 25.4) - 72,
            size: 18,
            font,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
      }
      pdf.setProducer('pro-fetch');
      const saved = await save(pdf, 'new', 'new');
      return jsonBlock('Yangi PDF yaratildi', { ...saved, format, width_mm: widthMm, height_mm: heightMm });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
