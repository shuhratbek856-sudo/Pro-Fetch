import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { degrees, PDFDocument } from 'pdf-lib';
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

// ---------------------------------------------------------------------------------------------

export const pdfRotate = defineTool({
  name: 'pro_pdf_rotate',
  description: 'Sahifalarni aylantirish. `degrees` 90/180/270. Sahifalar bo‘sh bo‘lsa — hammasi.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      degrees: { type: 'number', description: '90, 180 yoki 270' },
      pages: { type: 'string', description: 'Qaysi sahifalar: "1-3,7". Bo‘sh — hammasi.' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const angle = num(p, 'degrees', 90, 1, 359);
    if (![90, 180, 270].includes(angle)) {
      return fail('degrees 90, 180 yoki 270 bo‘lishi kerak.');
    }
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF rotate'), { updateMetadata: false });
      const total = pdf.getPageCount();
      const spec = strOrEmpty(p, 'pages');
      const targets = spec ? parsePages(spec, total) : pdf.getPageIndices().map((index) => index + 1);
      // Read the existing rotation first and add to it, so rotating twice by 90 is a half turn rather
      // than a no-op.
      for (const pageNumber of targets) {
        const page = pdf.getPage(pageNumber - 1);
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + angle) % 360));
      }
      const saved = await save(pdf, 'rotate', 'rotated');
      return jsonBlock('Aylantirilgan PDF', { ...saved, rotated: targets, degrees: angle });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
