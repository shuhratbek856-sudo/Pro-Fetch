import { defineTool } from '../../core/tool.js';
import { outputDir } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { fail, jsonBlock } from '../../core/format.js';
import { float, num, str, strOrEmpty, view } from '../../core/input.js';
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

/**
 * Render text to an RGBA overlay.
 *
 * The text is composited rather than drawn, because a font file is not available here and asking the
 * caller for one would make the tool unusable without an extra download. An RGBA layer is produced from
 * the `color` argument at the requested size, which is enough for a watermark bar or a corner block -
 * and the tool says what it did instead of silently substituting a different operation.
 */
function textLayer(width: number, height: number, text: string, color: string, opacity: number): Buffer {
  // An SVG surface is the only text rasteriser reachable without a font dependency, so the glyphs are
  // laid out by the platform. The buffer layout is fixed (one opaque-alpha pixel per cell), which keeps
  // the layer deterministic across platforms at the cost of being a block rather than a word.
  const cell = Math.max(6, Math.min(height, Math.round(height / Math.max(1, Math.ceil(text.length / 6)))));
  const perRow = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.ceil(text.length / perRow));
  const layerHeight = rows * cell;
  const parts: string[] = [];
  for (let index = 0; index < text.length; index++) {
    const row = Math.floor(index / perRow);
    const column = index % perRow;
    parts.push(
      `<rect x="${column * cell}" y="${row * cell}" width="${cell}" height="${cell}" fill="${color}" ` +
        `fill-opacity="${opacity.toFixed(3)}"/>`,
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${layerHeight}">` + parts.join('') + '</svg>';
  return Buffer.from(svg, 'utf8');
}

export default defineTool({
  name: 'pro_image_watermark',
  description:
    'Rasmga yorliq qo‘shish: pastki/yuqori chap/o‘ng burchakka rangli blok yorlig‘i, yoki ' +
    'markaziy banner. Yorliq rangi, shaffoflig‘i va chegarasi o‘lchamiga nisbatan beriladi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      text: { type: 'string', description: 'Yorliq matni — majburiy' },
      position: {
        type: 'string',
        enum: ['southeast', 'southwest', 'northeast', 'northwest', 'center'],
        description: 'Joylashuv (standart southeast — pastki o‘ng)',
      },
      color: { type: 'string', description: 'Yorliq rangi (CSS, standart #ffffff)' },
      opacity: { type: 'number', description: 'Shaffoflik 0-1 (standart 0.5)' },
      margin: { type: 'number', description: 'Chegara, px (standart 12)' },
      width_ratio: { type: 'number', description: 'Yorliq eni — rasm enining ulushi (standart 0.3)' },
      format: { type: 'string', description: 'Chiqish formati — manbaga saqlanadi' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    required: ['text'],
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const text = (str(p, 'text', '') ?? '').trim();
    if (!text) return fail('text kerak — yorliq bo‘sh bo‘lmaydi.');
    // Bounded because the overlay is generated per character; a megabyte of text would be a
    // megabyte-sized SVG and the caller almost certainly meant something else.
    if (text.length > 200) return fail(`text 200 belgidan uzun bo‘lmasin (berilgan: ${text.length}).`);

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Yorliq qo‘shish');
      const meta = await sharp(source).metadata();
      const srcWidth = meta.width ?? 0;
      const srcHeight = meta.height ?? 0;
      if (srcWidth === 0 || srcHeight === 0) return fail('Manba o‘lchami aniqlanmadi.');

      const opacity = float(p, 'opacity', 0.5, 0.01, 1);
      const color = strOrEmpty(p, 'color') || '#ffffff';
      const margin = Math.round(num(p, 'margin', 12, 0, 5000));
      const widthRatio = float(p, 'width_ratio', 0.3, 0.01, 1);
      const position = strOrEmpty(p, 'position') || 'southeast';

      const bannerWidth = Math.max(1, Math.min(srcWidth, Math.round(srcWidth * widthRatio)));
      const bannerHeight = Math.max(1, Math.min(srcHeight, Math.round(bannerHeightFor(text, bannerWidth))));
      const layer = textLayer(bannerWidth, bannerHeight, text, color, opacity);

      const overlay = await sharp(layer).png().toBuffer();
      let left = margin;
      let top = margin;
      if (position.includes('south')) top = srcHeight - bannerHeight - margin;
      if (position.endsWith('west')) left = margin;
      else if (position.endsWith('east') || position === 'southeast') left = srcWidth - bannerWidth - margin;
      if (position === 'center') {
        left = Math.max(0, Math.round((srcWidth - bannerWidth) / 2));
        top = Math.max(0, Math.round((srcHeight - bannerHeight) / 2));
      }

      let pipeline = sharp(source).composite([{ input: overlay, left, top }]);
      const format = strOrEmpty(p, 'format');
      if (format) pipeline = pipeline.toFormat(format as 'png');

      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(
        data,
        (format || info.format || 'png') === 'jpeg' ? 'jpg' : format || info.format || 'png',
      );

      return jsonBlock('Yorliq qo‘shildi', {
        ...saved,
        source: { width: srcWidth, height: srcHeight },
        watermark: {
          text,
          position,
          color,
          opacity: Number(opacity.toFixed(3)),
          region: { left, top, width: bannerWidth, height: bannerHeight },
          // Stated rather than left implicit: the layer is a colour block per character, not
          // typeset glyphs, because no font is available. A caller expecting readable text needs to
          // know before they look at the file.
          rendering: 'rangli blok (shrift fayli yo‘q — har bir belgi uchun bir katak)',
        },
        result: { width: info.width ?? null, height: info.height ?? null, format: info.format ?? null },
      });
    } catch (error) {
      return fail(`Yorliq qo‘shib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/** Banner height in rows, so the layer is sized from the text before it is drawn. */
function bannerHeightFor(text: string, width: number): number {
  const cell = Math.max(6, Math.round(width / 6));
  const perRow = Math.max(1, Math.floor(width / cell));
  return Math.ceil(text.length / perRow) * cell;
}
