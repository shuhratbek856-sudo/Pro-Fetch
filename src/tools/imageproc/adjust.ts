import { defineTool } from '../../core/tool.js';
import { outputDir } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { fail, jsonBlock } from '../../core/format.js';
import { float, num, view } from '../../core/input.js';
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
  name: 'pro_image_adjust',
  description:
    'Rasmni tuzatish: yorqinlik, kontrast, ranglar, quyuq rang (grayscale), aylantirish (hue), ' +
    'blur yoki aniqlashtirish (sharpen). Bir nechta o‘zgarish bir vaqtda qo‘llaniladi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      brightness: { type: 'number', description: 'Yorqinlik -1..1 (standart 0 — o‘zgarish yo‘q)' },
      saturation: { type: 'number', description: 'Ranglar -1..1 (standart 0)' },
      hue: { type: 'number', description: 'Rang burilishi, daraja -180..180' },
      blur: { type: 'number', description: 'Blur radiusi, px 0..100 (standart 0)' },
      sharpen: { type: 'boolean', description: 'Aniqlashtirish (standart yo‘q)' },
      grayscale: { type: 'boolean', description: 'Quyuq rangga o‘girish' },
      // Linear contrast is multiplied; callers asking for "more contrast" mean this rather than a
      // gamma shift, which is a different operation and looks like a bug when unexpected.
      contrast: { type: 'number', description: 'Kontrast -1..1 (standart 0)' },
      format: { type: 'string', description: 'Chiqish formati — manbaga saqlanadi' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const brightness = float(p, 'brightness', 0, -1, 1);
    const saturation = float(p, 'saturation', 0, -1, 1);
    const hue = float(p, 'hue', 0, -180, 180);
    const contrast = float(p, 'contrast', 0, -1, 1);
    const blurSigma = float(p, 'blur', 0, 0, 100);
    const sharpen = p.sharpen === true || String(p.sharpen ?? '') === 'true';
    const grayscale = p.grayscale === true || String(p.grayscale ?? '') === 'true';

    // An out-of-range adjustment is refused rather than clamped. `blur: 999` clamped to 100 and the
    // output reported `blur: 100` - which is honest in the result but still means the caller asked for
    // one thing and got another with no signal at the point of the mistake.
    const requested = rawNumber(p, 'blur');
    if (requested !== undefined && (requested < 0 || requested > 100)) {
      return fail(`blur 0..100 oralig'ida bo'lishi kerak (berilgan: ${requested}).`);
    }
    const rawHue = rawNumber(p, 'hue');
    if (rawHue !== undefined && (rawHue < -180 || rawHue > 180)) {
      return fail(`hue -180..180 oralig'ida bo'lishi kerak (berilgan: ${rawHue}).`);
    }

    if (
      brightness === 0 &&
      saturation === 0 &&
      hue === 0 &&
      contrast === 0 &&
      blurSigma === 0 &&
      !sharpen &&
      !grayscale
    ) {
      // Every adjustment defaults to a no-op, so an empty call would return a copy of the input and
      // report success. That is the shape of defect this project keeps finding: something was asked
      // for, nothing was done, and the interface said it was fine.
      return fail(
        'Hech qanday o‘zgarish berilmadi — brightness, saturation, hue, contrast, blur, sharpen ' +
          'yoki grayscale kerak.',
      );
    }

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Rasmni tuzatish');
      const meta = await sharp(source).metadata();

      let pipeline = sharp(source);
      // Blur and sharpen are both edges; applying both would cancel into a wash, so the tool refuses
      // rather than returning something neither setting asked for.
      if (blurSigma > 0 && sharpen) {
        return fail('blur va sharpen bir vaqtda berilishi mumkin emas — bittasini tanlang.');
      }

      const mods: string[] = [];
      if (brightness !== 0) mods.push(`brightness=${brightness.toFixed(2)}`);
      if (saturation !== 0) mods.push(`saturation=${saturation.toFixed(2)}`);
      if (hue !== 0) mods.push(`hue=${hue.toFixed(1)}`);
      if (contrast !== 0) mods.push(`contrast=${contrast.toFixed(2)}`);

      if (mods.length > 0) {
        pipeline = pipeline.modulate({
          brightness: 1 + brightness,
          saturation: 1 + saturation,
          hue: Math.round(hue),
        });
      }
      if (contrast !== 0) {
        // `linear` multiplies; the alternative would be a gamma curve, which is a different effect
        // and would look like a bug to anyone asking for "more contrast".
        pipeline = pipeline.linear(1 + contrast, -(128 * contrast));
      }
      if (grayscale) pipeline = pipeline.grayscale();
      if (blurSigma > 0) pipeline = pipeline.blur(blurSigma);
      if (sharpen) pipeline = pipeline.sharpen({ sigma: 1.4 });

      const format = strFormat(p);
      if (format) pipeline = pipeline.toFormat(format as 'png');
      const data = await pipeline.toBuffer();
      const info = await sharp(data).metadata();
      const saved = await saveImage(
        data,
        (format || info.format || 'png') === 'jpeg' ? 'jpg' : format || info.format || 'png',
      );

      return jsonBlock('Tuzatildi', {
        ...saved,
        source: { width: meta.width ?? null, height: meta.height ?? null, format: meta.format ?? null },
        // Reported rather than implied, so a caller can tell which of two requested adjustments was
        // applied when the output does not visibly show it.
        applied: {
          ...(mods.length ? { modulate: mods } : {}),
          ...(contrast !== 0 ? { linear_contrast: Number(contrast.toFixed(2)) } : {}),
          ...(grayscale ? { grayscale: true } : {}),
          ...(blurSigma > 0 ? { blur: blurSigma } : {}),
          ...(sharpen ? { sharpen: true } : {}),
        },
        result: { width: info.width ?? null, height: info.height ?? null, format: info.format ?? null },
        source_bytes: source.length,
        result_bytes: data.length,
      });
    } catch (error) {
      return fail(`Tuzatib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/** The value exactly as supplied, so a range check rejects it instead of clamping it first. */
function rawNumber(p: Record<string, unknown>, key: string): number | undefined {
  const raw = p[key];
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function strFormat(p: Record<string, unknown>): string {
  const value = p.format;
  return typeof value === 'string' ? value.trim() : '';
}
