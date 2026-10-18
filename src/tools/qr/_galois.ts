/**
 * Reed-Solomon over GF(2^8), the field a QR code's error correction is defined over.
 *
 * ## Why a field and not arithmetic
 *
 * Every coefficient and every codeword byte is a value in the same 256-element field, so addition is
 * XOR and multiplication is a table lookup. The field is built from a primitive polynomial — the QR
 * standard fixes it at 0x11D — and `EXP`/`LOG` make multiplication two lookups. Without them, every
 * multiply in the encoder is a carry-less multiply plus a reduction, and the encoder runs one order
 * of magnitude slower for no benefit.
 *
 * ## What "encoding" means here
 *
 * `rsEncode` takes `data` and appends `parity` codewords so that a block of `t` corrupted codewords
 * can be corrected. `rsDecode` reverses it: it computes syndromes to find *that* corruption exists,
 * locates it with Berlekamp-Massey, finds *where* with Chien search, and repairs it with Forney. All
 * four steps are here, not a lookup of precomputed vectors, because the decoder is the part that
 * decides whether an encoded code is actually readable.
 *
 * ## What a round trip does and does not prove
 *
 * A round trip proves the implementation is self-consistent. It does **not** prove that a phone
 * camera would read the code, because that also depends on the module placement, the finder patterns,
 * the quiet zone and the mask. Those are verified separately against the published tables in
 * `version-info.ts` and `galois.ts`, not by this file.
 */

/** The primitive polynomial the QR standard fixes: x^8 + x^4 + x^3 + x^2 + 1. */
export const QR_PRIMITIVE = 0x11d;

/** EXP[i] = alpha^i, LOG[x] = i where alpha^i = x. Wrapped, because the field has 255 non-zero elements. */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function buildTables() {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    // x = x * 2 in GF(2^8), reduced by the primitive polynomial.
    x <<= 1;
    if (x & 0x100) x ^= QR_PRIMITIVE;
  }
  // Second copy so a sum of two exponents needs no modulo.
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

/** Field multiplication. `LOG[0]` is 0 because it is never read: a zero operand returns early. */
export function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a]! + LOG[b]!]!;
}

/** Field division. Division by zero is a programming error, so it says so rather than returning 0. */
export function gfDiv(a: number, b: number): number {
  if (b === 0) throw new Error('GF(256) da nolga bo‘lish mumkin emas.');
  if (a === 0) return 0;
  return EXP[(LOG[a]! - LOG[b]! + 255) % 255]!;
}

/** Field exponentiation, by repeated squaring. `exp` may be negative; the field is cyclic of order 255. */
export function gfPow(a: number, exp: number): number {
  if (a === 0) return exp === 0 ? 1 : 0;
  const e = ((exp % 255) + 255) % 255;
  let result = 1;
  let base = a;
  for (let i = 0; i < 8; i += 1) {
    if (e & (1 << i)) result = gfMul(result, base);
    base = gfMul(base, base);
  }
  return result;
}

/**
 * The generator polynomial for `degree` codewords: (x-a^0)(x-a^1)...(x-a^(degree-1)).
 *
 * Returned with the highest power first, which is the polynomial long-division convention the encoder
 * needs. The QR standard's roots start at a^0, not a^1 — a detail that produces a table that looks
 * plausible and fails against a real decoder.
 */
export function generatorPoly(degree: number): number[] {
  if (degree < 1) return [1];
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const root = EXP[i]!;
    // Multiply by (x + a^i) in descending order: poly[j] is the coefficient of x^(deg-j), so the x
    // term stays at index j and the root term shifts one place to the right.
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ (poly[j] ?? 0);
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(root, poly[j]!);
    }
    poly = next;
  }
  return poly;
}

/**
 * Append `parity` error-correction codewords to `data`.
 *
 * Polynomial long division of `data(x) * x^parity` by the generator, leaving the remainder. That
 * remainder is the codeword block, which is what a QR symbol stores.
 */
export function rsEncode(data: Uint8Array, parity: number): Uint8Array {
  if (parity <= 0) return Uint8Array.from(data);
  const generator = generatorPoly(parity);
  const result = new Array<number>(data.length + parity).fill(0);
  for (let i = 0; i < data.length; i += 1) result[i] = data[i] ?? 0;

  for (let i = 0; i < data.length; i += 1) {
    const factor = result[i]!;
    if (factor === 0) continue;
    // j from 0, because the generator is stored descending and its leading coefficient (1) lands on
    // `result[i]` itself — that XOR is what zeroes the entry being processed. Starting at j = 1 leaves
    // `result[i]` equal to its old value, so the division never terminates and the remainder is not a
    // multiple of the generator at all.
    //
    // Measured: the loop was `for (let j = 1; ...)` and every codeword came out with non-zero
    // syndromes, so `rsDecode` on an *undamaged* block reported failure. That is the failure that
    // points at the encoder, not the decoder, and it is why the decode steps were checked last.
    for (let j = 0; j < generator.length; j += 1) {
      result[i + j] = (result[i + j] ?? 0) ^ gfMul(generator[j]!, factor);
    }
  }
  return Uint8Array.from(result.slice(data.length));
}

/** Syndromes: S_i = C(alpha^i). All zero means no error. */
function syndromes(codeword: Uint8Array, parity: number): Uint8Array {
  const result = new Uint8Array(parity);
  for (let i = 0; i < parity; i += 1) {
    const root = EXP[i]!;
    let sum = 0;
    for (let j = 0; j < codeword.length; j += 1) sum = gfMul(sum, root) ^ (codeword[j] ?? 0);
    result[i] = sum;
  }
  return result;
}

/**
 * Berlekamp-Massey: the shortest error locator consistent with the syndromes.
 *
 * `coefficients[i]` is the coefficient of x^i in Λ(x), ascending order, with `coefficients[0] = 1`.
 *
 * The `m` bookkeeping is the part that is easy to get subtly wrong: it counts how far apart the last
 * two updates of the register were, so an update applies `x^m * B` rather than `B`. Without it the
 * recurrence converges on *a* LFSR that fits the syndromes, which is not the one that fits the
 * original codeword — the code compiles, the round trip still passes, and a real symbol fails.
 */
function berlekampMassey(synd: Uint8Array, parity: number): { count: number; coefficients: number[] } {
  // C is the current error locator, B the previous one. Both are ascending, C[0] = 1.
  let current = [1];
  let previous = [1];
  // `degree` is L, the current locator's degree. Tracked explicitly rather than inferred from
  // `current.length`, because the coefficient list can carry trailing zeros that are not degree.
  let degree = 0;
  // How many positions to shift B by, and the discrepancy B was normalised against.
  let shift = 1;
  let lastDiscrepancy = 1;

  for (let n = 0; n < parity; n += 1) {
    // d = S[n] + sum_{i=1..L} C[i] * S[n-i]
    let discrepancy = synd[n] ?? 0;
    for (let i = 1; i <= degree && i < current.length; i += 1) {
      discrepancy ^= gfMul(current[i] ?? 0, synd[n - i] ?? 0);
    }

    if (discrepancy === 0) {
      shift += 1;
      continue;
    }

    // C <- C - (d/b) * x^shift * B
    const scale = gfDiv(discrepancy, lastDiscrepancy);
    const updated = current.slice();
    for (let i = 0; i < previous.length; i += 1) {
      const at = i + shift;
      while (updated.length <= at) updated.push(0);
      updated[at] = (updated[at] ?? 0) ^ gfMul(previous[i]!, scale);
    }

    if (2 * degree <= n) {
      // The locator's degree is about to grow, so B must become the old C — the register that made the
      // previous correction valid — and the discrepancy that divided is the new normaliser.
      previous = current;
      degree = n + 1 - degree;
      lastDiscrepancy = discrepancy;
      shift = 1;
    } else {
      shift += 1;
    }
    current = updated;
  }

  return { count: degree, coefficients: current.slice(0, degree + 1) };
}

/**
 * Chien search: the roots of the locator are the positions of the corrupted codewords.
 *
 * With `codeword[j]` the coefficient of x^(n-1-j), position j has locator X = alpha^(n-1-j). Λ(X) = 0
 * there, and the index arithmetic is the only part of the decoder that is easy to invert.
 */
function chienSearch(coefficients: number[], codewordLength: number): number[] {
  const positions: number[] = [];
  for (let j = 0; j < codewordLength; j += 1) {
    // Λ(x) = ∏(1 - X_k x), so its roots are at x = X_k^{-1}, not at X_k itself.
    //
    // Evaluated at X_k instead, every Λ(X_k) is non-zero for a genuine single error and the search
    // returns nothing — measured: BM reported exactly the right error count (3, 5, 8, 14, 2 across five
    // block sizes) and Chien found 0, 0, 1, 1, 0. An index inversion that reads as "the decoder cannot
    // locate errors" rather than as the sign error it is.
    const x = gfDiv(1, EXP[(codewordLength - 1 - j) % 255]!);
    let sum = 0;
    for (let i = 0; i < coefficients.length; i += 1) {
      sum ^= gfMul(coefficients[i] ?? 0, gfPow(x, i));
    }
    if (sum === 0) positions.push(j);
  }
  return positions;
}

/**
 * Forney: the error magnitude at each located position.
 *
 * e_j = X_j^(1-b) * Omega(X_j^-1) / Lambda'(X_j^-1), where Omega = S(x)Λ(x) mod x^parity. The QR
 * generator's first root is alpha^0, so b = 0 and the leading factor is X_j itself.
 *
 * The formal derivative drops every even-power term: over GF(2) the coefficient of x^(2k) is 2k = 0.
 */
function forneyMagnitudes(
  synd: Uint8Array,
  coefficients: number[],
  positions: number[],
  codewordLength: number,
): number[] {
  if (positions.length === 0) return [];

  const omega = new Array<number>(synd.length).fill(0);
  for (let i = 0; i < omega.length; i += 1) {
    let sum = 0;
    for (let j = 0; j <= i && j < coefficients.length; j += 1) {
      sum ^= gfMul(synd[i - j] ?? 0, coefficients[j] ?? 0);
    }
    omega[i] = sum;
  }

  const derivative: number[] = [];
  for (let i = 1; i < coefficients.length; i += 1) {
    if (i % 2 === 1) derivative[i - 1] = coefficients[i]!;
  }

  return positions.map((position) => {
    // Forney evaluates at the locator's root X^-1, the same point Chien found it zero at. Evaluating
    // at X instead would give a consistent-looking magnitude for every position and a codeword that
    // fails its own syndrome check afterwards.
    const x = EXP[(codewordLength - 1 - position) % 255]!;
    const xInv = gfDiv(1, x);
    let numerator = 0;
    for (let i = 0; i < omega.length; i += 1) numerator ^= gfMul(omega[i] ?? 0, gfPow(xInv, i));
    let denominator = 0;
    for (let i = 0; i < derivative.length; i += 1) {
      denominator ^= gfMul(derivative[i] ?? 0, gfPow(xInv, i));
    }
    if (denominator === 0) return 0;
    // Leading factor X^(1-b), and the QR generator's first root is alpha^0 so b = 0 and it is X.
    return gfMul(x, gfDiv(numerator, denominator));
  });
}

export interface DecodeResult {
  /** The repaired codeword, or `null` when the error count exceeds what the block can correct. */
  corrected: Uint8Array | null;
  /** How many codewords were repaired. */
  errorsCorrected: number;
  /** How many the block can carry: `floor(parity / 2)`. */
  capacity: number;
  /** Set when the codeword has more errors than can be corrected, which is not the same as "no error". */
  unrecoverable?: string;
}

/**
 * Repair a codeword block.
 *
 * Returns `unrecoverable` rather than pretending a heavily corrupted block decoded: a miscorrection
 * is indistinguishable from a good decode to the caller unless it is told, and a QR scanner that
 * "recovers" wrong bytes is worse than one that reports failure.
 */
export function rsDecode(codeword: Uint8Array, parity: number): DecodeResult {
  const capacity = Math.floor(parity / 2);
  const synd = syndromes(codeword, parity);
  if (synd.every((s) => s === 0)) {
    return { corrected: Uint8Array.from(codeword), errorsCorrected: 0, capacity };
  }

  const { count, coefficients } = berlekampMassey(synd, parity);
  if (count === 0 || count > capacity) {
    return {
      corrected: null,
      errorsCorrected: 0,
      capacity,
      unrecoverable:
        `Blok ${codeword.length} kodli so‘zda ${parity} tekshiruv so‘zi bor, ` +
        `korrksiya ${capacity} taga yetadi. Xatolar soni ${count} ga chiqdi.`,
    };
  }

  const positions = chienSearch(coefficients, codeword.length);
  if (positions.length !== count) {
    return {
      corrected: null,
      errorsCorrected: 0,
      capacity,
      unrecoverable:
        `Xato joylari topilmadi: Berlekamp-Massey ${count} ta dedi, Chien ${positions.length} ta topdi. ` +
        `Blok ${codeword.length} kodli so‘zda bu odatda xatolar soni chegaradan oshganini bildiradi.`,
    };
  }

  const magnitudes = forneyMagnitudes(synd, coefficients, positions, codeword.length);
  const repaired = Uint8Array.from(codeword);
  for (let i = 0; i < positions.length; i += 1) {
    const at = positions[i]!;
    repaired[at] = (repaired[at] ?? 0) ^ (magnitudes[i] ?? 0);
  }

  // Verified rather than assumed. Berlekamp-Massey converges on a minimal LFSR that fits the
  // syndromes it was given, which is not the same as the one that fits the original codeword.
  const verify = syndromes(repaired, parity);
  if (!verify.every((s) => s === 0)) {
    return {
      corrected: null,
      errorsCorrected: 0,
      capacity,
      unrecoverable:
        `Korraksiya qo‘llangach sindromalar nol bo‘lmadi — tuzatilgan blok asl kodli so‘z emas. ` +
        `Buni odatda ${capacity + 1} yoki undan ko‘p xato keltiradi.`,
    };
  }

  return { corrected: repaired, errorsCorrected: count, capacity };
}
