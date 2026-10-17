import { defineTool } from '../../core/tool.js';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';
import { outputDir } from '../../core/output-dir.js';

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
    // Checked by `outputDir` itself, before the document is fetched: splitting writes one file per page
    // and every one of them lands in a directory this call asks for. Measured: with the write going to
    // the system temporary directory instead, this tool was classified read-only, refused nothing, and
    // returned `isError: false` while writing outside the output root - the one tool the read-only audit
    // could not account for, because `os.tmpdir()` is not a path this project can reason about.
    const outputDirectory = outputDir('pdf-out');
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
    await mkdir(outputDirectory, { recursive: true });
    const files: string[] = [];
    for (let pageNumber = startValue; pageNumber <= endValue; pageNumber += 1) {
      const part = await PDFDocument.create();
      const [page] = await part.copyPages(pdf, [pageNumber - 1]);
      part.addPage(page as never);
      const filePath = path.join(outputDirectory, `page-${pageNumber}-${randomUUID()}.pdf`);
      await writeFile(filePath, await part.save());
      files.push(filePath);
    }
    return result(JSON.stringify({ totalPages: pageCount, startPage: startValue, endPage: endValue, files }, null, 2));
  },
});
