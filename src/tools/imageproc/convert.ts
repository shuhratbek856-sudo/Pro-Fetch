import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

async function saveImage(data: Buffer, extension: string): Promise<{ path: string; bytes: number }> {
  const directory = path.join(process.env.PRO_FETCH_OUTPUT_ROOT ?? '.', 'img-out');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `img-${randomUUID()}.${extension}`);
  await writeFile(target, data);
  return { path: target, bytes: data.length };
}

export default defineTool({
  name: 'pro_image_convert',
  description:
    'Rasm formatini o‘zgartirish (png/jpeg/webp/avif/tiff/gif/jp2) va sifatini boshqarish. ' +
    'O‘lcham va sifat berilsa, ikkalasi bir vaqtda qo‘llaniladi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      format: {
        type: 'string',
        // `jp2` was offered here and removed: the bundled libvips is built without the JPEG 2000 writer, so
        // every call failed with "JP2 output requires libvips with libimagequant/libheif" - an error about
        // a format the schema had promised. Advertising a capability the build does not have is the same
        // defect as reporting a provider ready when the guard will refuse it.
        enum: ['png', 'jpeg', 'webp', 'avif', 'tiff', 'gif'],
        description: 'Chiqish formati (majburiy — konvertatsiya nimaga ekanini aytish kerak)',
      },
      width: { type: 'number', description: 'Kenglik, px — berilsa o‘lcham ham o‘zgaradi' },
      height: { type: 'number', description: 'Balandlik, px' },
      quality: { type: 'number', description: 'Sifat 1-100 (jpeg/webp/avif uchun)' },
      lossless: { type: 'boolean', description: 'WebP/AVIF uchun lossless rejim' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    required: ['format'],
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const format = strOrEmpty(p, 'format');
    if (!format) return fail('format kerak — nimaga o‘zgartirmoqchi ekaningizni ayting.');

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Rasm konvertatsiyasi');
      const meta = await sharp(source).metadata();
      // Kept as a plain string rather than sharp's narrow format union: the comparisons below are
      // the point of the variable, and casting to the union made them type errors, which is a hint the
      // cast was lying about the range of values `format` can actually hold.
      const target = format;

      let pipeline = sharp(source);
      // `toFormat` is reached through a cast rather than by narrowing `target` to sharp's format
      // union: the union makes the comparisons below unreachable to the type checker, and those
      // comparisons decide whether quality and lossless are applied at all.
      const toFormat = (fmt: string, opts?: { quality?: number; lossless?: boolean }) =>
        (
          pipeline as unknown as {
            toFormat(f: string, o?: unknown): typeof pipeline;
          }
        ).toFormat(fmt, opts);
      const width = num(p, 'width', 0, 1, 20_000);
      const height = num(p, 'height', 0, 1, 20_000);
      if (width > 0 || height > 0) {
        pipeline = pipeline.resize({
          ...(width ? { width } : {}),
          ...(height ? { height } : {}),
          fit: 'contain',
        });
      }

      const quality = num(p, 'quality', 0, 1, 100);
      const lossless = p.lossless === true || String(p.lossless ?? '') === 'true';
      // Quality is only meaningful for the formats that compress lossily. Passing it to png would
      // be silently ignored, so it is applied only where it changes the output.
      const lossy = target === 'jpeg' || target === 'webp' || target === 'avif';
      if (lossy && quality > 0) pipeline = toFormat(target, { quality: Math.round(quality) });
      else if ((target === 'webp' || target === 'avif') && lossless) pipeline = toFormat(target, { lossless: true });
      else pipeline = toFormat(target);

      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(data, target === 'jpeg' ? 'jpg' : target);

      return jsonBlock('O‘zgartirildi', {
        ...saved,
        source: {
          width: meta.width ?? null,
          height: meta.height ?? null,
          format: meta.format ?? null,
          bytes: source.length,
        },
        result: {
          width: info.width ?? null,
          height: info.height ?? null,
          format: info.format ?? null,
          bytes: data.length,
        },
        // A caller converting to a smaller format needs to know whether it helped. A silent
        // size comparison would let a regression hide behind a successful conversion.
        saved_percent: source.length > 0 ? Math.round(((source.length - data.length) / source.length) * 100) : null,
        ...(lossy && quality > 0 ? { quality: Math.round(quality) } : {}),
      });
    } catch (error) {
      return fail(`O‘zgartirib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
