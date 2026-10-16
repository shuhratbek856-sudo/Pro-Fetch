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

export const pdfFormFill = defineTool({
  name: 'pro_pdf_form_fill',
  description:
    'PDF formadagi maydonlarni to‘ldirish. `fields` — [{ name, value }]. Checkbox uchun `value: true|false`.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      fields: {
        type: 'array',
        description: 'Maydonlar: [{ name, value }]',
        items: { type: 'object' },
      },
      flatten: { type: 'boolean', description: 'To‘ldirilgandan keyin maydonlarni yopish' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    required: ['url', 'fields'],
  },
  async handler(input) {
    const p = view(input);
    const entries = Array.isArray(p.fields) ? p.fields : [];
    if (entries.length === 0) return fail('fields bo‘sh.');
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF form fill'), { updateMetadata: false });
      const form = pdf.getForm();
      const names = form.getFields().map((field) => field.getName());
      const filled: string[] = [];
      const unknown: string[] = [];

      for (const entry of entries) {
        const record = entry as Record<string, unknown>;
        const name = strOrEmpty(record, 'name');
        if (!name || !names.includes(name)) {
          unknown.push(name || '(bo‘sh nom)');
          continue;
        }
        const field = form.getField(name);
        const value = record.value;
        try {
          if (typeof (field as { check?: unknown }).check === 'function') {
            (field as unknown as { check(): void; uncheck(): void }).check();
          } else if (typeof (field as { setText?: unknown }).setText === 'function') {
            (field as unknown as { setText(v: string): void }).setText(String(value ?? ''));
          } else if (typeof (field as { select?: unknown }).select === 'function') {
            (field as unknown as { select(v: string): void }).select(String(value ?? ''));
          } else {
            unknown.push(name);
            continue;
          }
          filled.push(name);
        } catch (error) {
          unknown.push(`${name} (${error instanceof Error ? error.message : 'xato'})`);
        }
      }
      if (filled.length === 0) return fail('Hech bir maydon to‘ldirilmadi.');
      if (p.flatten === true) form.flatten();
      const saved = await save(pdf, 'form fill', 'filled');
      return jsonBlock('Forma to‘ldirildi', {
        ...saved,
        filled: filled.length,
        skipped: unknown,
        flattened: p.flatten === true,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
