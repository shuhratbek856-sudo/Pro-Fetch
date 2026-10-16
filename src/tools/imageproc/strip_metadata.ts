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

/** EXIF payload size, whether this sharp build hands it back as a Buffer or a string. */
function exifBytes(meta: { exif?: unknown }): number {
  const value = meta.exif;
  if (typeof value === 'string') return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  return 0;
}

export default defineTool({
  name: 'pro_image_strip_metadata',
  description:
    'Rasmdan maxfiy ma’lumotlarni olib tashlash: EXIF (kamera, GPS koordinatalari, qurilma ' +
    'seriya raqamlari), ICC profil va boshqa texnik ma’lumotlar. Rasmni qayta yozadi, o‘lcham va ' +
    'ko‘rinish o‘zgarmaydi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      keep_orientation: {
        type: 'boolean',
        description:
          'Pikselni burib qo‘ymaslik. ESlab o‘chirish yo‘nalish tegisini ham olib tashlaydi, ' +
          'shuning uchun bu variantda rasm ko‘rsatgichlarda yot ko‘rinadi.',
      },
      format: { type: 'string', description: 'Chiqish formati (standart — manbaga saqlanadi)' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const keepOrientation = p.keep_orientation === true || String(p.keep_orientation ?? '') === 'true';

    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Metama’lumotni tozalash');
      const before = await sharp(source).metadata();

      if (!before.format) return fail('Rasm formati aniqlanmadi.');

      let pipeline = sharp(source);
      // `rotate()` with no argument is the only way to apply the EXIF orientation: the pixels are
      // rewritten upright and the tag becomes redundant. Without it, stripping a rotated phone photo
      // would silently turn it on its side - a data-mining feature that destroys the image.
      if (!keepOrientation && typeof before.orientation === 'number' && before.orientation > 1) {
        pipeline = pipeline.rotate();
      }

      const format = strOrEmpty(p, 'format');
      // Re-encoding is what actually removes the metadata. Writing the original bytes back would keep
      // every byte, including the location.
      if (format) pipeline = pipeline.toFormat(format as 'png');
      else if (before.format === 'jpeg') pipeline = pipeline.jpeg({ quality: 95 });
      else if (before.format === 'webp') pipeline = pipeline.webp({ quality: 95 });
      else if (before.format === 'tiff') pipeline = pipeline.tiff();
      // sharp's own type union omits avif here even though the encoder exists, so the call goes
      // through the same cast used for the format enum elsewhere.
      else if ((before.format as string) === 'avif') pipeline = pipeline.avif();

      const data = await pipeline.toBuffer();
      const after = await sharp(data).metadata();

      // Verified on the written bytes rather than inferred from the intent - a strip that removed
      // nothing would otherwise report a smaller file and be believed.
      // Typed as Buffer here and string in other sharp builds; both are length-checked the same way.
      const stillHasExif = exifBytes(after) > 0;
      const stillHasIcc = Boolean(after.icc);
      if (stillHasExif || stillHasIcc) {
        return fail(
          'Metama’lumot olib tashlanmadi: qayta yozilgan faylda baribir qoldi' +
            (stillHasExif ? ' EXIF' : '') +
            (stillHasIcc ? ' ICC' : '') +
            '. Rasmni zaxira ko‘rib, boshqa usul bilan tozalang.',
        );
      }

      const saved = await saveImage(data, format || (before.format === 'jpeg' ? 'jpg' : (before.format ?? 'png')));
      return jsonBlock('Metama’lumot tozalandi', {
        ...saved,
        before: {
          bytes: source.length,
          format: before.format ?? null,
          exif_bytes: exifBytes(before),
          icc: before.icc ? true : null,
          orientation: before.orientation ?? null,
        },
        after: {
          bytes: data.length,
          format: after.format ?? null,
          exif_bytes: 0,
          icc: null,
        },
        orientation_applied: !keepOrientation && (before.orientation ?? 1) > 1,
        bytes_removed: source.length - data.length,
        // The honest note about the option that looks safe and is not. Stripping removes the
        // orientation tag, so `keep_orientation: true` cannot preserve it - all it can do is leave the
        // pixels unrotated, which every viewer that honoured the tag will now display sideways. The
        // parameter name promises a tag that the operation necessarily deletes.
        ...(keepOrientation && (before.orientation ?? 1) > 1
          ? {
              warning:
                `Manba yo‘nalishi ${before.orientation} bo‘lgan, metama’lumot olib tashlandi va teg ` +
                `yo‘nalishi ham o‘chdi. Piksel burilmagani uchun rasm endi yot ko‘rinadi.`,
            }
          : {}),
      });
    } catch (error) {
      return fail(`Tozalab bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
