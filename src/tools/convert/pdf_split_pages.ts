import { defineTool } from '../../core/tool.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

/**
 * pro_fetch_pdf_split_pages — Split a PDF into page ranges and extract selected pages
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_pdf_split_pages',
  description: 'Split a PDF into page ranges and extract selected pages',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "PDF faylining URL'i" },
      base64: { type: 'string', description: "PDF faylining base64 ma'lumoti" },
      start_page: { type: 'number', description: 'Birinchi page (1-based, default 1)' },
      end_page: { type: 'number', description: 'Oxirgi page (1-based, default oxirgi page)' },
      max_bytes: { type: 'number', description: 'Eng katta PDF hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const source = await readBinarySource(input, 'PDF split');
    const pdf = await PDFDocument.load(source, { updateMetadata: false });
    const pageCount = pdf.getPageCount();
    const startValue = Number(input.start_page ?? 1);
    const endValue = Number(input.end_page ?? pageCount);
    if (
      !Number.isInteger(startValue) ||
      !Number.isInteger(endValue) ||
      startValue < 1 ||
      endValue < startValue ||
      endValue > pageCount
    ) {
      throw new Error(`Page range 1..${pageCount} oralig‘ida bo‘lishi kerak (start_page <= end_page).`);
    }
    const outputDirectory = path.join(os.tmpdir(), 'pro-fetch-mcp', 'pdf-pages');
    await mkdir(outputDirectory, { recursive: true });
    const files: string[] = [];
    for (let pageNumber = startValue; pageNumber <= endValue; pageNumber++) {
      const part = await PDFDocument.create();
      const [page] = await part.copyPages(pdf, [pageNumber - 1]);
      part.addPage(page);
      const filePath = path.join(outputDirectory, `page-${pageNumber}-${randomUUID()}.pdf`);
      await writeFile(filePath, await part.save());
      files.push(filePath);
    }
    return result(JSON.stringify({ totalPages: pageCount, startPage: startValue, endPage: endValue, files }, null, 2));
  },
});
