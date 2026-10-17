import { defineTool } from '../../core/tool.js';
import { outputDir } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { rgb, PDFDocument } from 'pdf-lib';
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
  const directory = outputDir('pdf-out' as OutputKind);
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

// ---------------------------------------------------------------------------------------------

export const pdfBlank = defineTool({
  name: 'pro_pdf_blank',
  description:
    'Sahifalarni bo‘shatish yoki o‘chirish — tasodifiy kontentni tozalash uchun. `pages` bo‘sh ' +
    'bo‘lsa barcha sahifalar.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      pages: { type: 'string', description: 'Bo‘shatiladigan sahifalar: "1-3,7"' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }],
  },
  async handler(input) {
    const p = view(input);
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF blank'), { updateMetadata: false });
      const total = pdf.getPageCount();
      const spec = strOrEmpty(p, 'pages');
      const targets = spec ? parsePages(spec, total) : pdf.getPageIndices().map((index) => index + 1);

      // Drawing an opaque white rectangle over the content leaves the page objects intact, which is
      // what "blank the page" means. Deleting the pages would be a different operation and is a
      // separate tool.
      const { width, height } = pdf.getPage(targets[0] - 1).getSize();
      for (const pageNumber of targets) {
        const page = pdf.getPage(pageNumber - 1);
        const size = page.getSize();
        page.drawRectangle({
          x: 0,
          y: 0,
          width: size.width,
          height: size.height,
          color: rgb(1, 1, 1),
        });
      }
      const saved = await save(pdf, 'blank', 'blanked');
      return jsonBlock('Sahifalar bo‘shatildi', {
        ...saved,
        blanked: targets,
        first_page: { width: Math.round(width), height: Math.round(height) },
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
