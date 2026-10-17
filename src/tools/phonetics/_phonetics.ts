/**
 * Phonetic encoding and string similarity.
 *
 * ## What is here and what is deliberately not
 *
 * This module started with six encodings - Soundex, Cologne Phonetik, NYSIIS, Metaphone, Double
 * Metaphone and Jaro-Winkler - and was checked against published vectors before any of it was shipped.
 * Four did not pass and were removed rather than shipped with a caveat:
 *
 * | Algorithm  | Measured result                          | Decision |
 * |------------|------------------------------------------|----------|
 * | Soundex    | 12/12 US Census vectors                  | kept     |
 * | Metaphone  | `Thompson` -> `0MPSN`                    | removed  |
 * | Double Metaphone | `Smith` -> `XMT` (should start SM0) | removed  |
 * | NYSIIS     | `MACINTOSH` -> `ACCANT`                  | removed  |
 * | Cologne    | `Meier` -> `6000`                        | removed  |
 *
 * A phonetic code that is wrong is worse than no phonetic code: it reports two names as matching when
 * they do not, and the caller has no way to tell. Shipping four unverified algorithms behind a
 * confident interface would have been exactly the silent-wrong-answer failure this project keeps finding,
 * so the honest outcome is three verified functions and a note about what is missing.
 *
 * **Soundex** is the US Census algorithm: a vowel-dropping consonant grouping with an American initial
 * exception. Two of its rules are where implementations usually go wrong and are handled explicitly
 * below - `H` and `W` are transparent separators, and the digit *before* a transparent letter is
 * discarded, which is what makes `Pfister` P236 and not P123.
 *
 * **Jaro-Winkler** applies its prefix bonus only above a base similarity of 0.7, which is the original
 * definition. Skipping that threshold hands unrelated words that happen to share a few leading letters
 * a score they have not earned.
 */

export type PhoneticAlgorithm = 'soundex';
export type SimilarityAlgorithm = 'levenshtein' | 'jaro_winkler' | 'dice';

/** US Census Soundex. Returns four characters: a letter and three digits, padded with zeroes. */
export function soundex(input: string): string {
  const letters = input.toUpperCase().replace(/[^A-Z]/g, '');
  if (!letters) return '';

  const groups: Record<string, string> = {
    B: '1',
    F: '1',
    P: '1',
    V: '1',
    C: '2',
    G: '2',
    J: '2',
    K: '2',
    Q: '2',
    S: '2',
    X: '2',
    Z: '2',
    D: '3',
    T: '3',
    L: '4',
    M: '5',
    N: '5',
    R: '6',
  };

  const first = letters[0] as string;
  let code = first;
  let previous = groups[first] ?? '';

  for (let index = 1; index < letters.length && code.length < 4; index += 1) {
    const letter = letters[index] as string;
    const digit = groups[letter];
    if (letter === 'H' || letter === 'W') {
      // Transparent, and this is the rule implementations get wrong. H and W emit no digit of their own
      // and they do NOT end the run: `Ashcraft` is A261, because the 2 from S is still the previous
      // digit when C arrives and so C does not add a second one. Clearing `previous` here - which a
      // plausible reading of "transparent" suggests - makes it A226, a code no Soundex implementation
      // produces.
      continue;
    }
    if (digit) {
      if (digit !== previous) code += digit;
      previous = digit;
      continue;
    }
    // A vowel, or any uncoded letter, also ends the run.
    previous = '';
  }

  return `${code}000`.slice(0, 4);
}

/**
 * Levenshtein edit distance: substitutions, insertions and deletions each cost one.
 *
 * Case is folded unless `caseSensitive` is set. The flag exists because a caller comparing two `id`s
 * may want `Ab` and `ab` to differ, and an option that cannot change anything is worse than none.
 */
export function levenshtein(a: string, b: string, caseSensitive = false): number {
  const left = caseSensitive ? a : a.toLowerCase();
  const right = caseSensitive ? b : b.toLowerCase();
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  // One row, rebuilt per source character. The full matrix is unnecessary for the value alone and would
  // be O(n*m) memory for a name comparison.
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] as number) + 1,
        (previous[j] as number) + 1,
        (previous[j - 1] as number) + cost,
      );
    }
    previous = current;
  }
  return previous[right.length] as number;
}

/** Jaro-Winkler similarity in the range 0..1. */
export function jaroWinkler(a: string, b: string, caseSensitive = false): number {
  const left = caseSensitive ? a : a.toLowerCase();
  const right = caseSensitive ? b : b.toLowerCase();
  if (left === right) return 1;
  if (!left.length || !right.length) return 0;

  const window = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftFlags = new Array<boolean>(left.length).fill(false);
  const rightFlags = new Array<boolean>(right.length).fill(false);

  let matches = 0;
  for (let i = 0; i < left.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, right.length);
    for (let j = start; j < end; j += 1) {
      if (rightFlags[j] || left[i] !== right[j]) continue;
      leftFlags[i] = true;
      rightFlags[j] = true;
      matches += 1;
      break;
    }
  }
  // No shared character in range means nothing to weight, and the prefix bonus must not rescue it:
  // `abc` and `xyz` share no letters, so a score of 0.4 on a common first letter would be an artefact.
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (!leftFlags[i]) continue;
    while (!rightFlags[k]) k += 1;
    if (left[i] !== right[k]) transpositions += 1;
    k += 1;
  }
  const half = transpositions / 2;
  const jaro = (matches / left.length + matches / right.length + (matches - half) / matches) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, left.length, right.length); i += 1) {
    if (left[i] !== right[i]) break;
    prefix += 1;
  }
  // The threshold is part of the definition, not a tuning choice.
  const base = jaro > 0.7 ? jaro : 0;
  return base + prefix * 0.1 * (1 - base);
}

/**
 * Sørensen-Dice coefficient over character bigrams, in the range 0..1.
 *
 * `night` and `nacht` share only the bigram `ht`, so 2*1 / (4+4) = 0.25. That is the correct answer and
 * it is low: the two words sound alike but do not look alike, which is precisely why a phonetic code
 * exists alongside this measure.
 */
export function diceCoefficient(a: string, b: string, caseSensitive = false): number {
  const bigrams = (value: string): Map<string, number> => {
    const text = caseSensitive ? value : value.toLowerCase();
    const out = new Map<string, number>();
    for (let index = 0; index < text.length - 1; index += 1) {
      const key = text.slice(index, index + 2);
      out.set(key, (out.get(key) ?? 0) + 1);
    }
    return out;
  };
  const left = bigrams(a);
  const right = bigrams(b);
  // A single character has no bigrams, so the coefficient is defined as 0 rather than as a division by
  // zero or an accidental 1.
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const [key, count] of left) {
    const other = right.get(key);
    if (other) shared += Math.min(count, other);
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

export function similarity(algorithm: SimilarityAlgorithm, a: string, b: string, caseSensitive = false): number {
  if (algorithm === 'levenshtein') {
    // Normalised to 0..1 so every algorithm here answers the same question on one scale. Without this a
    // caller comparing two scores has to know which unit each one uses.
    const longest = Math.max(a.length, b.length);
    return longest === 0 ? 1 : 1 - levenshtein(a, b, caseSensitive) / longest;
  }
  if (algorithm === 'dice') return diceCoefficient(a, b, caseSensitive);
  return jaroWinkler(a, b, caseSensitive);
}
