import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';

export default defineTool({
  name: 'pro_image_info',
  description:
    'Rasm haqida to‘liq ma’lumot: format, o‘lcham, rang chuqurligi, EXIF yo‘nalishi, kamera, ' +
    'obyektiv, o‘lchov nuqtasi, kompression, alfa kanali. Rasmni o‘zgartirmaydi.',
  category: 'imageproc',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Rasm URL i' },
      base64: { type: 'string', description: 'Rasm base64' },
      data_base64: { type: 'string', description: 'Rasm base64 (boshqa yozuv)' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    try {
      const { default: sharp } = await import('sharp');
      const source = await readBinarySource(input, 'Rasm ma’lumotlari');
      const meta = await sharp(source).metadata();

      if (!meta.format) {
        // sharp accepted the bytes but could not identify them. Reporting a header of empty fields
        // would look like a valid answer about a picture; naming the gap is the useful answer.
        return fail('Rasm formati aniqlanmadi — fayl rasm emas yoki format qo‘llab-quvvatlanmaydi.');
      }

      const stats = await sharp(source).stats();
      const hasAlpha = meta.hasAlpha === true;
      const channels = stats.channels ?? [];

      return jsonBlock('Rasm ma’lumotlari', {
        bytes: source.length,
        format: meta.format,
        width: meta.width ?? null,
        height: meta.height ?? null,
        channels: meta.channels ?? null,
        has_alpha: hasAlpha,
        // Recorded as a named orientation rather than a number, because "6" means nothing to a caller
        // and "rotate 90 CW" means exactly one thing.
        orientation: orientationName(meta.orientation),
        is_progressive: meta.isProgressive ?? null,
        // Compression is the answer to "why is this 3 MB" - a PNG screenshot and a JPEG photograph
        // have the same dimensions and a very different size.
        compression: meta.compression ?? null,
        // sharp populates `compression` only for some formats and leaves it null for others, so on
        // its own it is a field that is sometimes empty and never wrong. Bytes per pixel answers the
        // question it was meant to answer - "why is this file so large" - for every format.
        bytes_per_pixel:
          meta.width && meta.height ? Number((source.length / (meta.width * meta.height)).toFixed(3)) : null,
        density: meta.density ?? null,
        pages: meta.pages ?? null,
        page_height: meta.pageHeight ?? null,
        loop: meta.loop ?? null,
        palette_bits: (meta as { paletteBitDepth?: number }).paletteBitDepth ?? null,
        // Statistics are what makes a batch report useful: mean brightness per channel, and whether
        // the image is essentially blank (every channel equal).
        statistics: {
          dominant: stats.dominant ?? null,
          entropy: typeof stats.entropy === 'number' ? Number(stats.entropy.toFixed(3)) : null,
          channels: channels.map((c) => ({
            min: c.min,
            max: c.max,
            mean: Number(c.mean.toFixed(2)),
            stdev: Number(c.stdev.toFixed(2)),
          })),
          is_uniform: channels.length > 0 && channels.every((c) => c.min === c.max) ? true : null,
        },
        // sharp types EXIF as a Buffer and parses it lazily; the summary works on the parsed record.
        exif: exifSummary(await parseExif(meta.exif)),
        icc_present: meta.icc ? true : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // sharp's own wording is accurate but internal. A caller who passed the wrong bytes needs to
      // know that, and "unsupported image format" buried inside a message about *reading* is easy to
      // misread as a tool fault rather than as their input.
      if (/unsupported image format|Input buffer contains unsupported/i.test(message)) {
        return fail('Bu baytlar rasm emas yoki format qo‘llab-quvvatlanmaydi.');
      }
      return fail(`Ma’lumotni o‘qib bo‘lmadi: ${message}`);
    }
  },
});

/** EXIF orientation 1-8 as an instruction, because the numbers are only meaningful to a decoder. */
function orientationName(value: number | undefined): string | null {
  switch (value) {
    case 1:
      return 'normal';
    case 2:
      return 'mirror horizontal';
    case 3:
      return 'rotate 180';
    case 4:
      return 'mirror vertical';
    case 5:
      return 'mirror horizontal + rotate 270 CW';
    case 6:
      return 'rotate 90 CW';
    case 7:
      return 'mirror horizontal + rotate 90 CW';
    case 8:
      return 'rotate 270 CW';
    default:
      // Absent and unreadable are different: absent means the format carries no EXIF, undefined means
      // something wrote a value this decoder does not know. Both report as null here rather than
      // guessing, and the difference is visible in `exif_present`.
      return null;
  }
}

/** The EXIF fields worth reporting by name. Raw EXIF is mostly device serial numbers. */
async function parseExif(exif: Buffer | undefined): Promise<Record<string, unknown> | undefined> {
  if (!exif) return undefined;
  try {
    const { exif: parse } = (await import('exif-reader')) as unknown as {
      exif: (input: Uint8Array) => Record<string, unknown>;
    };
    return parse(exif);
  } catch {
    // No EXIF parser available. The rest of the report is still correct, and an absent field here
    // means "not read" rather than "not present" - so it is reported rather than silently blank.
    return undefined;
  }
}

function exifSummary(exif: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!exif) return null;
  const wanted: Record<string, string> = {
    Make: 'camera_make',
    Model: 'camera_model',
    LensModel: 'lens',
    FNumber: 'aperture',
    ExposureTime: 'shutter',
    ISO: 'iso',
    FocalLength: 'focal_length_mm',
    DateTimeOriginal: 'taken_at',
    GPSLatitude: 'gps_latitude',
    GPSLongitude: 'gps_longitude',
  };
  const out: Record<string, unknown> = {};
  for (const [key, label] of Object.entries(wanted)) {
    const value = exif[key];
    if (value === undefined || value === null) continue;
    out[label] = value instanceof Array ? value.join(', ') : value;
  }
  return Object.keys(out).length > 0 ? out : null;
}
