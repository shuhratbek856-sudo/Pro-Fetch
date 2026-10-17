import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { arr, bool, float, num, strOrEmpty, view } from '../../core/input.js';
import { jaroWinkler, levenshtein, soundex } from './_phonetics.js';

export default defineTool({
  name: 'pro_phonetics_match',
  description:
    'Ikki ro‘yxatdagi mos ishlarni topish: Soundex kodi bo‘yicha va o‘xshatlik bo‘yicha. Har bir juft ' +
    'uchta raqam bilan baholanadi, shuning uchun caller o‘zi tanlaydi - Soundex "Smith" va "Smit" ni ' +
    'topadi, lekin "Jon" va "Jan" ni topmaydi, chunki birinchi harfni umuman farqlamaydi.',
  category: 'phonetics',
  inputSchema: {
    type: 'object',
    properties: {
      left: { type: 'array', items: { type: 'string' }, description: 'Birinchi ro‘yxat' },
      right: { type: 'array', items: { type: 'string' }, description: 'Ikkinchi ro‘yxat' },
      threshold: { type: 'number', description: 'Minimal o‘xshatlik 0..1 (standart 0.8)' },
      use_soundex: { type: 'boolean', description: 'Soundex kodi bo‘yicha ham qidirish (standart: ha)' },
      one_to_one: { type: 'boolean', description: 'Har bir element faqat bir marta mos kelsin' },
      limit: { type: 'number', description: 'Ko‘pi bilan shuncha moslik (standart 100)' },
    },
    required: ['left', 'right'],
  },
  async handler(input) {
    const p = view(input);
    const left = arr(p, 'left')
      .map((item) => String(item))
      .filter(Boolean);
    const right = arr(p, 'right')
      .map((item) => String(item))
      .filter(Boolean);
    // `float`, not `num`. `num` clamps to a minimum of 1 by default, so `threshold: 0.8` arrived here as
    // `1` and the tool matched nothing at all while reporting `threshold: 1` and no error. Measured:
    // num(0.8) -> 1, num(0.5) -> 1, num(0.25) -> 1. A percentage is still accepted, because callers
    // write 80 as often as 0.8.
    const thresholdValue = float(p, 'threshold', 0.8);
    const threshold = Math.max(0, Math.min(thresholdValue > 1 ? thresholdValue / 100 : thresholdValue, 1));
    const useSoundex = bool(p, 'use_soundex', true);
    const oneToOne = bool(p, 'one_to_one', false);
    const limit = Math.max(1, Math.min(num(p, 'limit', 100) || 100, 1000));

    if (left.length === 0 || right.length === 0) {
      return jsonBlock('Moslik', { error: 'left va right ikkalasi ham bo‘sh bo‘lmasligi kerak.' });
    }
    // Every pair is scored, so the product is the real bound on the work; a cap protects the tool from
    // a caller who pasted a spreadsheet.
    if (left.length * right.length > 200_000) {
      return jsonBlock('Moslik', {
        error: `${left.length} x ${right.length} juftlik juda ko‘p (200000 dan ortiq). Ro‘yxatlarni bo‘ling.`,
      });
    }

    interface Pair {
      left: string;
      right: string;
      soundex_left: string;
      soundex_right: string;
      same_soundex: boolean;
      jaro_winkler: number;
      levenshtein: number;
      score: number;
    }

    const pairs: Pair[] = [];
    const leftCodes = new Map<string, string>();
    const rightCodes = new Map<string, string>();
    for (const name of left) if (!leftCodes.has(name)) leftCodes.set(name, soundex(name));
    for (const name of right) if (!rightCodes.has(name)) rightCodes.set(name, soundex(name));

    for (const a of left) {
      for (const b of right) {
        const codeA = leftCodes.get(a) ?? '';
        const codeB = rightCodes.get(b) ?? '';
        const same = useSoundex && codeA !== '' && codeA === codeB;
        const jaro = jaroWinkler(a, b);
        const distance = levenshtein(a, b);
        const longest = Math.max(a.length, b.length);
        const edited = longest === 0 ? 1 : 1 - distance / longest;

        // The score is the best available signal rather than an average: averaging would let a shared
        // Soundex code drag an unrelated pair up, and would let a near-identical spelling be dragged
        // down by a code that differs for one letter.
        const score = Math.max(jaro, same ? 0.95 : 0, edited);
        if (score < threshold) continue;
        pairs.push({
          left: a,
          right: b,
          soundex_left: codeA,
          soundex_right: codeB,
          same_soundex: same,
          jaro_winkler: Number(jaro.toFixed(6)),
          levenshtein: distance,
          score: Number(score.toFixed(6)),
        });
      }
    }

    pairs.sort((a, b) => b.score - a.score);

    let matches = pairs;
    let droppedForOneToOne = 0;
    if (oneToOne) {
      // Greedy on the sorted list: the best pair claims its elements. Not optimal in general, but it is
      // predictable, and which element loses is reported rather than hidden.
      const usedLeft = new Set<string>();
      const usedRight = new Set<string>();
      matches = [];
      for (const pair of pairs) {
        if (usedLeft.has(pair.left) || usedRight.has(pair.right)) {
          droppedForOneToOne += 1;
          continue;
        }
        usedLeft.add(pair.left);
        usedRight.add(pair.right);
        matches.push(pair);
      }
    }

    return jsonBlock('Moslik topildi', {
      left: left.length,
      right: right.length,
      threshold,
      use_soundex: useSoundex,
      one_to_one: oneToOne,
      considered_pairs: left.length * right.length,
      matches: matches.length,
      dropped_for_one_to_one: droppedForOneToOne > 0 ? droppedForOneToOne : undefined,
      results: matches.slice(0, limit),
      truncated: matches.length > limit ? true : undefined,
      unmatched_left: oneToOne ? left.filter((name) => !matches.some((pair) => pair.left === name)) : undefined,
    });
  },
});
