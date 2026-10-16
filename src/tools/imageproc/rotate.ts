import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { float, num, strOrEmpty, view } from '../../core/input.js';
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
  name: 'pro_image_rotate',
  description:
    'Rasmni burish (90/180/270 yoki ixtiyoriy burchak) va akslantirish (gorizontal/vertikal). ' +
    'EXIF yo‘nalishini avtomatik tozalash alohida parametr bilan — telefon rasmlari aynan shu ' +
    'sababdan yot ko‘rinadi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      angle: { type: 'number', description: 'Burish burchagi, daraja (0-360, standart 0)' },
      flip_horizontal: { type: 'boolean', description: 'Gorizontal akslantirish' },
      flip_vertical: { type: 'boolean', description: 'Vertikal akslantirish' },
      auto_orient: {
        type: 'boolean',
        description: 'EXIF yo‘nalishini qo‘llab-quvvatlanadi (telefon rasmlari uchun)',
      },
      background: { type: 'string', description: 'Bo‘sh joy rangi (fon berilganda, #rrggbb)' },
      format: { type: 'string', description: 'Chiqish formati — manbaga saqlanadi' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const angle = float(p, 'angle', 0, -360, 360);
    const flipHorizontal = p.flip_horizontal === true || String(p.flip_horizontal ?? '') === 'true';
    const flipVertical = p.flip_vertical === true || String(p.flip_vertical ?? '') === 'true';
    const autoOrient = p.auto_orient === true || String(p.auto_orient ?? '') === 'true';
    if (angle === 0 && !flipHorizontal && !flipVertical && !autoOrient) {
      return fail('Hech narsa berilmadi — angle, flip_horizontal, flip_vertical yoki auto_orient kerak.');
    }

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Rasm burish');
      const meta = await sharp(source).metadata();

      let pipeline = sharp(source);
      // `autoOrient` is applied before the requested rotation so the two compose in the order a
      // caller expects: the picture is put upright, then turned the way they asked. Applied after, a
      // 90° turn on an EXIF-rotated photo ends up sideways again.
      if (autoOrient) pipeline = pipeline.rotate();
      if (angle !== 0)
        pipeline = pipeline.rotate(Math.round(angle), {
          background: strOrEmpty(p, 'background') || { r: 0, g: 0, b: 0, alpha: 0 },
        });
      if (flipHorizontal) pipeline = pipeline.flop();
      if (flipVertical) pipeline = pipeline.flip();

      const format = strOrEmpty(p, 'format');
      if (format) pipeline = pipeline.toFormat(format as 'png');
      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(
        data,
        (format || info.format || 'png') === 'jpeg' ? 'jpg' : format || info.format || 'png',
      );

      return jsonBlock('Burildi', {
        ...saved,
        source: { width: meta.width ?? null, height: meta.height ?? null, format: meta.format ?? null },
        applied: {
          angle,
          flip_horizontal: flipHorizontal,
          flip_vertical: flipVertical,
          auto_orient: autoOrient,
        },
        result: { width: info.width ?? null, height: info.height ?? null, format: info.format ?? null },
      });
    } catch (error) {
      return fail(`Burib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
