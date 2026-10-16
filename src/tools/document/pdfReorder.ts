import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { PDFDocument } from 'pdf-lib';
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

export const pdfReorder = defineTool({
  name: 'pro_pdf_reorder',
  description: 'Sahifalarni ko‘chirish: `order` — yangi tartib, 1-based sahifa raqamlari.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      order: { type: 'string', description: 'Yangi tartib: "3,1,2" yoki "5,4,3,2,1"' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url', 'order'] }, { required: ['base64', 'order'] }],
  },
  async handler(input) {
    const p = view(input);
    try {
      const source = await PDFDocument.load(await readBinarySource(input, 'PDF reorder'), { updateMetadata: false });
      const total = source.getPageCount();
      const order = parsePages(strOrEmpty(p, 'order'), total, 'Tartib');
      // A reorder that silently drops a page would look like a success; the count is checked instead.
      if (order.length !== total) {
        return fail(
          `Tartib ${order.length} ta sahifa beradi, PDF da ${total} ta. Har bir sahifa bir marta ko‘rinishi kerak.`,
        );
      }
      const target = await PDFDocument.create();
      const copied = await target.copyPages(
        source,
        order.map((page) => page - 1),
      );
      for (const page of copied) target.addPage(page);
      const saved = await save(target, 'reorder', 'reordered');
      return jsonBlock('Tartib o‘zgartirildi', { ...saved, order });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
