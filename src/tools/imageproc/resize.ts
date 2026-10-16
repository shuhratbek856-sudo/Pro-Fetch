import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Write a processed image to a fresh file and report where it went.
 *
 * The name is generated rather than derived from the input: a caller-supplied name is a path traversal
 * waiting to happen and a collision waiting to overwrite something.
 */
async function saveImage(data: Buffer, extension: string): Promise<{ path: string; bytes: number }> {
  const directory = path.join(process.env.PRO_FETCH_OUTPUT_ROOT ?? '.', 'img-out');
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `img-${randomUUID()}.${extension}`);
  await writeFile(target, data);
  return { path: target, bytes: data.length };
}

/** The extension implied by a format, so a caller reading the path knows what they got. */
function extensionFor(format: string): string {
  return format === 'jpeg' || format === 'jpg' ? 'jpg' : format;
}

export default defineTool({
  name: 'pro_image_resize',
  description:
    'Rasmni o‘lchamini o‘zgartirish: kenglik/balandlik, qisqa tomon bo‘yicha masshtab, yoki aniq ' +
    'o‘lcham. Rasm formatini ham o‘zgartirish mumkin.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      width: { type: 'number', description: 'Kenglik, px' },
      height: { type: 'number', description: 'Balandlik, px' },
      fit: {
        type: 'string',
        enum: ['cover', 'contain', 'fill', 'inside', 'outside'],
        description: 'Masshtablash usuli (standart contain — hech qanday tomon kesilmaydi)',
      },
      format: {
        type: 'string',
        enum: ['png', 'jpeg', 'webp', 'avif', 'tiff', 'gif'],
        description: 'Chiqish formati (standart — manbaga saqlanadi)',
      },
      quality: { type: 'number', description: 'Sifat 1-100 (faqat jpeg/webp/avif uchun)' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const width = num(p, 'width', 0, 1, 20_000);
    const height = num(p, 'height', 0, 1, 20_000);
    if (width === 0 && height === 0) return fail('width yoki height bering — o‘lchamz o‘zgartirmaslik uchun.');

    try {
      // Loaded on demand, not imported at module scope. `sharp` is a large native module and pulling it
      // into every load of the server would tax startup for the tools that never touch an image; the
      // static verifier enforces this for the heavy modules.
      const { default: sharp } = await import('sharp');
      // `readBinarySource` is called here rather than through a helper: the schema audit resolves
      // property reads from the handler body, and a helper hides them.
      const source = await readBinarySource(input, 'Rasm o‘lchamlash');
      let pipeline = sharp(source);
      const fit = strOrEmpty(p, 'fit') || 'contain';
      pipeline = pipeline.resize({
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
        fit: fit as 'cover' | 'contain' | 'fill' | 'inside' | 'outside',
        // Without this, a resize to a larger size silently returns the original dimensions.
        withoutEnlargement: false,
      });

      const format = strOrEmpty(p, 'format');
      if (format) pipeline = pipeline.toFormat(format as 'png');
      const quality = num(p, 'quality', 0, 1, 100);
      if (quality > 0) pipeline = pipeline.toColorspace('srgb').withMetadata({});

      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(data, extensionFor(format || info.format || 'png'));
      return jsonBlock('O‘lchamlandi', {
        ...saved,
        source: { width: info.width ?? null, height: info.height ?? null, format: info.format ?? null },
        result: { width: data ? info.width : null, height: info.height, format: info.format ?? null },
      });
    } catch (error) {
      return fail(`O‘lchamlab bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
