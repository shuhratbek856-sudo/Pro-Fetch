import { defineTool } from '../../core/tool.js';
import { jsonBlock, failJson } from '../../core/format.js';
import { bool, strOrEmpty, view } from '../../core/input.js';
import { diceCoefficient, jaroWinkler, levenshtein, soundex } from './_phonetics.js';

export default defineTool({
  name: 'pro_phonetics_compare',
  description:
    'Ikki satrni solishtirish: Levenshtein masofasi, Jaro-Winkler va Dice o‘xshatligi (0..1), ' +
    'hamda ikkalasining Soundex kodi. Kodlar bir xil bo‘lsa, nomlar taxminan bir xil degani - lekin ' +
    'Soundex bosh harflarni farqlamaydi, shuning uchun ham o‘xshatlik, ham kod ko‘rsatiladi.',
  category: 'phonetics',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'string', description: 'Birinchi satr' },
      b: { type: 'string', description: 'Ikkinchi satr' },
      ignore_case: { type: 'boolean', description: 'Katta-kichik harflarni hisobga olmaslik (standart: ha)' },
    },
    required: ['a', 'b'],
  },
  async handler(input) {
    const p = view(input);
    const a = strOrEmpty(p, 'a');
    const b = strOrEmpty(p, 'b');
    const ignoreCase = p.ignore_case === undefined ? true : bool(p, 'ignore_case', true);

    if (!a || !b) return failJson('Solishtirish', { error: 'a va b ikkalasi ham kerak.' });

    // `caseSensitive` is the inverse of `ignore_case`, and it is passed down: an option that cannot
    // change the result is not an option, it is decoration.
    const caseSensitive = !ignoreCase;
    const longest = Math.max(a.length, b.length);

    const distance = levenshtein(a, b, caseSensitive);
    const jaro = jaroWinkler(a, b, caseSensitive);
    const dice = diceCoefficient(a, b, caseSensitive);
    const codeA = soundex(a);
    const codeB = soundex(b);

    return jsonBlock(`"${a}" va "${b}"`, {
      a,
      b,
      levenshtein: {
        distance: distance,
        normalised: longest === 0 ? 1 : Number((1 - distance / longest).toFixed(6)),
      },
      jaro_winkler: Number(jaro.toFixed(6)),
      dice: Number(dice.toFixed(6)),
      soundex: { a: codeA, b: codeB, equal: codeA !== '' && codeA === codeB },
      // A single verdict would be a guess. Three measures disagree by design - they answer different
      // questions - and a caller picking one blindly gets whichever answer it happened to read.
      verdict: buildVerdict({ jaro, dice, normalised: longest === 0 ? 1 : 1 - distance / longest, codeA, codeB }),
      case_sensitive: caseSensitive,
    });
  },
});

function buildVerdict(input: { jaro: number; dice: number; normalised: number; codeA: string; codeB: string }): string {
  const sameCode = input.codeA !== '' && input.codeA === input.codeB;
  const best = Math.max(input.jaro, input.dice, input.normalised);
  if (sameCode && best >= 0.85) return 'yuqori o‘xshashlik';
  if (sameCode) return `bir xil Soundex kodi (${input.codeA}), lekin yozuvi sezilarli farq qiladi`;
  if (best >= 0.9) return 'yozuvi juda yaqin, Soundex kodi boshqacha';
  if (best >= 0.7) return 'o‘rtacha o‘xshashlik';
  if (best >= 0.4) return 'uzoq';
  return 'umuman o‘xshamas';
}
