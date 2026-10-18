/**
 * Where a QR symbol's modules go.
 *
 * ## Why this is separate from the tables
 *
 * The block-layout tables say how many codewords a version holds. They cannot be checked against
 * anything without knowing how many *modules* the version has left after its function patterns, and
 * that is arithmetic rather than transcription. So the function-pattern count lives here, and the tests
 * use it to verify the tables.
 *
 * That verification is not optional bookkeeping. The tables were transcribed, and the transcription
 * drifted: the `Q` row for version 11 claimed 10 blocks carrying 226 data and 260 EC codewords, which
 * is 486 codewords — 3 888 bits, against a symbol of 61x61 = 3 721 modules. It cannot fit, and it
 * was in the file because nothing had computed the geometry to say so.
 *
 * ## What is placed, and why each one is not a data module
 *
 * - Three 7x7 finder patterns with their separators, at three corners.
 * - Timing patterns: one row and one column at index 6.
 * - Format information: 15 modules beside the top-left finder, 15 below it, split across two copies
 *   so a damaged symbol can still be read.
 * - Version information for versions 7 and up: 18 modules beside the bottom-left and top-right finders.
 * - Alignment patterns: 5x5, at the published centre coordinates, skipping the three the finder
 *   patterns already occupy.
 */

/** Reserved regions, tracked as a set of `row,col` keys rather than by re-deriving them later. */
export type Reserved = Set<string>;

const key = (row: number, col: number): string => `${row},${col}`;

/**
 * Mark every module a function pattern occupies.
 *
 * Returns the reserved set plus the data modules in the order a QR reads them, which is the zig-zag
 * from the bottom-right upward. Reading order is not optional: the interleaved codeword stream has to
 * land in the same modules the scanner reads, or the round trip fails on a real symbol while passing
 * in-process.
 */
export function layout(
  version: number,
  centres: readonly number[],
): {
  reserved: Reserved;
  dataModules: Array<[number, number]>;
  size: number;
} {
  const size = 4 * version + 17;
  const reserved: Reserved = new Set();
  const mark = (row: number, col: number) => reserved.add(key(row, col));

  // Finder patterns with separators: an 8x8 block around each 7x7 pattern.
  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ] as Array<[number, number]>) {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < size && col >= 0 && col < size) mark(row, col);
      }
    }
  }

  // Timing patterns.
  for (let i = 8; i < size - 8; i += 1) {
    mark(6, i);
    mark(i, 6);
  }

  // Alignment patterns, skipping the three corners the finders occupy.
  for (const row of centres) {
    for (const col of centres) {
      const nearFinder = (row <= 8 && col <= 8) || (row <= 8 && col >= size - 9) || (row >= size - 9 && col <= 8);
      if (nearFinder) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) mark(row + r, col + c);
      }
    }
  }

  // Format information: 15 modules beside the top-left finder and 15 below it. Both copies are reserved
  // even though only one is written, because the second copy is read from the same positions.
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) mark(8, i);
    if (i !== 6) mark(i, 8);
  }
  // The other two copies, which live beside the top-right and bottom-left finders.
  for (let i = 0; i < 8; i += 1) {
    mark(8, size - 1 - i);
    mark(size - 1 - i, 8);
  }

  // Dark module, always set, always reserved.
  mark(size - 8, 8);

  // Version information for versions 7 and up.
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3);
      const col = size - 11 + (i % 3);
      mark(row, col);
      mark(col, row);
    }
  }

  // Data modules in reading order: upward and downward alternating strips, right to left.
  //
  // The strips are built from the right edge rather than stepped, because an odd count leaves one
  // column over. Measured: `for (right = size - 1; right >= 1; right -= 2)` produces the pairs
  // (20,19) … (2,1) for a 21-wide symbol and never reaches column 0, so the seven modules in rows
  // 8-13 of that column were reserved-but-unread and the count came to 25 codewords where the standard
  // says 26. Building the pairs and appending a single-column strip for the remainder is what the
  // reading order actually is.
  //
  // Column 6 is not skipped as a strip. It is already fully reserved — finder above, timing below,
  // format information at its foot — so the reservation check skips each of its modules without the
  // neighbouring column being dropped. An earlier `if (right === 6) continue;` dropped the whole
  // strip and took column 5 with it: measured, version 1 then held 200 data modules.
  const strips: Array<number[]> = [];
  for (let right = size - 1; right >= 0; right -= 2) {
    if (right === 0) strips.push([0]);
    else strips.push([right, right - 1]);
  }

  const dataModules: Array<[number, number]> = [];
  let upward = true;
  for (const strip of strips) {
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (const col of strip) {
        if (reserved.has(key(row, col))) continue;
        dataModules.push([row, col]);
      }
    }
    upward = !upward;
  }

  return { reserved, dataModules, size };
}

/**
 * How many 8-bit codewords a version's geometry holds, given the reserved set.
 *
 * The remainder bits — a version's module count is rarely a multiple of eight — are dropped, exactly as
 * the standard specifies. This is the number the block tables must add up to, and it is computable
 * rather than published, which is what makes it usable as a check.
 */
export function codewordCapacity(version: number, centres: readonly number[]): number {
  return Math.floor(layout(version, centres).dataModules.length / 8);
}
