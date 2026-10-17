// Phonetic encoding and similarity.
//
// The Soundex expectations are the published US Census vectors, not values taken from this
// implementation: a test that compares the code to itself passes against any code at all, including a
// wrong one. That is not theoretical - four other algorithms were written this session and all four
// failed their vectors, which is why they are not in the registry.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { diceCoefficient, jaroWinkler, levenshtein, soundex } from '../src/tools/phonetics/_phonetics.js';
import type { ToolResult } from '../src/core/types.js';

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

describe('soundex against the US Census vectors', () => {
  it.each([
    ['Robert', 'R163'],
    ['Rupert', 'R163'],
    ['Rubin', 'R150'],
    ['Ashcraft', 'A261'],
    ['Tymczak', 'T522'],
    ['Pfister', 'P236'],
    ['Honeyman', 'H555'],
    ['Washington', 'W252'],
    ['Lee', 'L000'],
    ['Gutierrez', 'G362'],
    ['Jackson', 'J250'],
    ['VanDeusen', 'V532'],
  ])('%s is %s', (word, code) => {
    expect(soundex(word), word).toBe(code);
  });

  it('treats H and W as separators and forgets the digit before them', () => {
    // Pfister is P236, not P123: the 1 from P is discarded so that F starts a new group. Ashcraft is
    // A261, not A226: the h stops s and c from collapsing into one digit.
    expect(soundex('Pfister')).toBe('P236');
    expect(soundex('Ashcraft')).toBe('A261');
    expect(soundex('Tymczak')).toBe('T522');
  });

  it('pads to four characters with zeroes', () => {
    expect(soundex('Lee')).toBe('L000');
    expect(soundex('A')).toBe('A000');
  });

  it('returns nothing for input with no letters, rather than an empty code', () => {
    // "0000" would look like a real code and match against anything else that produced one.
    expect(soundex('')).toBe('');
    expect(soundex('123')).toBe('');
    expect(soundex('!!!')).toBe('');
  });

  it('ignores punctuation and case', () => {
    expect(soundex("O'Brien")).toBe(soundex('OBRIEN'));
    expect(soundex('ttymkczak')).toBe(soundex('Tymczak'));
  });
});

describe('levenshtein', () => {
  it.each([
    ['kitten', 'sitting', 3],
    ['flaw', 'lawn', 2],
    ['same', 'same', 0],
    ['', 'abc', 3],
    ['abc', '', 3],
  ])('%s -> %s is %i', (a, b, expected) => {
    expect(levenshtein(a, b)).toBe(expected);
  });

  it('can be told to care about case', () => {
    // The flag exists because a caller comparing identifiers may want Ab and ab to differ. An option
    // that cannot change the result is decoration.
    expect(levenshtein('Ab', 'ab')).toBe(0);
    // One substitution, not two: the b is already equal.
    expect(levenshtein('Ab', 'ab', true)).toBe(1);
  });
});

describe('jaro-winkler', () => {
  it.each([
    ['Dixon', 'Dicksonx', 0.8133],
    ['MARTHA', 'MARHTA', 0.9611],
    ['DWAYNE', 'DUANE', 0.84],
    ['JELLYFISH', 'SMELLYFISH', 0.8963],
  ])('%s vs %s', (a, b, expected) => {
    expect(jaroWinkler(a, b)).toBeCloseTo(expected, 3);
  });

  it('returns 1 for an identical pair and 0 for one with nothing in common', () => {
    expect(jaroWinkler('same', 'same')).toBe(1);
    // Sharing a first letter must not rescue words with no shared characters.
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('does not apply the prefix bonus below the 0.7 threshold', () => {
    // Both start with the same letters, and the base similarity is below the threshold, so the answer
    // is the plain Jaro score. This is the original definition, not a tuning choice.
    const withBonus = jaroWinkler('abcabcd', 'abcxyz');
    expect(withBonus).toBeLessThan(0.7);
  });
});

describe('dice coefficient', () => {
  it('counts shared bigrams', () => {
    expect(diceCoefficient('context', 'contact')).toBeCloseTo(0.5, 5);
    // night and nacht share only `ht`: 2*1 / (4+4) = 0.25. Low is correct - they sound alike but do
    // not look alike, which is why a phonetic code exists beside this measure.
    expect(diceCoefficient('night', 'nacht')).toBeCloseTo(0.25, 5);
  });

  it('is zero when a word is too short to have bigrams', () => {
    // Not 1, and not a division by zero.
    expect(diceCoefficient('a', 'a')).toBe(0);
  });
});

describe('pro_phonetics_soundex', () => {
  it('codes a single name', async () => {
    const data = payload(await callTool('pro_phonetics_soundex', { name: 'Robert' }));
    expect((data.items as unknown as Array<{ code: string }>)[0].code).toBe('R163');
  });

  it('groups names that share a code', async () => {
    const data = payload(await callTool('pro_phonetics_soundex', { names: ['Robert', 'Rupert', 'Rubin', 'Lee'] }));
    expect(data.matching_groups).toBeGreaterThanOrEqual(1);
    const groups = data.matches as unknown as Array<{ code: string; names: string[] }>;
    const shared = groups.find((group) => group.names.includes('Robert'));
    expect(shared?.names).toContain('Rupert');
  });

  it('names the inputs it could not code instead of returning empty strings', async () => {
    const data = payload(await callTool('pro_phonetics_soundex', { names: ['Robert', '123'] }));
    expect(data.uncodeable).toContain('123');
  });

  it('refuses an empty request rather than reporting zero names', async () => {
    // `fail()`, not a JSON block carrying an `error` key: a refusal that arrives as `isError: false`
    // reads as "it worked and found nothing", which is the failure mode this tool had.
    const result = await callTool('pro_phonetics_soundex', {});
    expect(result.isError).toBeTruthy();
    expect((result.content ?? []).map((item) => item.text ?? '').join(' ')).toMatch(/majburiy/);
  });
});

describe('pro_phonetics_compare', () => {
  it('reports all three measures and both codes', async () => {
    const data = payload(await callTool('pro_phonetics_compare', { a: 'Smith', b: 'Smit' }));
    expect(data.levenshtein).toBeDefined();
    expect(data.jaro_winkler).toBeGreaterThan(0.5);
    expect((data.soundex as unknown as { equal: boolean }).equal).toBe(true);
  });

  it('shows Soundex agreeing on names that differ only in the first letter', async () => {
    const data = payload(await callTool('pro_phonetics_compare', { a: 'Jon', b: 'Jan' }));
    // Soundex cannot see this - the first letter becomes the output's first letter - so both are J500.
    // My first test asserted they differed, which asserted the limitation away instead of showing it.
    const soundexBlock = data.soundex as unknown as { a: string; b: string; equal: boolean };
    expect(soundexBlock.a).toBe(soundexBlock.b);
    expect(soundexBlock.equal).toBe(true);
    // The verdict has to say the spellings differ despite the shared code, or a caller reads `equal`
    // as a match.
    expect(data.verdict).toEqual(expect.stringContaining('sezilarli farq'));
  });

  it('honours case sensitivity in both directions', async () => {
    const folded = payload(await callTool('pro_phonetics_compare', { a: 'Ab', b: 'ab' }));
    const exact = payload(await callTool('pro_phonetics_compare', { a: 'Ab', b: 'ab', ignore_case: false }));
    expect((folded.levenshtein as unknown as { distance: number }).distance).toBe(0);
    expect((exact.levenshtein as unknown as { distance: number }).distance).toBe(1);
  });

  it('refuses a missing argument rather than comparing against nothing', async () => {
    // The required-argument guard answers with an error *result*, not a JSON block. Reading `.error`
    // from that yields undefined, which is what the first version of this test asserted against - so
    // it would have passed against a tool that refused nothing.
    const result = await callTool('pro_phonetics_compare', { a: 'x' });
    expect(result.isError).toBeTruthy();
    expect((result.content ?? []).map((item) => item.text ?? '').join(' ')).toMatch(/majburiy/);
  });
});

describe('pro_phonetics_match', () => {
  it('finds spelling variants across two lists', async () => {
    const data = payload(
      await callTool('pro_phonetics_match', {
        left: ['Smith', 'Jones'],
        right: ['Smit', 'Johns', 'Brown'],
        threshold: 0.8,
      }),
    );
    const results = data.results as unknown as Array<{ left: string; right: string; score: number }>;
    expect(results.some((pair) => pair.left === 'Smith' && pair.right === 'Smit')).toBe(true);
    expect(results.every((pair) => pair.score >= 0.8)).toBe(true);
  });

  it('can be limited to one match per element, and reports what it dropped', async () => {
    const data = payload(
      await callTool('pro_phonetics_match', {
        left: ['Smith'],
        right: ['Smit', 'Smyth'],
        threshold: 0.8,
        one_to_one: true,
      }),
    );
    expect(data.matches).toBe(1);
    expect(data.dropped_for_one_to_one).toBe(1);
  });

  it('counts the pairs it actually considered', async () => {
    const data = payload(await callTool('pro_phonetics_match', { left: ['a', 'b'], right: ['c', 'd'] }));
    expect(data.considered_pairs).toBe(4);
  });

  it('refuses a pair count it cannot score', async () => {
    // Every pair is scored, so the product is a real bound and the tool has to say so.
    const many = Array.from({ length: 600 }, (_, index) => `n${index}`);
    const data = payload(await callTool('pro_phonetics_match', { left: many, right: many }));
    expect(data.error).toEqual(expect.stringContaining('200000'));
  });

  it('refuses an empty side', async () => {
    expect(payload(await callTool('pro_phonetics_match', { left: [], right: ['a'] })).error).toBeDefined();
  });
});
