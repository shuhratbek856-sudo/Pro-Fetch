// QR kategoriyasi: Reed-Solomon, geometriya va round trip.
//
// Uch narsa alohida tekshiriladi, chunki ular bir-birining xatosini yashiradi:
//   1. RS mustaqil ravishda: kodlash, buzish, tuzatish, solishtirish
//   2. Geometriya: jadval hisoblanuvchi modul soniga sig'ishi kerak
//   3. Round trip: kodlash -> matritsa -> o'qish. Bu o'z-o'ziga mosligini isbotlaydi,
//      skaner bilan mosligini EMAS — bu farq testlarda ham yozib qo'yilgan.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gfDiv, gfMul, gfPow, generatorPoly, rsDecode, rsEncode } from '../src/tools/qr/_galois.js';
import { codewordCapacity, layout } from '../src/tools/qr/_layout.js';
import {
  ALIGNMENT_CENTRES,
  BLOCK_LAYOUTS,
  EC_LEVELS,
  FORMAT_BITS,
  dataCodewords,
  formatBits,
  maxVersion,
  versionBits,
  versionSize,
  type EcLevel,
} from '../src/tools/qr/_tables.js';
import { decodeMatrix, encode, interleave, smallestVersion } from '../src/tools/qr/_encode.js';
import { dispatch } from '../src/core/tool.js';
import type { ToolResult } from '../src/core/types.js';

/** Deterministic pseudo-random bytes, so a failure can be reproduced exactly. */
function makeData(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    out[i] = state & 0xff;
  }
  return out;
}

const body = (result: ToolResult): Record<string, unknown> => {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  if (match) return JSON.parse(match[1]) as Record<string, unknown>;
  return { raw: text };
};

let workspace: string;

beforeAll(async () => {
  process.env.PRO_FETCH_PROFILE = 'full';
  workspace = mkdtempSync(path.join(tmpdir(), 'pf-qr-'));
  process.env.PRO_FETCH_OUTPUT_ROOT = workspace;
  process.env.PRO_FETCH_CACHE_DIR = workspace;
  await import('../src/env.js');
  await import('../src/loader.js');
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('GF(256) maydoni', () => {
  it('har bir nolmas qiymatning teskarisi bor', () => {
    for (let a = 1; a < 256; a += 1) {
      for (let b = 1; b < 256; b += 29) {
        expect(gfDiv(gfMul(a, b), b)).toBe(a);
      }
    }
  });

  it("a^255 = 1, ya'ni siklik 255", () => {
    for (let a = 1; a < 256; a += 1) expect(gfPow(a, 255)).toBe(1);
  });

  it("oddiy ko'paytirishdan farqlanadi", () => {
    // GF(256) is not arithmetic mod 256. `3^5` is 51 here and 243 under `* % 256`, so a test that
    // expects the ordinary answer is testing the wrong field.
    expect(gfPow(3, 5)).toBe(51);
    expect(3 ** 5 % 256).toBe(243);
  });

  it("nolga bo'lish rad etiladi, nol qaytarilmaydi", () => {
    expect(() => gfDiv(5, 0)).toThrow();
  });

  it('generator polinomi monik va tushuvchi tartibda', () => {
    expect(generatorPoly(1)).toEqual([1, 1]);
    expect(generatorPoly(2)).toEqual([1, 3, 2]);
    expect(generatorPoly(3)).toEqual([1, 7, 14, 8]);
    for (let degree = 1; degree <= 30; degree += 1) {
      expect(generatorPoly(degree)[0], `degree ${degree}`).toBe(1);
    }
  });
});

describe('Reed-Solomon', () => {
  it("kodinglanmagan kodli so'z sindromasi nol", () => {
    // The check that exposed the encoder: every generated codeword must be a multiple of the
    // generator, or `rsDecode` reports errors on a block that was never damaged.
    const data = makeData(20, 1234);
    const codeword = new Uint8Array(20 + 14);
    codeword.set(data, 0);
    codeword.set(rsEncode(data, 14), 20);
    const result = rsDecode(codeword, 14);
    expect(result.corrected).not.toBeNull();
    expect(result.errorsCorrected).toBe(0);
  });

  it.each([
    [10, 6],
    [16, 10],
    [20, 16],
    [44, 28],
    [8, 4],
  ])('capacity xatoni tiklaydi: %i bayt / %i tekshiruv', (dataLength, parity) => {
    const data = makeData(dataLength, dataLength * 7 + parity);
    const codeword = new Uint8Array(dataLength + parity);
    codeword.set(data, 0);
    codeword.set(rsEncode(data, parity), dataLength);

    const damaged = Uint8Array.from(codeword);
    for (let k = 0; k < Math.floor(parity / 2); k += 1) {
      damaged[codeword.length - 1 - k] = (damaged[codeword.length - 1 - k]! ^ 0xa5) & 0xff;
    }
    const result = rsDecode(damaged, parity);
    expect(result.corrected).not.toBeNull();
    expect([...result.corrected!]).toEqual([...codeword]);
  });

  it('bitta xato, 200 ta tasodifiy joy — hammasi tiklanadi', () => {
    const data = makeData(24, 555);
    const parity = 16;
    const codeword = new Uint8Array(24 + parity);
    codeword.set(data, 0);
    codeword.set(rsEncode(data, parity), 24);

    let state = 987654321;
    for (let trial = 0; trial < 200; trial += 1) {
      state = (state * 1103515245 + 12345) >>> 0;
      const damaged = Uint8Array.from(codeword);
      damaged[state % codeword.length] = (damaged[state % codeword.length]! ^ 0xff) & 0xff;
      const result = rsDecode(damaged, parity);
      expect(result.corrected, `trial ${trial}`).not.toBeNull();
      expect([...result.corrected!]).toEqual([...codeword]);
    }
  });

  it('ikki xato, 100 ta tasodifiy juftlik — hammasi tiklanadi', () => {
    const data = makeData(30, 1234);
    const parity = 20;
    const codeword = new Uint8Array(30 + parity);
    codeword.set(data, 0);
    codeword.set(rsEncode(data, parity), 30);

    let state = 24680;
    for (let trial = 0; trial < 100; trial += 1) {
      const damaged = Uint8Array.from(codeword);
      for (let k = 0; k < 2; k += 1) {
        state = (state * 1103515245 + 12345) >>> 0;
        const at = state % codeword.length;
        damaged[at] = (damaged[at]! ^ 0x3c) & 0xff;
      }
      const result = rsDecode(damaged, parity);
      expect(result.corrected, `trial ${trial}`).not.toBeNull();
      expect([...result.corrected!]).toEqual([...codeword]);
    }
  });

  it("capacity dan ko'p xato — \"yo q\" deyadi, noto'g'ri natija qaytarmaydi", () => {
    const data = makeData(16, 999);
    const parity = 10;
    const codeword = new Uint8Array(16 + parity);
    codeword.set(data, 0);
    codeword.set(rsEncode(data, parity), 16);

    const damaged = Uint8Array.from(codeword);
    for (let k = 0; k < 6; k += 1) damaged[k] = (damaged[k]! ^ 0x5c) & 0xff;
    const result = rsDecode(damaged, parity);
    expect(result.corrected).toBeNull();
    expect(result.unrecoverable).toMatch(/chegaradan|xatolar/i);
  });
});

describe('geometriya jadval bilan mos', () => {
  it("har bir daraja uchun data + EC so'zlar sig'imodan aniq teng", () => {
    // The check that caught the table drift. A row that claims more codewords than the geometry holds
    // cannot be encoded at all, and nothing else in the suite would have noticed.
    for (const level of EC_LEVELS) {
      for (let version = 1; version <= 40; version += 1) {
        const row = BLOCK_LAYOUTS[level][version];
        if (!row) continue;
        const blocks = row.group1Blocks + row.group2Blocks;
        const total = dataCodewords(version, level) + blocks * row.ecCodewordsPerBlock;
        const capacity = codewordCapacity(version, ALIGNMENT_CENTRES[version] ?? []);
        expect(total, `${level}-v${version}`).toBe(capacity);
      }
    }
  });

  it("v1 da 208 modul = 26 so'z", () => {
    // Worked out by hand: three finder patterns with separators (3x64), timing (10), format (15+15+1).
    const { dataModules } = layout(1, []);
    expect(dataModules.length).toBe(208);
    expect(Math.floor(dataModules.length / 8)).toBe(26);
  });

  it("ma'lumot modullari hech qachon funksiya moduli bilan ustma-ust tushmaydi", () => {
    for (let version = 1; version <= maxVersion(); version += 1) {
      const { reserved, dataModules } = layout(version, ALIGNMENT_CENTRES[version] ?? []);
      expect(new Set(dataModules.map(([r, c]) => `${r},${c}`)).size).toBe(dataModules.length);
      for (const [row, col] of dataModules) {
        expect(reserved.has(`${row},${col}`), `v${version} (${row},${col})`).toBe(false);
      }
    }
  });

  it('qator 6 va ustun 6 butunlay timing', () => {
    for (let version = 1; version <= maxVersion(); version += 1) {
      const { dataModules } = layout(version, ALIGNMENT_CENTRES[version] ?? []);
      const size = versionSize(version);
      expect(
        dataModules.some(([r]) => r === 6),
        `v${version} qator 6`,
      ).toBe(false);
      expect(
        dataModules.some(([, c]) => c === 6),
        `v${version} ustun 6`,
      ).toBe(false);
      expect(size % 4).toBe(1);
    }
  });

  it('tekshirilmagan jadval qatorlari umuman yo q', () => {
    // Rows that could not be verified against the geometry were removed rather than left in place, so an
    // encoder cannot pick one up and produce a symbol whose capacity is wrong. Measured ceilings: L and M
    // reach version 21 and 20, Q and H only 6 and 10, so the ceiling for *every* level is 6.
    //
    // The per-level ceiling is asserted separately, because a single `maxVersion()` cannot express it and
    // "the table stops at 6" would be false of L.
    expect(maxVersion()).toBe(6);

    const lastCovered: Record<string, number> = {};
    for (const level of EC_LEVELS) {
      let last = 0;
      for (let version = 1; version <= 40; version += 1) {
        const row = BLOCK_LAYOUTS[level][version];
        if (!row) continue;
        const blocks = row.group1Blocks + row.group2Blocks;
        const total = dataCodewords(version, level) + blocks * row.ecCodewordsPerBlock;
        expect(total, `${level}-v${version} sig‘ishi kerak`).toBe(
          codewordCapacity(version, ALIGNMENT_CENTRES[version] ?? []),
        );
        last = version;
      }
      lastCovered[level] = last;
    }
    expect(lastCovered).toEqual({ L: 21, M: 20, Q: 6, H: 10 });

    // Everything past each level's own ceiling is absent, and asking for it is refused rather than
    // answered from an unverified row.
    for (const level of EC_LEVELS) {
      for (let version = lastCovered[level]! + 1; version <= 40; version += 1) {
        expect(BLOCK_LAYOUTS[level][version], `${level}-v${version} bo‘lishi kerak emas`).toBeUndefined();
        expect(() => dataCodewords(version, level), `${level}-v${version}`).toThrow(/jadvalda yo q/);
      }
    }
  });

  it('jadval chegarasi izchil: blok uzunligi farq qilmaydi', () => {
    for (const level of EC_LEVELS) {
      for (let version = 1; version <= maxVersion(); version += 1) {
        const row = BLOCK_LAYOUTS[level][version]!;
        if (row.group2Blocks > 0) {
          expect(Math.abs(row.group2DataCodewords - row.group1DataCodewords)).toBe(1);
        }
        expect(row.group1Blocks).toBeGreaterThan(0);
        expect(row.ecCodewordsPerBlock).toBeGreaterThan(0);
      }
    }
  });
});

describe("format va versiya ma'lumoti", () => {
  it("16 ta e'lon qilingan format qiymati BCH bilan mos", () => {
    let checked = 0;
    for (const level of EC_LEVELS) {
      for (let mask = 0; mask < FORMAT_BITS[level].length; mask += 1) {
        expect(formatBits(level, mask), `${level}/${mask}`).toBe(FORMAT_BITS[level][mask]);
        checked += 1;
      }
    }
    expect(checked).toBe(16);
  });

  it('32 ta format kombinasiasi 15 bit ichida', () => {
    for (const level of EC_LEVELS) {
      for (let mask = 0; mask < 8; mask += 1) {
        const bits = formatBits(level, mask);
        expect(bits).toBeGreaterThanOrEqual(0);
        expect(bits).toBeLessThanOrEqual(0x7fff);
      }
    }
  });

  it("versiya ma'lumoti 7..40 uchun BCH(18,6)", () => {
    for (let version = 7; version <= 40; version += 1) {
      const bits = versionBits(version);
      expect(bits >> 12, `v${version}`).toBe(version);
      let value = bits;
      const generator = 0b1111100100101;
      for (let bit = 17; bit >= 12; bit -= 1) {
        if ((value >> bit) & 1) value ^= generator << (bit - 12);
      }
      expect(value & 0xfff, `v${version} BCH qoldig'i`).toBe(0);
    }
    expect(() => versionBits(6)).toThrow();
  });
});

describe('QR belgisi round trip', () => {
  it.each(
    EC_LEVELS.flatMap((level) =>
      Array.from({ length: maxVersion() }, (_unused, index) => [level, index + 1] as const),
    ).filter(([level, version]) => BLOCK_LAYOUTS[level][version] !== undefined),
  )("%s-v%i: kodlash va o'qish bir xil matn", (level, version) => {
    const capacity = dataCodewords(version, level as EcLevel);
    const text = 'A'.repeat(Math.max(1, Math.floor(capacity / 2)));
    const encoded = encode(text, level as EcLevel, version);
    expect(encoded.version).toBe(version);
    expect(decodeMatrix(encoded.matrix).text).toBe(text);
  });

  it('raqamli segment', () => {
    const encoded = encode('12345678901234567890', 'L');
    expect(encoded.mode).toBe('numeric');
    expect(decodeMatrix(encoded.matrix).text).toBe('12345678901234567890');
  });

  it('harf-arif segment', () => {
    const encoded = encode('HELLO WORLD', 'M');
    expect(encoded.mode).toBe('alphanumeric');
    expect(decodeMatrix(encoded.matrix).text).toBe('HELLO WORLD');
  });

  it('bayt segmenti UTF-8 ni saqlaydi', () => {
    const text = 'Salom, dunyo! 😀 ñ';
    const encoded = encode(text, 'M');
    expect(encoded.mode).toBe('byte');
    expect(decodeMatrix(encoded.matrix).text).toBe(text);
  });

  it("yakka harf-arif belgi oxirida ham to'g'ri", () => {
    // An odd-length alphanumeric string ends on a single character, whose six bits are its index
    // directly. Dividing that by 45 turned "HELLO" into "HELL0".
    for (const text of ['A', 'AB', 'ABC', 'ABCD', 'ABCDE']) {
      const encoded = encode(text, 'M');
      expect(decodeMatrix(encoded.matrix).text, text).toBe(text);
    }
  });

  it('buzilgan modullarni xato tuzatadi', () => {
    const encoded = encode('ERROR CORRECTION TEST', 'H');
    const damaged = encoded.matrix.map((row) => row.slice());
    let broken = 0;
    for (let row = 0; row < damaged.length; row += 1) {
      for (let col = 0; col < damaged.length; col += 1) {
        if ((row * 7 + col * 13) % 97 === 0 && broken < 4) {
          damaged[row]![col] = !damaged[row]![col]!;
          broken += 1;
        }
      }
    }
    const decoded = decodeMatrix(damaged);
    expect(broken).toBeGreaterThan(0);
    expect(decoded.text).toBe('ERROR CORRECTION TEST');
    expect(decoded.note).toMatch(/modul tuzatildi/);
  });

  it('juda ko\'p buzilgan — "yo q" deyadi', () => {
    const encoded = encode('A'.repeat(20), 'L');
    const damaged = encoded.matrix.map((row) => row.slice());
    for (let row = 0; row < damaged.length; row += 2) {
      for (let col = 0; col < damaged.length; col += 1) damaged[row]![col] = !damaged[row]![col]!;
    }
    expect(decodeMatrix(damaged).text).not.toBe('A'.repeat(20));
  });

  it("har sakkizta niqob o'qiladi", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const encoded = encode('MASK TEST', 'Q', 4, mask);
      expect(encoded.mask).toBe(mask);
      expect(decodeMatrix(encoded.matrix).text, `mask ${mask}`).toBe('MASK TEST');
    }
  });

  it('uchala finder namunasi 7x7 halqa bilan', () => {
    const { matrix, size } = encode('TEST', 'M');
    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      for (let row = 0; row < 7; row += 1) {
        for (let col = 0; col < 7; col += 1) {
          const ring = row === 0 || row === 6 || col === 0 || col === 6;
          const centre = row >= 2 && row <= 4 && col >= 2 && col <= 4;
          expect(matrix[top + row]![left + col], `(${top + row},${left + col})`).toBe(ring || centre);
        }
      }
    }
  });

  it('timing pattern navbatlashadi', () => {
    const { matrix, size } = encode('TEST', 'M', 2);
    for (let i = 8; i < size - 8; i += 1) {
      expect(matrix[6]![i], `qator (6,${i})`).toBe(i % 2 === 0);
      expect(matrix[i]![6], `ustun (${i},6)`).toBe(i % 2 === 0);
    }
  });

  it("dark module doim to'g'ri", () => {
    const { matrix, size } = encode('TEST', 'M');
    expect(matrix[size - 8]![8]).toBe(true);
  });

  it('chiqish xabari round trip va skaner farqini aytadi', async () => {
    // Stated because a round trip does not prove a camera reads the symbol, and a tool that implies
    // otherwise is making a claim it cannot back.
    const encoded = body(await dispatch('pro_qr_encode', { text: 'CLAIM', level: 'M', format: 'matrix' }));
    expect(String(encoded.verified)).toMatch(/Round trip/);
    expect(String(encoded.verified)).toMatch(/Skaner.*tekshirilmadi/i);
  });

  it('eng kichik versiya encode bilan mos', () => {
    for (const [text, level] of [
      ['123', 'L'],
      ['HELLO WORLD', 'M'],
      ['https://example.com/path?query=1', 'Q'],
    ] as Array<[string, EcLevel]>) {
      expect(encode(text, level).version, `${text} ${level}`).toBe(smallestVersion(text, level));
    }
  });

  it("sig'maydigan matn rad etiladi", () => {
    expect(() => encode('A'.repeat(10_000), 'H', 1)).toThrow(/bit/);
  });

  it("interleave qismi to'g'ri uzunlikda", () => {
    // The parity must be written after each block's data. Written from index 0, the symbol keeps its
    // shape and every field pattern verifies, but the codewords are not a multiple of the generator.
    for (const level of EC_LEVELS) {
      for (let version = 1; version <= maxVersion(); version += 1) {
        const row = BLOCK_LAYOUTS[level][version];
        if (!row) continue;
        const data = makeData(dataCodewords(version, level), version * 31 + 7);
        const expected = codewordCapacity(version, ALIGNMENT_CENTRES[version] ?? []);
        expect(interleave(data, version, level).length, `${level}-v${version}`).toBe(expected);
      }
    }
  });
});

describe("QR tool'lari", () => {
  it('encode matrix va decode bir-birini taniydi', async () => {
    const encoded = body(await dispatch('pro_qr_encode', { text: 'https://pro-fetch.dev', level: 'M' }));
    const decoded = body(await dispatch('pro_qr_decode', { matrix: encoded.matrix }));
    expect(decoded.text).toBe('https://pro-fetch.dev');
  });

  it("encode SVG va decode undan o'qiladi, chegara hisobga olingan holda", async () => {
    // The quiet zone is part of the drawing but not the symbol; without recovering its origin a
    // version-3 code arrives as a 29x29 grid.
    for (const border of [0, 2, 4, 7]) {
      const encoded = body(
        await dispatch('pro_qr_encode', { text: `BORDER ${border}`, level: 'L', format: 'svg', border }),
      );
      const decoded = body(await dispatch('pro_qr_decode', { svg: encoded.svg }));
      expect(decoded.text, `border ${border}`).toBe(`BORDER ${border}`);
    }
  });

  it('encode PNG haqiqiy rasm fayli', async () => {
    const encoded = body(await dispatch('pro_qr_encode', { text: 'PNG', format: 'png' }));
    const bytes = Buffer.from(String(encoded.png_base64), 'base64');
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const start = bytes.indexOf(Buffer.from('IDAT')) + 4;
    const inflated = await import('node:zlib').then((zlib) =>
      zlib.inflateSync(bytes.subarray(start, bytes.length - 12)),
    );
    expect(inflated.length).toBeGreaterThan(0);
  });

  it('capacity geometriyadan hisoblanadi', async () => {
    const result = body(await dispatch('pro_qr_capacity', { version: 5, level: 'M' }));
    const rows = result.rows as Array<Record<string, unknown>>;
    expect(rows[0]!.data_codewords).toBe(86);
    expect(rows[0]!.total_codewords).toBe(134);
    expect(result.max_supported_version).toBe(maxVersion());
  });

  it('rs_encode va rs_decode bir-biriga mos', async () => {
    const encoded = body(await dispatch('pro_qr_rs_encode', { data: '1,2,3,4,5,6,7,8,9,10', parity: 6 }));
    expect(encoded.total_codewords).toBe(16);
    const decoded = body(await dispatch('pro_qr_rs_decode', { codeword: encoded.codeword_hex, parity: 6, corrupt: 3 }));
    expect(decoded.errors_corrected).toBe(3);
  });

  it('rs_decode capacity dan ko\'p buzilsa "yo q" deyadi', async () => {
    const encoded = body(await dispatch('pro_qr_rs_encode', { data: '1,2,3,4,5,6,7,8,9,10', parity: 6 }));
    const decoded = body(await dispatch('pro_qr_rs_decode', { codeword: encoded.codeword_hex, parity: 6, corrupt: 6 }));
    expect(decoded.errors_corrected).toBeUndefined();
    expect(String(decoded.reason)).toMatch(/chegaradan|xatolar/i);
  });

  it("field maydoni o'z-o'zini tekshiradi", async () => {
    const result = body(await dispatch('pro_qr_field', { a: 3, b: 7, exponent: 5, generator_degree: 3 }));
    expect(result.multiply).toBe(9);
    expect(result.power).toBe(51);
    expect(result.field_verified).toBe(true);
  });

  it("format_info e'lon qilingan qiymatlar bilan mos", async () => {
    const result = body(await dispatch('pro_qr_format_info', {}));
    const formats = result.format_information as Array<{ matches_published: unknown }>;
    expect(formats.filter((entry) => entry.matches_published === false)).toEqual([]);
  });

  it('layout moduli xaritasi beradi', async () => {
    const result = body(await dispatch('pro_qr_layout', { version: 3 }));
    expect(result.size).toBe(29);
    expect(result.codewords).toBe(70);
    expect(String(result.map)).toContain('#');
    expect(String(result.legend)).toMatch(/funksiya moduli/);
  });

  it('plan har bir daraja uchun variant beradi', async () => {
    const result = body(await dispatch('pro_qr_plan', { text: 'https://example.com/some/path?q=1' }));
    expect((result.options as unknown[]).length).toBe(4);
    expect(result.recommended).toMatch(/^M-/);
  });

  it('xato daraja rad etiladi va imkoniyatlarni nomlaydi', async () => {
    const result = await dispatch('pro_qr_encode', { text: 'x', level: 'Z' });
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n');
    expect(text).toMatch(/Xato daraja/);
    expect(text).toMatch(/L, M, Q, H/);
  });

  it("noma'lum belgi matrisada rad etiladi", async () => {
    const result = await dispatch('pro_qr_decode', { matrix: '#X#\n###' });
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n');
    expect(text).toMatch(/Noma.lum belgi/);
  });

  it('turli uzunlikdagi qatorlar rad etiladi', async () => {
    const result = await dispatch('pro_qr_decode', { matrix: '###\n####\n###' });
    const text = (result.content ?? [])
      .filter((item) => item.type === 'text')
      .map((item) => item.text ?? '')
      .join('\n');
    expect(text).toMatch(/bir xil uzunlikda/);
  });

  it("tekis, lekin belgi emas, matritsa o'qilmaydi va sababini aytadi", async () => {
    const result = body(await dispatch('pro_qr_decode', { matrix: '###\n###\n###' }));
    expect(String(result.error)).toMatch(/mos emas/);
  });
});
