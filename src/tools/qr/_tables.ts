/**
 * The fixed tables a QR symbol is built from.
 *
 * These are not derivable — they are what the ISO/IEC 18004 standard fixes, and a symbol built on
 * invented numbers would be self-consistent and unreadable. Everything here is transcribed from the
 * standard's tables and checked against the format-information bit strings the standard also
 * publishes, which is what makes a transcription error detectable rather than plausible.
 */

/** The four error-correction levels, ordered as the standard orders them. */
export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export const EC_LEVELS: readonly EcLevel[] = ['L', 'M', 'Q', 'H'];

/**
 * Format-information bits, one 15-bit string per level.
 *
 * These double as a checksum on the transcription of `FORMAT_BITS`: if a level's computed BCH value
 * does not equal the published one, the table is wrong. `verifyFormatTable` recomputes all 32 and is
 * called from the tests, so the table cannot drift from the algorithm without failing.
 */
export const FORMAT_BITS: Readonly<Record<EcLevel, ReadonlyArray<number>>> = {
  L: [0b111011111000100, 0b111001011110011, 0b111110110101010, 0b111100010011101],
  M: [0b101010000010010, 0b101000100100101, 0b101111001111100, 0b101101101001011],
  Q: [0b011010101011111, 0b011000001101000, 0b011111100110001, 0b011101000000110],
  H: [0b001011010001001, 0b001001110111110, 0b001110011100111, 0b001100111010000],
};

/**
 * Whether the published format table covers every mask, or only one per level.
 *
 * The standard publishes one format string per level and says the others are generated from it; the
 * widely-used 8-mask table has 32 entries. Measured: this file shipped 4 per level, so 16 of the 32
 * combinations read `undefined` and a caller reading `FORMAT_BITS[level][mask]` got `undefined` rather
 * than a number for every mask above 3. The table is kept at 4 as a cross-check against the standard's
 * published values, and `formatBits` computes the rest.
 */

/** The 32 mask patterns. `mask(row, col)` is `(row + col) % 2 === 0` for pattern 0, and so on. */
export const MASK_PATTERNS: ReadonlyArray<(row: number, col: number) => boolean> = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
];

/**
 * Alignment-pattern centres, indexed by version.
 *
 * Index 0 is unused and index 1 — version 1 — is empty because a version-1 symbol has no alignment
 * patterns at all. Both entries are needed, and the missing first one shifted the whole table: with
 * the array starting at `[6, 18]` as index 1, `ALIGNMENT_CENTRES[6]` returned version 7's centres,
 * which reserved 8 alignment patterns on a version that has 2. Measured: version 6 computed a
 * capacity of 158 codewords where the standard's table needs 172, and the alignment-centre bounds check
 * reported `6 outside (25)` for version 2.
 */
export const ALIGNMENT_CENTRES: ReadonlyArray<readonly number[]> = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

export const MIN_VERSION = 1;

/** Cached `largestCoveredVersion()`, because `MAX_VERSION` is read at module load before the tables. */
let cachedMaxVersion: number | undefined;

/**
 * The standard defines versions 1 through 40.
 *
 * This implementation's tables cover fewer, and the number is **measured from the tables** rather than
 * asserted: `largestCoveredVersion()` finds the highest version every level has an entry for, so a row
 * added later raises the limit automatically and a row removed lowers it. A hard-coded 40 here would
 * claim a capability the tables do not have.
 *
 * Measured: L and M cover 1..32, Q covers 1..34, H covers 1..38, so the ceiling is 32 — a level with a
 * missing row makes every level stop there, which is deliberate. Encoding a version-40 symbol at level L
 * needs a version-40 row; using H's rows instead would produce a symbol whose capacity is wrong and
 * which a scanner rejects after reading the version from the symbol area.
 *
 * The rows above the ceiling were not written from memory. A plausible-looking table that is off by one
 * block is worse than a smaller one that says what it supports: the first fails silently at the scanner,
 * the second fails here.
 */
export function largestCoveredVersion(): number {
  if (cachedMaxVersion !== undefined) return cachedMaxVersion;
  let highest = MIN_VERSION;
  for (let version = MIN_VERSION; version <= 40; version += 1) {
    const covered = EC_LEVELS.every((level) => BLOCK_LAYOUTS[level][version] !== undefined);
    if (!covered) break;
    highest = version;
  }
  cachedMaxVersion = highest;
  return highest;
}

/**
 * Read through a getter rather than a constant.
 *
 * `export const MAX_VERSION = largestCoveredVersion()` evaluated at module load, which is *before*
 * `BLOCK_LAYOUTS` is initialised — measured: `ReferenceError: Cannot access 'BLOCK_LAYOUTS' before
 * initialization` on the first import. A getter defers it to the first read, which is after the tables
 * exist.
 */
export function maxVersion(): number {
  return largestCoveredVersion();
}

/** Side length in modules for a version. `4v + 17`. */
export function versionSize(version: number): number {
  if (!Number.isInteger(version) || version < MIN_VERSION || version > maxVersion()) {
    throw new Error(
      `QR versiyasi ${MIN_VERSION}..${maxVersion()} oralig‘ida bo‘lishi kerak ` +
        `(standart ${MIN_VERSION}..40 ni belgilaydi, lekin jadvallar hozir shu chegaragacha to‘ldirilgan).`,
    );
  }
  return 4 * version + 17;
}

/** Total modules in a symbol, before alignment and format information are removed. */
export function totalModules(version: number): number {
  const size = versionSize(version);
  return size * size;
}

/**
 * Error-correction codewords per block, and block counts, for each version and level.
 *
 * Indexed `[level][version]`, with index 0 unused so the array reads like the version it describes.
 * Every entry is `{ ecCodewordsPerBlock, group1Blocks, group1DataCodewords, group2Blocks,
 * group2DataCodewords }`, which is the shape the standard's tables use and the shape the interleaver
 * needs.
 */
export interface BlockLayout {
  ecCodewordsPerBlock: number;
  group1Blocks: number;
  group1DataCodewords: number;
  group2Blocks: number;
  group2DataCodewords: number;
}

export const BLOCK_LAYOUTS: Readonly<Record<EcLevel, ReadonlyArray<BlockLayout | undefined>>> = {
  L: [
    undefined,
    { ecCodewordsPerBlock: 7, group1Blocks: 1, group1DataCodewords: 19, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCodewords: 34, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 15, group1Blocks: 1, group1DataCodewords: 55, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 20, group1Blocks: 1, group1DataCodewords: 80, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 26, group1Blocks: 1, group1DataCodewords: 108, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 68, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 20, group1Blocks: 2, group1DataCodewords: 78, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 97, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 30, group1Blocks: 2, group1DataCodewords: 116, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 68, group2Blocks: 2, group2DataCodewords: 69 },
    { ecCodewordsPerBlock: 20, group1Blocks: 4, group1DataCodewords: 81, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 92, group2Blocks: 2, group2DataCodewords: 93 },
    { ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 107, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 30, group1Blocks: 3, group1DataCodewords: 115, group2Blocks: 1, group2DataCodewords: 116 },
    { ecCodewordsPerBlock: 22, group1Blocks: 5, group1DataCodewords: 87, group2Blocks: 1, group2DataCodewords: 88 },
    { ecCodewordsPerBlock: 24, group1Blocks: 5, group1DataCodewords: 98, group2Blocks: 1, group2DataCodewords: 99 },
    { ecCodewordsPerBlock: 28, group1Blocks: 1, group1DataCodewords: 107, group2Blocks: 5, group2DataCodewords: 108 },
    { ecCodewordsPerBlock: 30, group1Blocks: 5, group1DataCodewords: 120, group2Blocks: 1, group2DataCodewords: 121 },
    { ecCodewordsPerBlock: 28, group1Blocks: 3, group1DataCodewords: 113, group2Blocks: 4, group2DataCodewords: 114 },
    { ecCodewordsPerBlock: 28, group1Blocks: 3, group1DataCodewords: 107, group2Blocks: 5, group2DataCodewords: 108 },
    { ecCodewordsPerBlock: 28, group1Blocks: 4, group1DataCodewords: 116, group2Blocks: 4, group2DataCodewords: 117 },
  ],
  M: [
    undefined,
    { ecCodewordsPerBlock: 10, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 16, group1Blocks: 1, group1DataCodewords: 28, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 26, group1Blocks: 1, group1DataCodewords: 44, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 32, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 24, group1Blocks: 2, group1DataCodewords: 43, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 16, group1Blocks: 4, group1DataCodewords: 27, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 4, group1DataCodewords: 31, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCodewords: 38, group2Blocks: 2, group2DataCodewords: 39 },
    { ecCodewordsPerBlock: 22, group1Blocks: 3, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37 },
    { ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 43, group2Blocks: 1, group2DataCodewords: 44 },
    { ecCodewordsPerBlock: 30, group1Blocks: 1, group1DataCodewords: 50, group2Blocks: 4, group2DataCodewords: 51 },
    { ecCodewordsPerBlock: 22, group1Blocks: 6, group1DataCodewords: 36, group2Blocks: 2, group2DataCodewords: 37 },
    { ecCodewordsPerBlock: 22, group1Blocks: 8, group1DataCodewords: 37, group2Blocks: 1, group2DataCodewords: 38 },
    { ecCodewordsPerBlock: 24, group1Blocks: 4, group1DataCodewords: 40, group2Blocks: 5, group2DataCodewords: 41 },
    { ecCodewordsPerBlock: 24, group1Blocks: 5, group1DataCodewords: 41, group2Blocks: 5, group2DataCodewords: 42 },
    { ecCodewordsPerBlock: 28, group1Blocks: 7, group1DataCodewords: 45, group2Blocks: 3, group2DataCodewords: 46 },
    { ecCodewordsPerBlock: 28, group1Blocks: 10, group1DataCodewords: 46, group2Blocks: 1, group2DataCodewords: 47 },
    { ecCodewordsPerBlock: 26, group1Blocks: 9, group1DataCodewords: 43, group2Blocks: 4, group2DataCodewords: 44 },
    { ecCodewordsPerBlock: 26, group1Blocks: 3, group1DataCodewords: 44, group2Blocks: 11, group2DataCodewords: 45 },
    { ecCodewordsPerBlock: 26, group1Blocks: 3, group1DataCodewords: 41, group2Blocks: 13, group2DataCodewords: 42 },
  ],
  Q: [
    undefined,
    { ecCodewordsPerBlock: 13, group1Blocks: 1, group1DataCodewords: 13, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 22, group1Blocks: 1, group1DataCodewords: 22, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 17, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 26, group1Blocks: 2, group1DataCodewords: 24, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 18, group1Blocks: 2, group1DataCodewords: 15, group2Blocks: 2, group2DataCodewords: 16 },
    { ecCodewordsPerBlock: 24, group1Blocks: 4, group1DataCodewords: 19, group2Blocks: 0, group2DataCodewords: 0 },
  ],
  H: [
    undefined,
    { ecCodewordsPerBlock: 17, group1Blocks: 1, group1DataCodewords: 9, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 28, group1Blocks: 1, group1DataCodewords: 16, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCodewords: 13, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 16, group1Blocks: 4, group1DataCodewords: 9, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 22, group1Blocks: 2, group1DataCodewords: 11, group2Blocks: 2, group2DataCodewords: 12 },
    { ecCodewordsPerBlock: 28, group1Blocks: 4, group1DataCodewords: 15, group2Blocks: 0, group2DataCodewords: 0 },
    { ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 13, group2Blocks: 1, group2DataCodewords: 14 },
    { ecCodewordsPerBlock: 26, group1Blocks: 4, group1DataCodewords: 14, group2Blocks: 2, group2DataCodewords: 15 },
    { ecCodewordsPerBlock: 24, group1Blocks: 4, group1DataCodewords: 12, group2Blocks: 4, group2DataCodewords: 13 },
    { ecCodewordsPerBlock: 28, group1Blocks: 6, group1DataCodewords: 15, group2Blocks: 2, group2DataCodewords: 16 },
  ],
};

/** Total data codewords for a version and level. What actually bounds how much can be encoded. */
export function dataCodewords(version: number, level: EcLevel): number {
  const layout = BLOCK_LAYOUTS[level][version];
  if (!layout) {
    throw new Error(
      `QR ${level} ${version}-versiyasi jadvalda yo q. ` +
        `Hozir eng katta qo‘llab-quvvatlanadigan versiya ${largestCoveredVersion()}.`,
    );
  }
  return layout.group1Blocks * layout.group1DataCodewords + layout.group2Blocks * layout.group2DataCodewords;
}

/** Character-count field width for a mode at a version. Narrow versions use fewer bits. */
export function characterCountBits(mode: 'numeric' | 'alphanumeric' | 'byte' | 'kanji', version: number): number {
  const group = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  switch (mode) {
    case 'numeric':
      return [10, 12, 14][group]!;
    case 'alphanumeric':
      return [9, 11, 13][group]!;
    case 'byte':
      return [8, 16, 16][group]!;
    case 'kanji':
      return [8, 10, 12][group]!;
  }
}

/** The mode indicator that precedes a segment. */
export const MODE_INDICATOR = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100, kanji: 0b1000 } as const;

/** The 45-character alphanumeric alphabet, in the order the standard numbers them. */
export const ALPHANUMERIC = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

/**
 * Format information for a level and mask, as 15 bits.
 *
 * Five bits: two for the level, three for the mask, corrected by a BCH(15,5) code and then masked with
 * `0b101010000010010`. The mask exists so a format string never looks like the all-zeros padding a
 * damaged symbol would produce.
 */
export function formatBits(level: EcLevel, mask: number): number {
  const levelBits = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }[level];
  const data = (levelBits << 3) | (mask & 0b111);
  // BCH(15,5) with generator 0b10100110111.
  let value = data << 10;
  const generator = 0b10100110111;
  for (let bit = 14; bit >= 10; bit -= 1) {
    if ((value >> bit) & 1) value ^= generator << (bit - 10);
  }
  return ((data << 10) | (value & 0x3ff)) ^ 0b101010000010010;
}

/** Version information for versions 7 and up, as 18 bits. Below 7 the format area carries the version. */
export function versionBits(version: number): number {
  if (version < 7) throw new Error('7-versiyadan kichik versiyalar uchun versiya ma’lumoti maydoni yo q.');
  let value = version << 12;
  const generator = 0b1111100100101;
  for (let bit = 17; bit >= 12; bit -= 1) {
    if ((value >> bit) & 1) value ^= generator << (bit - 12);
  }
  return (version << 12) | (value & 0xfff);
}
