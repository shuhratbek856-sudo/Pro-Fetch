import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, str, strOrEmpty, view } from '../../core/input.js';
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
  name: 'pro_image_sprite',
  description:
    'Bir necha rasmni bitta sprite varaqasiga yig‘ish: qatorlar va ustunlar soni belgilanadi, ' +
    'har bir katak teng o‘lchamga masshtalanadi. CSS sprite sheet va boshqa varaqalar uchun.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      images_base64: {
        type: 'array',
        items: { type: 'string' },
        description: 'Rasm base64 massivi — majburiy, kamida 1 ta',
      },
      data: { type: 'array', items: { type: 'string' }, description: 'Rasm base64 massivi (boshqa yozuv)' },
      urls: { type: 'array', items: { type: 'string' }, description: 'Rasm URL massivi' },
      columns: { type: 'number', description: 'Ustunlar soni (standart: kvadrat ildiz)' },
      cell: { type: 'number', description: 'Bitta katak o‘lchami, px (standart: eng kattasidan)' },
      format: { type: 'string', description: 'Chiqish formati (standart png)' },
      max_bytes: { type: 'number', description: 'Har bir manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['images_base64'] }, { required: ['data'] }, { required: ['urls'] }],
  },
  async handler(input) {
    const p = view(input);
    const list = (Array.isArray(p.images_base64) ? p.images_base64 : (p.data ?? p.urls)) as unknown[];
    const sources = (Array.isArray(list) ? list : []).filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
    );
    if (sources.length === 0) {
      return fail('Rasm ro‘yxati kerak — images_base64, data yoki urls bo‘sh bo‘lmasin.');
    }
    // Bounded because every image is decoded and composited: a 500-element array is not a sprite
    // sheet, and the memory cost is quadratic in the sheet size once sharp allocates the canvas.
    if (sources.length > 256) {
      return fail(`Ko‘piqcha rasm: ${sources.length} ta (chegara 256).`);
    }

    try {
      const { default: sharp } = await import('sharp');
      const buffers: Buffer[] = [];
      const metas: Array<{ width: number; height: number; format: string | undefined }> = [];
      for (const [index, entry] of sources.entries()) {
        // `readBinarySource` is reached per entry from a synthetic input so the same resolution path
        // is used as every other tool: a base64 string, a URL, or a local file all go through one
        // guard rather than three.
        const buffer = await readBinarySource({ base64: entry }, `Sprite ${index + 1}-rasmni o‘qish`);
        buffers.push(buffer);
        const meta = await sharp(buffer).metadata();
        if (!meta.width || !meta.height) {
          return fail(`${index + 1}-rasmning o‘lchami aniqlanmadi.`);
        }
        metas.push({ width: meta.width, height: meta.height, format: meta.format });
      }

      const columns =
        num(p, 'columns', 0, 1, 256) > 0
          ? Math.round(num(p, 'columns', 0, 1, 256))
          : Math.ceil(Math.sqrt(sources.length));
      const rows = Math.ceil(sources.length / columns);
      // One cell size for every image, so the sheet is a grid rather than a collage. Defaulting to the
      // largest image avoids upscaling small ones and silently cropping large ones.
      const cell = num(p, 'cell', 0, 1, 20_000) || Math.max(...metas.map((m) => Math.max(m.width, m.height)));

      const composites = await Promise.all(
        buffers.map(async (buffer, index) => ({
          input: await sharp(buffer)
            .resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .toBuffer(),
          left: (index % columns) * cell,
          top: Math.floor(index / columns) * cell,
        })),
      );

      const format = strOrEmpty(p, 'format') || 'png';
      const sheet = await sharp({
        create: {
          width: columns * cell,
          height: rows * cell,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(composites)
        .toFormat(format as 'png')
        .toBuffer();

      const info = await sharp(sheet).metadata();
      const saved = await saveImage(sheet, format === 'jpeg' ? 'jpg' : format);
      return jsonBlock('Sprite yig‘ildi', {
        ...saved,
        // Every number a CSS sprite sheet needs, so the caller does not have to recompute them and
        // get the horizontal step wrong.
        grid: { columns, rows, cell, count: sources.length },
        sheet: { width: info.width ?? null, height: info.height ?? null, format: info.format ?? null },
        // Per-cell frames, in order, so a consumer can address each sprite without counting again.
        frames: metas.map((meta, index) => ({
          index,
          column: index % columns,
          row: Math.floor(index / columns),
          source_size: { width: meta.width, height: meta.height },
          source_format: meta.format ?? null,
        })),
        sources: metas.length,
      });
    } catch (error) {
      return fail(`Sprite yig‘ib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
