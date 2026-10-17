import { defineTool } from '../../core/tool.js';
import { outputDir } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

async function saveImage(data: Buffer, extension: string): Promise<{ path: string; bytes: number }> {
  const directory = outputDir('img-out' as OutputKind);
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `img-${randomUUID()}.${extension}`);
  await writeFile(target, data);
  return { path: target, bytes: data.length };
}

export default defineTool({
  name: 'pro_image_crop',
  description:
    'Rasmni qirqish: aniq koordinatalar (left/top/width/height) yoki foizlar. Rasm chegaradan ' +
    'kichik bo‘lsa, koordinatlar chegaraga sig‘adigan qilib moslanadi va natija aytiladi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      left: { type: 'number', description: 'Chap chegarasi, px yoki %' },
      top: { type: 'number', description: 'Yuqori chegarasi, px yoki %' },
      width: { type: 'number', description: 'Kenglik, px yoki %' },
      height: { type: 'number', description: 'Balandlik, px yoki %' },
      unit: { type: 'string', enum: ['px', 'percent'], description: 'Birlik (standart px)' },
      format: { type: 'string', description: 'Chiqish formati — manbaga saqlanadi' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const width = num(p, 'width', 0, 1, 100_000);
    const height = num(p, 'height', 0, 1, 100_000);
    if (width === 0 || height === 0) return fail('width va height kerak — nimani qirqish kerak.');

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Rasm qirqish');
      const meta = await sharp(source).metadata();
      const srcWidth = meta.width ?? 0;
      const srcHeight = meta.height ?? 0;
      if (srcWidth === 0 || srcHeight === 0) {
        return fail(`Manba o‘lchami aniqlanmadi: ${srcWidth}x${srcHeight}.`);
      }

      const percent = strOrEmpty(p, 'unit') === 'percent';
      // Percentages resolve against the source, not against a guessed size. Resolving them against
      // the output would make a 50% crop depend on what had already been resized.
      const scale = (value: number, total: number) =>
        percent ? Math.max(1, Math.round((value / 100) * total)) : Math.round(value);
      let left = scale(num(p, 'left', 0, 0, 100_000), srcWidth);
      let top = scale(num(p, 'top', 0, 0, 100_000), srcHeight);
      let cropWidth = scale(width, srcWidth);
      let cropHeight = scale(height, srcHeight);

      // sharp throws on a region outside the image, and the useful answer is a clamped crop plus a
      // note - not a stack trace about an offset.
      const clamped: string[] = [];
      if (left + cropWidth > srcWidth) {
        cropWidth = srcWidth - left;
        clamped.push('kenglik');
      }
      if (top + cropHeight > srcHeight) {
        cropHeight = srcHeight - top;
        clamped.push('balandlik');
      }
      if (left >= srcWidth || top >= srcHeight) {
        return fail(`Koordinata rasm tashqarisida: burchak (${left},${top}), rasm ${srcWidth}x${srcHeight}.`);
      }
      if (cropWidth < 1 || cropHeight < 1) {
        return fail(`Qirqish maydoni bo‘ldi: ${cropWidth}x${cropHeight}.`);
      }

      let pipeline = sharp(source).extract({ left, top, width: cropWidth, height: cropHeight });
      const format = strOrEmpty(p, 'format');
      if (format) pipeline = pipeline.toFormat(format as 'png');

      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(
        data,
        (format || info.format || 'png') === 'jpeg' ? 'jpg' : format || info.format || 'png',
      );
      return jsonBlock('Qirqildi', {
        ...saved,
        source: { width: srcWidth, height: srcHeight },
        region: { left, top, width: cropWidth, height: cropHeight },
        ...(clamped.length ? { clamped: clamped.join(' va ') + ' rasm chegarasiga moslandi' } : {}),
      });
    } catch (error) {
      return fail(`Qirqib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
