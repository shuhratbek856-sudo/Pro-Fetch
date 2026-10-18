/**
 * Building a QR symbol: bit stream, interleaving, masking, module placement.
 *
 * ## What is verified and what is not
 *
 * The Reed-Solomon layer is verified by construction: encode, corrupt up to the block's capacity, decode
 * and compare. `tests/qr-reed-solomon.test.ts` does exactly that across five block shapes.
 *
 * The symbol itself is verified by round trip: build the matrix, read it back through an independent
 * path, and compare. That proves the encoder is self-consistent and that the reading order, the
 * interleaving and the mask agree with each other. It does **not** prove a phone camera reads it,
 * because that also depends on the finder pattern contrast and the quiet zone, neither of which a
 * round trip exercises. Tools that return a symbol say so in their output rather than implying
 * scanner compatibility was tested.
 */

import { rsDecode, rsEncode } from './_galois.js';
import { codewordCapacity, layout } from './_layout.js';
import {
  ALIGNMENT_CENTRES,
  BLOCK_LAYOUTS,
  ALPHANUMERIC,
  MASK_PATTERNS,
  MODE_INDICATOR,
  characterCountBits,
  dataCodewords,
  formatBits,
  maxVersion,
  versionBits,
  versionSize,
  type BlockLayout,
  type EcLevel,
} from './_tables.js';

export type SegmentMode = 'numeric' | 'alphanumeric' | 'byte';

/** A growable bit stream, MSB first, which is the order a QR data field is written in. */
export class BitBuffer {
  private bits: number[] = [];

  /** Append `count` bits of `value`, taking the low bits. */
  push(value: number, count: number): void {
    for (let i = count - 1; i >= 0; i -= 1) this.bits.push((value >> i) & 1);
  }

  /** Append a whole byte. */
  pushByte(byte: number): void {
    this.bits.push((byte >> 7) & 1);
    for (let i = 6; i >= 0; i -= 1) this.bits.push((byte >> i) & 1);
  }

  get length(): number {
    return this.bits.length;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, index) => {
      if (bit) out[Math.floor(index / 8)]! |= 1 << (7 - (index % 8));
    });
    return out;
  }
}

/**
 * Write `text` as one segment in the narrowest mode that can hold it.
 *
 * "Narrowest" is measured, not assumed: numeric is tried first and falls through only when a character
 * is outside its alphabet. Mixed text such as an URL therefore lands in byte mode, which is correct and
 * also what a scanner expects.
 */
export function encodeSegment(text: string, version: number): { buffer: BitBuffer; mode: SegmentMode } {
  const buffer = new BitBuffer();

  if (/^[0-9]*$/.test(text) && text.length > 0) {
    buffer.push(MODE_INDICATOR.numeric, 4);
    buffer.push(text.length, characterCountBits('numeric', version));
    // Three digits per ten bits, the densest packing numeric mode has.
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      buffer.push(Number(chunk), chunk.length * 3 + 1);
    }
    return { buffer, mode: 'numeric' };
  }

  if (text.length > 0 && [...text].every((ch) => ALPHANUMERIC.includes(ch))) {
    buffer.push(MODE_INDICATOR.alphanumeric, 4);
    buffer.push(text.length, characterCountBits('alphanumeric', version));
    // Two characters per eleven bits, as first*45 + second — not six bits each.
    //
    // Six bits each holds 0..63 and the alphabet has 45 entries, so the packing *looks* sufficient. It is
    // not what the standard defines, and a reader that divides by 45 reads the wrong characters:
    // measured, "AAAA" came back as "EKEKEKEKE" and "HELLO" as "OMUFY". The mixed-radix form is what a
    // scanner decodes, so a six-bit pair passes every field-pattern check and still fails on read.
    for (let i = 0; i < text.length; i += 2) {
      const pair = text.slice(i, i + 2);
      const value =
        pair.length === 2
          ? ALPHANUMERIC.indexOf(pair[0]!) * 45 + ALPHANUMERIC.indexOf(pair[1]!)
          : ALPHANUMERIC.indexOf(pair[0]!);
      buffer.push(value, pair.length === 2 ? 11 : 6);
    }
    return { buffer, mode: 'alphanumeric' };
  }

  const bytes = new TextEncoder().encode(text);
  buffer.push(MODE_INDICATOR.byte, 4);
  // The count is in *bytes*, which is what the standard specifies for byte mode and what the reader
  // consumes. Counting characters instead truncates any text with a multi-byte character: measured,
  // "Salom, dunyo! 😀" (14 characters, 17 bytes) was written with a count of 14 and read back as 14
  // bytes, losing the emoji.
  buffer.push(bytes.length, characterCountBits('byte', version));
  for (const byte of bytes) buffer.pushByte(byte);
  return { buffer, mode: 'byte' };
}

/**
 * Split the data codewords into blocks, add parity, and interleave.
 *
 * Interleaving spreads each block's codewords across the symbol so a scratch across the middle damages
 * every block rather than destroying one — which is the entire reason the symbol is split in the first
 * place. Blocks are written alternately and the shorter group contributes one fewer codeword per pass.
 */
export function interleave(data: Uint8Array, version: number, level: EcLevel): Uint8Array {
  const layoutRow = BLOCK_LAYOUTS[level][version];
  if (!layoutRow) throw new Error(`QR ${level} ${version}-versiyasi jadvalda yo q.`);

  const blocks: Uint8Array[] = [];
  const dataBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < layoutRow.group1Blocks; i += 1) {
    dataBlocks.push(data.subarray(offset, offset + layoutRow.group1DataCodewords));
    offset += layoutRow.group1DataCodewords;
  }
  for (let i = 0; i < layoutRow.group2Blocks; i += 1) {
    dataBlocks.push(data.subarray(offset, offset + layoutRow.group2DataCodewords));
    offset += layoutRow.group2DataCodewords;
  }

  for (const block of dataBlocks)
    blocks.push(new Uint8Array([...block, ...rsEncode(block, layoutRow.ecCodewordsPerBlock)]));

  const maxData = Math.max(layoutRow.group1DataCodewords, layoutRow.group2DataCodewords || 0);
  const result: number[] = [];
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i]!);
  }
  // The parity pass starts *after* each block's data, not at index 0.
  //
  // Reading the parity from the front of the block writes data bytes into the symbol's
  // error-correction region and parity bytes into its data region. The symbol keeps its shape, the
  // finder patterns still verify and every field-pattern check still passes — but the codewords are no
  // longer a multiple of the generator, so `rsDecode` reports four errors on a codeword the encoder
  // itself produced. Measured: reading back a version-1-L symbol gave non-zero syndromes for errors
  // that were never introduced.
  for (let i = 0; i < layoutRow.ecCodewordsPerBlock; i += 1) {
    for (let b = 0; b < blocks.length; b += 1) {
      const at = dataBlocks[b]!.length + i;
      if (at < blocks[b]!.length) result.push(blocks[b]![at]!);
    }
  }
  return Uint8Array.from(result);
}

/** A symbol as a grid of booleans, row-major. */
export type Matrix = boolean[][];

export interface EncodeResult {
  matrix: Matrix;
  version: number;
  level: EcLevel;
  mask: number;
  mode: SegmentMode;
  size: number;
  /** Codewords written into the symbol, which is data plus error correction. */
  codewords: number;
  dataCodewords: number;
  /** Penalty score for each of the eight masks, so a caller can see why one was chosen. */
  maskScores: number[];
}

/** The standard's four penalty rules, summed. Lower is easier for a scanner. */
export function maskPenalty(matrix: Matrix): number {
  const size = matrix.length;
  let penalty = 0;

  // Rule 1: five or more consecutive modules of the same colour, in any row or column.
  const runPenalty = (line: boolean[]): number => {
    let score = 0;
    let run = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) run += 1;
      else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    if (run >= 5) score += 3 + (run - 5);
    return score;
  };
  for (const row of matrix) penalty += runPenalty(row);
  for (let col = 0; col < size; col += 1) penalty += runPenalty(matrix.map((row) => row[col]!));

  // Rule 2: every 2x2 block of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const value = matrix[row]![col];
      if (matrix[row]![col + 1] === value && matrix[row + 1]![col] === value && matrix[row + 1]![col + 1] === value) {
        penalty += 3;
      }
    }
  }

  // Rule 3: the finder-like 1:1:3:1:1 pattern, with four light modules on either side.
  const pattern = [true, false, true, true, true, false, true, false, false, false, false];
  const matchesAt = (line: boolean[], start: number): boolean => {
    for (let i = 0; i < pattern.length; i += 1) if (line[start + i] !== pattern[i]) return false;
    return true;
  };
  for (const line of [...matrix, ...Array.from({ length: size }, (_, col) => matrix.map((row) => row[col]!))]) {
    for (let i = 0; i + 11 <= size; i += 1) {
      if (!matchesAt(line, i)) continue;
      const beforeClear = i >= 4 && line.slice(i - 4, i).every((value) => !value);
      const afterClear = i + 11 + 4 <= line.length && line.slice(i + 11, i + 15).every((value) => !value);
      if (beforeClear || afterClear) penalty += 40;
    }
  }

  // Rule 4: deviation from an even balance of dark and light.
  const dark = matrix.flat().filter(Boolean).length;
  const percent = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return penalty;
}

/** Draw the finder, timing, alignment and format modules into a fresh grid. */
function drawFunctionPatterns(
  matrix: Matrix,
  reserved: Set<string>,
  version: number,
  level: EcLevel,
  mask: number,
): void {
  const size = matrix.length;
  const set = (row: number, col: number, dark: boolean) => {
    if (row < 0 || row >= size || col < 0 || col >= size) return;
    matrix[row]![col] = dark;
  };

  // Finder patterns: a 7x7 ring with a 3x3 solid centre.
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as Array<[number, number]>) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const centre = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        set(top + r, left + c, ring || centre);
      }
    }
  }

  // Timing patterns: alternating from index 8.
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    set(6, i, dark);
    set(i, 6, dark);
  }

  // Alignment patterns.
  for (const row of ALIGNMENT_CENTRES[version] ?? []) {
    for (const col of ALIGNMENT_CENTRES[version] ?? []) {
      const nearFinder = (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const ring = Math.max(Math.abs(r), Math.abs(c)) === 2;
          const centre = r === 0 && c === 0;
          set(row + r, col + c, ring || centre);
        }
      }
    }
  }

  // Format information, written twice. The bit order follows the standard's placement table, which is
  // not the natural bit order — placing bit i at the obvious position produces a symbol that reads back
  // as a different level.
  const format = formatBits(level, mask);
  for (let i = 0; i < 15; i += 1) {
    const bit = ((format >> i) & 1) === 1;
    // Copy 1: up the left of the top-left finder, then right along its top.
    if (i < 6) set(8, i, bit);
    else if (i === 6) set(8, 7, bit);
    else if (i === 7) set(8, 8, bit);
    else if (i === 8) set(7, 8, bit);
    else set(14 - i, 8, bit);
    // Copy 2: left along the top of the top-right finder, then up the left of the bottom-left one.
    if (i < 8) set(size - 1 - i, 8, bit);
    else set(8, size - 15 + i, bit);
  }
  // The dark module, always set.
  set(size - 8, 8, true);

  // Version information for versions 7 and up, written twice.
  if (version >= 7) {
    const value = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((value >> i) & 1) === 1;
      const row = Math.floor(i / 3);
      const col = i % 3;
      set(row, size - 11 + col, bit);
      set(size - 11 + col, row, bit);
    }
  }
  void reserved;
}

/**
 * Build a symbol.
 *
 * `version` is chosen when not given, by asking each level for the smallest version that fits and
 * keeping the lowest error correction that succeeds — the same choice a writer makes.
 */
export function encode(text: string, level: EcLevel, version?: number, forcedMask?: number): EncodeResult {
  const chosenVersion = version ?? smallestVersion(text, level);
  if (chosenVersion < 1 || chosenVersion > maxVersion()) {
    throw new Error(`QR ${level} ${chosenVersion}-versiyasi qo‘llab-quvvatlanmaydi (chegara ${maxVersion()}).`);
  }
  const capacity = dataCodewords(chosenVersion, level);
  const capacityBits = capacity * 8;

  const { buffer, mode } = encodeSegment(text, chosenVersion);
  if (buffer.length > capacityBits) {
    throw new Error(
      `Matn ${buffer.length} bit, ${chosenVersion}-${level} sig‘imi ${capacityBits} bit. ` +
        `Qisqartiring yoki katta versiya tanlang.`,
    );
  }

  // Terminator, then pad to a byte boundary, then the alternating pad codewords.
  const terminator = Math.min(4, capacityBits - buffer.length);
  buffer.push(0, terminator);
  while (buffer.length % 8 !== 0) buffer.push(0, 1);
  const padBytes = [0xec, 0x11];
  for (let i = 0; buffer.length < capacityBits; i += 1) buffer.pushByte(padBytes[i % 2]!);

  const codewords = interleave(buffer.toBytes(), chosenVersion, level);
  const { reserved, dataModules, size } = layout(chosenVersion, ALIGNMENT_CENTRES[chosenVersion] ?? []);

  const maskScores: number[] = [];
  let bestMatrix: Matrix | null = null;
  let bestMask = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  const candidates = forcedMask === undefined ? [0, 1, 2, 3, 4, 5, 6, 7] : [forcedMask];
  for (const mask of candidates) {
    const matrix: Matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    drawFunctionPatterns(matrix, reserved, chosenVersion, level, mask);

    let bitIndex = 0;
    for (const [row, col] of dataModules) {
      if (bitIndex >= codewords.length * 8) break;
      const bit = ((codewords[Math.floor(bitIndex / 8)]! >> (7 - (bitIndex % 8))) & 1) === 1;
      bitIndex += 1;
      matrix[row]![col] = MASK_PATTERNS[mask]!(row, col) ? !bit : bit;
    }

    const score = maskPenalty(matrix);
    maskScores.push(score);
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
      bestMatrix = matrix;
    }
  }

  if (!bestMatrix) throw new Error('QR belgisi yig‘ilmadi.');
  return {
    matrix: bestMatrix,
    version: chosenVersion,
    level,
    mask: bestMask,
    mode,
    size,
    codewords: codewords.length,
    dataCodewords: capacity,
    maskScores,
  };
}

/** The smallest version that holds `text` at `level`, or 0 when none in range does. */
export function smallestVersion(text: string, level: EcLevel): number {
  const { buffer } = encodeSegment(text, 1);
  const neededBits = buffer.length;
  for (let version = 1; version <= maxVersion(); version += 1) {
    // The character-count field widens at versions 10 and 27, so the buffer is rebuilt per version.
    const perVersion = encodeSegment(text, version).buffer.length;
    void neededBits;
    if (perVersion <= dataCodewords(version, level) * 8) return version;
  }
  return 0;
}

/**
 * Read a matrix back into text.
 *
 * The inverse of `encode`, and the check on it. It reads format information from the matrix rather than
 * taking level and mask as arguments, because a reader that is told the answer is not a reader — that is
 * what would let an encoder bug hide behind a passing round trip.
 */
export function decodeMatrix(matrix: Matrix): { text: string | null; note: string } {
  const size = matrix.length;
  const version = Math.round((size - 17) / 4);
  if (!Number.isInteger(version) || version < 1 || version > maxVersion()) {
    return { text: null, note: `${size}x${size} modul ${version}-versiyaga mos emas (chegara ${maxVersion()}).` };
  }
  const { reserved, dataModules } = layout(version, ALIGNMENT_CENTRES[version] ?? []);

  // Recover level and mask from the format information.
  let format = 0;
  for (let i = 0; i < 15; i += 1) {
    let bit = false;
    if (i < 6) bit = matrix[8]![i]!;
    else if (i === 6) bit = matrix[8]![7]!;
    else if (i === 7) bit = matrix[8]![8]!;
    else if (i === 8) bit = matrix[7]![8]!;
    else bit = matrix[14 - i]![8]!;
    if (bit) format |= 1 << i;
  }
  format ^= 0b101010000010010;
  // The two format bits encode the level as 01=L, 00=M, 11=Q, 10=H — an ordering with no relation to
  // the alphabet, which is why it is mapped rather than indexed.
  const LEVEL_FROM_BITS: Readonly<Record<number, EcLevel>> = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };
  const level = LEVEL_FROM_BITS[(format >> 13) & 0b11]!;
  const mask = (format >> 10) & 0b111;
  if (!level) return { text: null, note: 'Format ma’lumotidan xato daraja o‘qilmadi.' };

  // Undo the mask and read the data modules.
  const capacity = codewordCapacity(version, ALIGNMENT_CENTRES[version] ?? []);
  const codewords = new Uint8Array(capacity);
  let bitIndex = 0;
  for (const [row, col] of dataModules) {
    if (bitIndex >= capacity * 8) break;
    const masked = matrix[row]![col]!;
    const bit = MASK_PATTERNS[mask]!(row, col) ? !masked : masked;
    if (bit) codewords[Math.floor(bitIndex / 8)]! |= 1 << (7 - (bitIndex % 8));
    bitIndex += 1;
  }

  // De-interleave into blocks and error-correct each one.
  const layoutRow = BLOCK_LAYOUTS[level]![version] as BlockLayout;
  const sizes: number[] = [];
  for (let i = 0; i < layoutRow.group1Blocks; i += 1) sizes.push(layoutRow.group1DataCodewords);
  for (let i = 0; i < layoutRow.group2Blocks; i += 1) sizes.push(layoutRow.group2DataCodewords);

  // Each block's own length, because the two groups differ by one codeword. A shared `blockSize` taken
  // from group 1 is right for the data pass but wrong for a group-2 block, which then hands
  // `rsDecode` a codeword that is one byte short and reports corruption that is not there.
  const blockLengths = sizes.map((size) => size + layoutRow.ecCodewordsPerBlock);
  const blocks: Uint8Array[] = [];
  for (const length of blockLengths) blocks.push(new Uint8Array(length));

  let cursor = 0;
  const maxData = Math.max(layoutRow.group1DataCodewords, layoutRow.group2DataCodewords || 0);
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < sizes.length; b += 1) {
      if (i < sizes[b]!) {
        blocks[b]![i] = codewords[cursor]!;
        cursor += 1;
      }
    }
  }
  for (let i = 0; i < layoutRow.ecCodewordsPerBlock; i += 1) {
    for (let b = 0; b < sizes.length; b += 1) {
      blocks[b]![sizes[b]! + i] = codewords[cursor]!;
      cursor += 1;
    }
  }

  const recovered: number[] = [];
  let correctedTotal = 0;
  for (let b = 0; b < blocks.length; b += 1) {
    const result = rsDecode(blocks[b]!, layoutRow.ecCodewordsPerBlock);
    if (!result.corrected) {
      return { text: null, note: `Blokni tuzatib bo‘lmadi: ${result.unrecoverable ?? 'noma’lum sabab'}` };
    }
    correctedTotal += result.errorsCorrected;
    for (let i = 0; i < sizes[b]!; i += 1) recovered.push(result.corrected[i]!);
  }

  return { text: readSegments(Uint8Array.from(recovered), version), note: `${correctedTotal} ta modul tuzatildi` };
}

/** Read the segment(s) out of the recovered data codewords. */
function readSegments(data: Uint8Array, version: number): string | null {
  const bits: number[] = [];
  for (const byte of data) {
    for (let i = 7; i >= 0; i -= 1) bits.push((byte >> i) & 1);
  }
  let index = 0;
  const take = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i += 1) value = (value << 1) | (bits[index++] ?? 0);
    return value;
  };

  let output = '';
  let guard = 0;
  while (index + 4 <= bits.length && guard < 64) {
    guard += 1;
    const mode = take(4);
    if (mode === 0) break;
    if (mode === MODE_INDICATOR.numeric) {
      const count = take(characterCountBits('numeric', version));
      for (let i = 0; i < count;) {
        const width = count - i >= 3 ? 10 : count - i === 2 ? 7 : 4;
        const value = take(width);
        const digits = String(value).padStart(width === 10 ? 3 : width === 7 ? 2 : 1, '0');
        output += digits;
        i += digits.length;
      }
    } else if (mode === MODE_INDICATOR.alphanumeric) {
      const count = take(characterCountBits('alphanumeric', version));
      for (let i = 0; i < count; i += 2) {
        const pairLength = count - i >= 2 ? 2 : 1;
        const value = take(pairLength === 2 ? 11 : 6);
        // A lone character's six bits *are* its index; only a pair is mixed-radix. Dividing a single
        // value by 45 turns index 24 ('O') into 0 ('0'), so every odd-length string lost its last
        // character and gained a zero: measured, "HELLO" read back as "HELL0".
        if (pairLength === 1) {
          output += ALPHANUMERIC[value] ?? '';
          continue;
        }
        output += ALPHANUMERIC[Math.floor(value / 45)] ?? '';
        output += ALPHANUMERIC[value % 45] ?? '';
      }
    } else if (mode === MODE_INDICATOR.byte) {
      const count = take(characterCountBits('byte', version));
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i += 1) bytes[i] = take(8);
      output += new TextDecoder().decode(bytes);
    } else {
      return output || null;
    }
  }
  return output || null;
}

export { versionSize, maxVersion, codewordCapacity };
