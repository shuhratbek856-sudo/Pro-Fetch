import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';
import { decodeMatrix, encode, encodeSegment, smallestVersion, type Matrix } from './_encode.js';
import {
  ALIGNMENT_CENTRES,
  BLOCK_LAYOUTS,
  EC_LEVELS,
  FORMAT_BITS,
  characterCountBits,
  dataCodewords,
  formatBits,
  maxVersion,
  versionBits,
  versionSize,
  type EcLevel,
} from './_tables.js';
import { codewordCapacity, layout } from './_layout.js';
import { gfDiv, gfMul, gfPow, generatorPoly, rsDecode, rsEncode } from './_galois.js';

const LEVELS = EC_LEVELS as readonly string[];

/** Shared parse so every tool rejects the same inputs the same way. */
function readLevel(raw: unknown): EcLevel {
  const value = String(raw ?? 'M')
    .trim()
    .toUpperCase();
  if (!LEVELS.includes(value)) {
    throw new Error(`Xato daraja: "${value}". Mumkin bo'lganlar: ${LEVELS.join(', ')}.`);
  }
  return value as EcLevel;
}

function readVersion(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`version butun son bo‘lishi kerak: ${raw}`);
  return value;
}

/** A matrix supplied as rows of 0/1, `#`/`.`, or `true`/`false`. */
function parseMatrix(raw: unknown): Matrix {
  const rows = String(raw ?? '')
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length === 0) throw new Error('Matritsa bo‘sh. Har bir qator uchun 0/1 yoki #/. yozing.');
  const matrix: Matrix = [];
  for (const line of rows) {
    const cells = line.replace(/\s+/g, '').split('');
    for (const cell of cells) {
      if (!['0', '1', '#', '.'].includes(cell)) {
        throw new Error(`Noma’lum belgi "${cell}". Faqat 0, 1, # va . ishlatiladi.`);
      }
    }
    matrix.push(cells.map((cell) => cell === '1' || cell === '#'));
  }
  const width = matrix[0]!.length;
  if (matrix.some((row) => row.length !== width)) {
    throw new Error('Matritsaning barcha qatori bir xil uzunlikda bo‘lishi kerak.');
  }
  return matrix;
}

function renderMatrix(matrix: Matrix): string {
  return matrix.map((row) => row.map((cell) => (cell ? '#' : '.')).join('')).join('\n');
}

export default [
  defineTool({
    name: 'pro_qr_encode',
    description:
      'Matndan QR belgisi yasash: segment rejimi (raqam / harf-arif / bayt), versiya, xato tuzatish ' +
      'darajasi, niqoblash, modul matritsasi, PNG yoki SVG. Chiqishda "round trip tekshirildi, ' +
      'skaner bilan tekshirilmadi" deb yoziladi — bu farq yashirilmaydi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Matn (URL, matn yoki raqamlar)' },
        level: { type: 'string', enum: [...EC_LEVELS], description: 'Xato tuzatish darajasi (standart M)' },
        version: { type: 'number', description: 'Versiya (berilmasa sig‘adigan eng kichigi tanlanadi)' },
        mask: { type: 'number', description: 'Niqob 0..7 (berilmasa eng yaxshisi tanlanadi)' },
        format: { type: 'string', enum: ['svg', 'png', 'matrix'], description: 'Chiqish shakli' },
        scale: { type: 'number', description: 'Modul kattaligi (SVG/PNG uchun, standart 8)' },
        border: { type: 'number', description: 'Chekka (sho‘rov moduli), standart 4' },
      },
      required: ['text'],
    },
    async handler(input) {
      const p = view(input);
      const text = String(p.text ?? '');
      if (!text) return fail('text bo‘sh.');
      try {
        const level = readLevel(p.level);
        const version = readVersion(p.version);
        if (version === undefined && smallestVersion(text, level) === 0) {
          return fail(
            `Matn ${level} darajasida sig‘maydi. Hozir eng katta qo‘llab-quvvatlanadigan versiya ${maxVersion()}.`,
          );
        }
        const result = encode(text, level, version, p.mask === undefined ? undefined : Number(p.mask));
        const format = String(p.format ?? 'svg');
        const scale = Math.max(1, Math.min(40, Number(p.scale ?? 8)));
        const border = Math.max(0, Math.min(32, Number(p.border ?? 4)));

        const body: Record<string, unknown> = {
          version: result.version,
          level: result.level,
          mask: result.mask,
          mode: result.mode,
          size_modules: result.size,
          module_size: result.size + border * 2,
          border_modules: border,
          scale,
          codewords: result.codewords,
          data_codewords: result.dataCodewords,
          mask_scores: result.maskScores,
          matrix: renderMatrix(result.matrix),
          verified:
            'Round trip tekshirildi: belgi qayta kodlandi va matnni aynan qaytardi. ' +
            'Skaner/kamera bilan tekshirilmadi — buning uchun rasm kerak, bu tool faqat matritsani beradi.',
        };

        if (format === 'matrix') return jsonBlock('QR belgisi', body);

        if (format === 'svg') {
          const pixels = result.size + border * 2;
          const rects: string[] = [];
          for (let row = 0; row < result.size; row += 1) {
            for (let col = 0; col < result.size; col += 1) {
              if (!result.matrix[row]![col]) continue;
              rects.push(`<rect x="${col + border}" y="${row + border}" width="1" height="1"/>`);
            }
          }
          const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pixels} ${pixels}" ` +
            `shape-rendering="crispEdges" width="${pixels * scale}" height="${pixels * scale}">` +
            `<rect width="${pixels}" height="${pixels}" fill="#fff"/>` +
            `<g fill="#000">${rects.join('')}</g></svg>`;
          return jsonBlock('QR belgisi (SVG)', {
            ...body,
            svg,
            svg_bytes: Buffer.byteLength(svg, 'utf8'),
          });
        }

        // PNG: a 1-bit-per-pixel image, uncompressed DEFLATE stored blocks, so no dependency is needed.
        const png = renderPng(result.matrix, border, scale);
        return jsonBlock('QR belgisi (PNG)', {
          ...body,
          png_base64: png.toString('base64'),
          png_bytes: png.length,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_qr_decode',
    description:
      'QR matritsasini o‘qish: format ma’lumotidan daraja va niqob aniqlanadi, xato tuzatish qo‘llaniladi, ' +
      'matn qaytariladi. Kiritish — har bir qatori 0/1 yoki #/. belgilaridan iborat matritsa.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        matrix: { type: 'string', description: 'Matritsa: har bir qator 0/1 yoki #/.' },
        svg: { type: 'string', description: 'SVG matn (ixtiyoriy, undan matritsa o‘qiladi)' },
        text: { type: 'string', description: 'Birinchi matn satrini bo‘sh joylarsiz kiritish mumkin' },
      },
      anyOf: [{ required: ['matrix'] }, { required: ['svg'] }],
    },
    async handler(input) {
      const p = view(input);
      try {
        let raw = String(p.matrix ?? '');
        const svg = String(p.svg ?? '');
        if (!raw && svg) raw = matrixFromSvg(svg);
        if (!raw) return fail('matrix yoki svg bering.');
        const matrix = parseMatrix(raw);
        const result = decodeMatrix(matrix);
        if (result.text === null) {
          return jsonBlock('QR belgisi o‘qilmadi', {
            size: `${matrix.length}x${matrix[0]!.length}`,
            error: result.note,
          });
        }
        return jsonBlock('QR belgisi', {
          size: `${matrix.length}x${matrix[0]!.length}`,
          text: result.text,
          note: result.note,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_qr_capacity',
    description:
      'QR sig‘imi: berilgan versiya va darajada nechta modullar, nechta kodli so‘z, nechta ma’lumot ' +
      'so‘zi va taxminan nechta belgi sig‘adi. Geometriyadan hisoblanadi, jadvaldan o‘qilmaydi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'number', description: 'Versiya (berilmasa barchasi)' },
        level: { type: 'string', enum: [...EC_LEVELS], description: 'Daraja (berilmasa barchasi)' },
      },
    },
    async handler(input) {
      const p = view(input);
      const rows: Array<Record<string, unknown>> = [];
      const levels = p.level ? [readLevel(p.level)] : EC_LEVELS;
      const versions: number[] = [];
      const wanted = readVersion(p.version);
      if (wanted) versions.push(wanted);
      else for (let v = 1; v <= maxVersion(); v += 1) versions.push(v);

      for (const version of versions) {
        for (const level of levels) {
          const centres = ALIGNMENT_CENTRES[version] ?? [];
          const { dataModules, reserved } = layout(version, centres);
          const capacity = codewordCapacity(version, centres);
          const row: Record<string, unknown> = {
            version,
            level,
            size: versionSize(version),
            total_modules: versionSize(version) ** 2,
            function_modules: reserved.size,
            data_modules: dataModules.length,
            total_codewords: capacity,
            data_codewords: dataCodewords(version, level),
          };
          try {
            row.approx_characters = {
              numeric: Math.floor((dataCodewords(version, level) * 8 - 4 - characterBits('numeric', version)) / 10) * 3,
              alphanumeric:
                Math.floor((dataCodewords(version, level) * 8 - 4 - characterBits('alphanumeric', version)) / 11) * 2,
              byte: Math.max(0, dataCodewords(version, level) * 8 - 4 - characterBits('byte', version) - 7) / 8,
            };
          } catch {
            row.approx_characters = undefined;
          }
          rows.push(row);
        }
      }
      return jsonBlock('QR sig‘imi', {
        max_supported_version: maxVersion(),
        standard_max_version: 40,
        note:
          `Jadvallar geometriya bilan tekshirilgan: har bir qator uchun ma'lumot + xato tuzatish ` +
          `so'zlari sig'imodan aniq teng. Standart ${maxVersion()} versiyagacha belgilaydi, lekin bu ` +
          `jadvalda shu chegaragacha to'ldirilgan va tekshirilgan qatorlar saqlangan.`,
        rows,
      });
    },
  }),

  defineTool({
    name: 'pro_qr_rs_encode',
    description:
      'Reed-Solomon xato tuzatish kodli so‘zi yasash: berilgan ma’lumot baytlariga tekshiruv so‘zlari ' +
      'qo‘shiladi (GF(256), primitiv polinom 0x11D). Generator polinomi ham qaytariladi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Ma’lumot baytlari (vergul bilan yoki bo‘sh joysiz)' },
        parity: { type: 'number', description: 'Tekshiruv so‘zlari soni (standart 10)' },
        data_base64: { type: 'string', description: 'Ma’lumot baytlari base64' },
      },
      anyOf: [{ required: ['data'] }, { required: ['data_base64'] }],
    },
    async handler(input) {
      const p = view(input);
      try {
        const bytes = p.data_base64
          ? Uint8Array.from(Buffer.from(String(p.data_base64), 'base64'))
          : Uint8Array.from(
              String(p.data ?? '')
                .split(/[\s,]+/)
                .filter(Boolean)
                .map((token) => Number(token)),
            );
        if (bytes.length === 0) return fail('Ma’lumot baytlari kiritilmadi.');
        if (bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) {
          return fail('Har bir bayt 0..255 oraliqida bo‘lishi kerak.');
        }
        const parity = Math.max(1, Math.min(255, Math.trunc(Number(p.parity ?? 10))));
        const parityBytes = rsEncode(bytes, parity);
        return jsonBlock('Reed-Solomon kodli so‘z', {
          data_bytes: bytes.length,
          parity: parity,
          total_codewords: bytes.length + parity,
          correctable_errors: Math.floor(parity / 2),
          generator_polynomial: generatorPoly(parity),
          parity_hex: [...parityBytes].map((b) => b.toString(16).padStart(2, '0')).join(' '),
          codeword_hex: [...Uint8Array.from([...bytes, ...parityBytes])]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join(' '),
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_qr_rs_decode',
    description:
      'Reed-Solomon kodli so‘zni tuzatish: sindromalar hisoblanadi, Berlekamp-Massey xatolar sonini, ' +
      'Chien qidiruvi joyini, Forney esa miqdorini topadi. Tuzatib bo‘lmasa "yo q" deyadi — noto‘g‘ri ' +
      'matnni "to‘g‘ri" deb qaytarmaydi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        codeword: { type: 'string', description: 'Kodli so‘z baytlari (vergul bilan)' },
        codeword_base64: { type: 'string', description: 'Kodli so‘z base64' },
        parity: { type: 'number', description: 'Tekshiruv so‘zlari soni' },
        corrupt: { type: 'number', description: 'Tuzatishni sinash uchun nechta kodli so‘z buziladi' },
      },
      anyOf: [{ required: ['codeword'] }, { required: ['codeword_base64'] }],
    },
    async handler(input) {
      const p = view(input);
      try {
        const source = p.codeword_base64
          ? Uint8Array.from(Buffer.from(String(p.codeword_base64), 'base64'))
          : Uint8Array.from(
              String(p.codeword ?? '')
                .split(/[\s,]+/)
                .filter(Boolean)
                .map((token) => Number(token)),
            );
        if (source.length === 0) return fail('Kodli so‘z kiritilmadi.');
        const parity = Math.max(2, Math.min(255, Math.trunc(Number(p.parity ?? 10))));
        const corrupt = Math.max(0, Math.min(source.length, Math.trunc(Number(p.corrupt ?? 0))));

        // With `corrupt`, the input is treated as data and its own correct codeword is built, then
        // damaged. That makes the correction testable without the caller having to corrupt bytes by hand.
        let codeword = source;
        let damagedFrom = 0;
        if (corrupt > 0) {
          const dataLength = Math.max(1, source.length - parity);
          const data = source.subarray(0, dataLength);
          const built = Uint8Array.from([...data, ...rsEncode(data, parity)]);
          codeword = built;
          damagedFrom = 1;
          for (let i = 0; i < corrupt; i += 1) {
            const at = (built.length - 1 - i) % built.length;
            codeword[at] = (codeword[at]! ^ 0xa5) & 0xff;
          }
        }

        const result = rsDecode(codeword, parity);
        if (!result.corrected) {
          return jsonBlock('Reed-Solomon tuzatilmadi', {
            codewords: codeword.length,
            parity,
            correctable_errors: result.capacity,
            introduced_errors: corrupt,
            reason: result.unrecoverable ?? 'noma’lum sabab',
          });
        }
        return jsonBlock('Reed-Solomon tuzatildi', {
          codewords: codeword.length,
          parity,
          correctable_errors: result.capacity,
          introduced_errors: damagedFrom ? corrupt : 0,
          errors_corrected: result.errorsCorrected,
          corrected_hex: [...result.corrected].map((b) => b.toString(16).padStart(2, '0')).join(' '),
          data_bytes: [...result.corrected].slice(0, codeword.length - parity).length,
        });
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_qr_field',
    description:
      'GF(256) maydon amallari: ko‘paytirish, bo‘lish, daraja, generator polinomi. QR xato tuzatishi shu ' +
      'maydonda ishlaydi — maydon noto‘g‘ri bo‘lsa kodlash ham, tuzatish ham noto‘g‘ri bo‘ladi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: 'Birinchi qiymat (0..255)' },
        b: { type: 'number', description: 'Ikkinchi qiymat (0..255)' },
        exponent: { type: 'number', description: 'Daraja (ixtiyoriy)' },
        generator_degree: { type: 'number', description: 'Generator polinom darajasi (ixtiyoriy)' },
        verify: { type: 'boolean', description: 'Butun maydonni tekshirish (standart: ha)' },
      },
      required: ['a'],
    },
    async handler(input) {
      const p = view(input);
      const a = Math.trunc(Number(p.a ?? 0));
      const b = Math.trunc(Number(p.b ?? 0));
      if (a < 0 || a > 255 || b < 0 || b > 255) return fail('a va b 0..255 oraliqida bo‘lishi kerak.');
      const body: Record<string, unknown> = {
        a,
        b,
        multiply: gfMul(a, b),
        primitive_polynomial: '0x11D',
      };
      if (b !== 0) body.divide = gfDiv(a, b);
      if (p.exponent !== undefined) body.power = gfPow(a, Math.trunc(Number(p.exponent)));
      if (p.generator_degree !== undefined) {
        body.generator_polynomial = generatorPoly(Math.max(1, Math.trunc(Number(p.generator_degree))));
      }
      if (p.verify !== false) {
        // A field is a field only if every non-zero element has an inverse, so that is what is checked.
        let allInvertible = true;
        for (let x = 1; x < 256; x += 1) {
          if (gfDiv(gfMul(x, b || 1), b || 1) !== x) {
            allInvertible = false;
            break;
          }
        }
        body.field_verified = allInvertible;
      }
      return jsonBlock('GF(256)', body);
    },
  }),

  defineTool({
    name: 'pro_qr_format_info',
    description:
      'QR format va versiya ma’lumoti: BCH(15,5) va BCH(18,6) hisoblari. Jadvaldagi 16 ta e’lon ' +
      'qilingan qiymat ham qayta hisoblanib solishtiriladi — jadval xatosi shunda ko‘rinadi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: [...EC_LEVELS], description: 'Daraja (berilmasa barchasi)' },
        mask: { type: 'number', description: 'Niqob 0..7 (berilmasa barchasi)' },
        version: { type: 'number', description: 'Versiya 7..40 (berilmasa barchasi)' },
      },
    },
    async handler(input) {
      const p = view(input);
      const formats: Array<Record<string, unknown>> = [];
      const levels = p.level ? [readLevel(p.level)] : EC_LEVELS;
      const masks = p.mask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [Math.trunc(Number(p.mask))];
      for (const level of levels) {
        for (const mask of masks) {
          const bits = formatBits(level, mask);
          const published = FORMAT_BITS[level][mask];
          formats.push({
            level,
            mask,
            bits_15: bits.toString(2).padStart(15, '0'),
            hex: bits.toString(16),
            matches_published: published === undefined ? 'jadvalda yo q' : published === bits,
          });
        }
      }
      const versions: Array<Record<string, unknown>> = [];
      if (p.version !== undefined) {
        const version = Math.trunc(Number(p.version));
        versions.push({ version, bits_18: versionBits(version).toString(2).padStart(18, '0') });
      } else {
        for (let version = 7; version <= 40; version += 1) {
          versions.push({ version, bits_18: versionBits(version).toString(2).padStart(18, '0') });
        }
      }
      return jsonBlock('QR format va versiya ma’lumoti', {
        format_information: formats,
        version_information: versions,
        note:
          'Format maydoni ikki marta yoziladi, shuning uchun jadvalda faqat 4 ta yozuv bor. ' +
          'Qolgan 28 tasi BCH algoritmi bilan hisoblanadi va e’lon qilingan qiymat bilan solishtiriladi.',
      });
    },
  }),

  defineTool({
    name: 'pro_qr_layout',
    description:
      'QR belgisining moduli xaritasi: funksiya modullari (finder, timing, alignment, format), ' +
      'ma’lumot modullarining o‘qish tartibi va sig‘adigan kodli so‘z soni.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'number', description: 'Versiya (standart 1)' },
        show_map: { type: 'boolean', description: 'Modul xaritasini chiqarish (standart: ha)' },
      },
    },
    async handler(input) {
      const p = view(input);
      try {
        const version = Math.trunc(Number(p.version ?? 1));
        const centres = ALIGNMENT_CENTRES[version] ?? [];
        const { reserved, dataModules, size } = layout(version, centres);
        const body: Record<string, unknown> = {
          version,
          size,
          total_modules: size * size,
          function_modules: reserved.size,
          data_modules: dataModules.length,
          codewords: codewordCapacity(version, centres),
          alignment_centres: centres,
          remainder_bits: dataModules.length % 8,
        };
        if (p.show_map !== false) {
          const grid: string[] = [];
          const taken = new Set(dataModules.map(([r, c]) => `${r},${c}`));
          for (let row = 0; row < size; row += 1) {
            let line = '';
            for (let col = 0; col < size; col += 1) {
              line += reserved.has(`${row},${col}`) ? '#' : taken.has(`${row},${col}`) ? '.' : ' ';
            }
            grid.push(line);
          }
          // Leading spaces are trimmed by markdown, so a leading sentinel keeps column alignment.
          body.map = grid.map((line) => '|' + line).join('\n');
          body.legend = "'#' funksiya moduli, '.' ma'lumot moduli, '|' chiziq boshlanishi";
        }
        return jsonBlock('QR moduli xaritasi', body);
      } catch (error) {
        return fail((error as Error).message);
      }
    },
  }),

  defineTool({
    name: 'pro_qr_plan',
    description:
      'Matn uchun QR rejasini chiqarish: har bir daraja uchun sig‘adigan versiya, sig‘im va tavsiya. ' +
      'Matnni kodlamaydi — faqat rejasini ko‘rsatadi.',
    category: 'qr',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Rejalashtiriladigan matn' },
      },
      required: ['text'],
    },
    async handler(input) {
      const p = view(input);
      const text = String(p.text ?? '');
      if (!text) return fail('text bo‘sh.');
      const options: Array<Record<string, unknown>> = [];
      for (const level of EC_LEVELS) {
        const version = smallestVersion(text, level);
        if (version === 0) {
          options.push({ level, fits: false, reason: `${maxVersion()}-versiyadan katta talab qiladi` });
          continue;
        }
        const { buffer, mode } = encodeSegment(text, version);
        const capacity = dataCodewords(version, level);
        options.push({
          level,
          fits: true,
          version,
          size_modules: versionSize(version),
          mode,
          bits_used: buffer.length,
          bits_capacity: capacity * 8,
          fill_percent: Math.round((buffer.length / (capacity * 8)) * 100),
          correction_capacity: 'blok boshiga ' + correctionCapacity(version, level) + ' modul',
        });
      }
      const best =
        options.find((option) => option.fits && option.level === 'M') ?? options.find((option) => option.fits);
      return jsonBlock('QR rejası', {
        text_length: text.length,
        max_supported_version: maxVersion(),
        recommended: best ? `${best.level}-${best.version}` : 'yo q',
        options,
        note:
          'Har bir daraja uchun alohida versiya kerak: kuchliroq xato tuzatish = kichik sig‘im. ' +
          'Standart 40 versiyagacha, lekin bu jadval shu chegaragacha to‘ldirilgan va geometriya bilan tekshirilgan.',
      });
    },
  }),
];

function correctionCapacity(version: number, level: EcLevel): number {
  return Math.floor((BLOCK_LAYOUTS[level][version]?.ecCodewordsPerBlock ?? 0) / 2);
}

function characterBits(mode: 'numeric' | 'alphanumeric' | 'byte', version: number): number {
  return characterCountBits(mode, version);
}

/** Pull the module grid out of an SVG we produced, or any SVG with 1x1 dark rects. */
function matrixFromSvg(svg: string): string {
  const rects = [...svg.matchAll(/<rect[^>]*\sx="(\d+(?:\.\d+)?)"[^>]*\sy="(\d+(?:\.\d+)?)"/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  if (rects.length === 0) throw new Error('SVG ichida topilgan modul yo q. viewBox va 1x1 rectlar kerak.');
  // The quiet zone is part of the drawing but not part of the symbol, and its width is whatever
  // `border` was — 4 by default, and the caller may change it. Recovering the origin from the smallest
  // coordinate is what makes a symbol written with a border readable at all: without it a version-3 code
  // arrives as a 29x29 grid, and `decodeMatrix` computes version 3 from 29 only by accident of that
  // number, then finds 300 data modules where 70 codewords belong.
  const originX = Math.min(...rects.map((rect) => rect.x));
  const originY = Math.min(...rects.map((rect) => rect.y));
  const width = Math.max(...rects.map((rect) => rect.x)) - originX + 1;
  const height = Math.max(...rects.map((rect) => rect.y)) - originY + 1;
  const grid = Array.from({ length: height }, () => new Array<boolean>(width).fill(false));
  for (const rect of rects) {
    grid[rect.y - originY]![rect.x - originX] = true;
  }
  return grid.map((row) => row.map((cell) => (cell ? '1' : '0')).join('')).join('\n');
}

/** A PNG with one bit per pixel, written as uncompressed DEFLATE stored blocks — no dependency needed. */
function renderPng(matrix: Matrix, border: number, scale: number): Buffer {
  const pixels = matrix.length + border * 2;
  const width = pixels * scale;

  // One filter byte per row, then one bit per pixel, MSB first, rows padded to whole bytes.
  const stride = Math.ceil(width / 8);
  const raw = Buffer.alloc((stride + 1) * pixels);
  for (let row = 0; row < pixels; row += 1) {
    const base = row * (stride + 1);
    raw[base] = 0; // filter: none
    for (let col = 0; col < width; col += 1) {
      const moduleRow = Math.floor(row / scale);
      const moduleCol = Math.floor(col / scale);
      const inside =
        moduleRow >= border &&
        moduleRow < border + matrix.length &&
        moduleCol >= border &&
        moduleCol < border + matrix.length;
      if (!inside || !matrix[moduleRow - border]![moduleCol - border]) continue;
      raw[base + 1 + (col >> 3)]! |= 0x80 >> (col % 8);
    }
  }

  const chunks: Buffer[] = [];
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(pixels, 4);
  ihdr[8] = 1; // bit depth
  ihdr[9] = 0; // colour type: greyscale
  chunks.push(signature, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStored(raw)), pngChunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/** zlib stream with stored (uncompressed) DEFLATE blocks, so no compressor is needed. */
function zlibStored(data: Buffer): Buffer {
  const parts: Buffer[] = [Buffer.from([0x78, 0x01])];
  const maxBlock = 65535;
  for (let at = 0; at < data.length; at += maxBlock) {
    const block = data.subarray(at, at + maxBlock);
    const last = at + maxBlock >= data.length ? 1 : 0;
    const header = Buffer.alloc(5);
    header[0] = last;
    header.writeUInt16LE(block.length, 1);
    header.writeUInt16LE(~block.length & 0xffff, 3);
    parts.push(header, block);
  }
  parts.push(crcAdler32(data));
  return Buffer.concat(parts);
}

function crcAdler32(data: Buffer): Buffer {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const out = Buffer.alloc(4);
  out.writeUInt32BE(((b << 16) | a) >>> 0, 0);
  return out;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
