import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { PDFDocument } from 'pdf-lib';
import { readBinarySource } from '../../core/binary-source.js';
import { num, strOrEmpty, view } from '../../core/input.js';
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

export const pdfMerge = defineTool({
  name: 'pro_pdf_merge',
  description:
    'Bir nechta PDF ni bittaga birlashtirish. Har bir manba uchun url yoki base64. Manbalar ' +
    'berilgan tartibda joylashtiriladi.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      sources: {
        type: 'array',
        description: "Manbalar ro'yxati: [{ url | base64 }]",
        items: { type: 'object' },
      },
      urls: { type: 'array', description: "URL lar ro'yxati (sodda holat)", items: { type: 'string' } },
    },
    required: ['sources'],
  },
  async handler(input) {
    const p = view(input);
    const sources = Array.isArray(p.sources) ? p.sources : [];
    const urls = Array.isArray(p.urls) ? p.urls : [];
    if (sources.length === 0 && urls.length === 0) {
      return fail('sources yoki urls bo‘sh.');
    }
    const entries: Array<Record<string, unknown>> = [
      ...urls.map((url) => ({ url: String(url) })),
      ...sources.map((entry) => entry as Record<string, unknown>),
    ].filter((entry: Record<string, unknown>) => entry.url || entry.base64);

    try {
      const merged = await PDFDocument.create();
      const report: Array<{ index: number; pages: number; source: string }> = [];
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index];
        const source = entry.url
          ? await readBinarySource({ url: String(entry.url) }, `PDF merge #${index + 1}`)
          : Buffer.from(String(entry.base64), 'base64');
        const part = await PDFDocument.load(source, { updateMetadata: false });
        const copied = await merged.copyPages(part, part.getPageIndices());
        for (const page of copied) merged.addPage(page);
        report.push({
          index: index + 1,
          pages: part.getPageCount(),
          source: entry.url ? String(entry.url) : 'base64',
        });
      }
      if (merged.getPageCount() === 0) return fail('Birlashtirish uchun sahifa topilmadi.');
      const saved = await save(merged, 'merge', 'merged');
      return jsonBlock('Birlashtirilgan PDF', {
        ...saved,
        inputs: entries.length,
        detail: report,
      });
    } catch (error) {
      return fail(`Birlashtirib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
