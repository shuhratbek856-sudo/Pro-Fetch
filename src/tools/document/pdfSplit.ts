import { defineTool } from '../../core/tool.js';
import { outputDir } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertWritable } from '../../core/read-only-guard.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { PDFDocument } from 'pdf-lib';
import { readBinarySource } from '../../core/binary-source.js';
async function open(input: Record<string, unknown>, label: string): Promise<PDFDocument> {
  const bytes = await readBinarySource(input, label);
  // `updateMetadata: false` - pdf-lib otherwise rewrites ModDate on load, which changes a document the
  // caller asked to inspect rather than modify.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

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

export const pdfSplit = defineTool({
  name: 'pro_pdf_split',
  description:
    'PDF ni sahifalar bo‘yicha bo‘lish: har bir sahifa alohida fayl, yoki `pages` bilan tanlangan ' +
    'qismni bitta faylga ajratish.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      pages: { type: 'string', description: 'Ajratiladigan sahifalar: "1-3,7"' },
      every: { type: 'boolean', description: 'Har bir sahifani alohida faylga ajratish' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }],
  },
  async handler(input) {
    const p = view(input);
    // Checked before the document is fetched. Splitting writes one file per page, so under read-only
    // mode the whole operation is refused rather than half-completed - and refusing it first means a
    // refused call costs nothing. Measured: with this check after the fetch, the call answered
    // "Download HTTP 404": it had already paid for a request before discovering it could not finish.
    //
    // The check lives in the handler rather than in the tool's name, because `pdf_split` reads as a
    // read operation and a name cannot tell you whether the call writes.
    assertWritable('PDF sahifalarini ajratish');
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF split'), { updateMetadata: false });
      const total = pdf.getPageCount();
      const every = p.every === true;
      const spec = strOrEmpty(p, 'pages');

      if (!every && !spec) {
        return fail('`every: true` yoki `pages` ko‘rsating — nimani ajratishni aytish kerak.');
      }

      const directory = outputDir('pdf-out' as OutputKind);
      await mkdir(directory, { recursive: true });
      const stem = randomUUID();
      const written: string[] = [];

      if (every) {
        for (let index = 0; index < total; index++) {
          const single = await PDFDocument.create();
          const [page] = await single.copyPages(pdf, [index]);
          single.addPage(page);
          const bytes = await single.save();
          const target = path.join(directory, `split-${stem}-p${index + 1}.pdf`);
          await writeFile(target, bytes);
          written.push(target);
        }
        return jsonBlock('Har bir sahifa alohida', {
          source_pages: total,
          files: written.length,
          paths: written,
        });
      }

      const wanted = parsePages(spec, total);
      const subset = await PDFDocument.create();
      const copied = await subset.copyPages(
        pdf,
        wanted.map((page) => page - 1),
      );
      for (const page of copied) subset.addPage(page);
      const target = path.join(directory, `split-${stem}.pdf`);
      await writeFile(target, await subset.save());
      written.push(target);
      return jsonBlock('Ajratilgan qism', {
        source_pages: total,
        selected: wanted,
        files: written.length,
        paths: written,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
