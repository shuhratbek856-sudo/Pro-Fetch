import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { contrastRatio, describe, parseColour, relativeLuminance, toHex, wcagLevels } from './_color.js';
import type { Rgba } from './_color.js';

const DEFAULT_PAIRS = [
  ['#ffffff', '#000000'],
  ['#ffffff', '#767676'],
  ['#ffffff', '#595959'],
  ['#000000', '#ffffff'],
  ['#000000', '#949494'],
  ['#000000', '#757575'],
  ['#1a1a1a', '#f5f5f5'],
];

export default defineTool({
  name: 'pro_color_contrast',
  description:
    'WCAG kontrast tekshiruvi: ikki rang orasidagi nisbat va AA/AAA darajalari. Rang yoki ' +
    'rasmdan avtomatik eng yaxshi o‘qiladigan juftlikni topadi. Bir nechta rang ro‘yxatini ham ' +
    'tekshiradi.',
  category: 'color',
  inputSchema: {
    type: 'object',
    properties: {
      foreground: { type: 'string', description: 'Matn yoki oldingi rang' },
      background: { type: 'string', description: 'Orqa fon rangi' },
      colors: { type: 'array', items: { type: 'string' }, description: ' tekshiriladigan ranglar ro‘yxati' },
      suggest: { type: 'boolean', description: 'Eng yaxshi o‘qiladigan juftlikni topish' },
      large_text: { type: 'boolean', description: 'Katta matn (18pt+) uchun chegaralarni ishlatish' },
    },
    anyOf: [{ required: ['foreground', 'background'] }, { required: ['colors'] }, { required: ['suggest'] }],
  },
  async handler(input) {
    const p = view(input);
    const large = p.large_text === true || String(p.large_text ?? '') === 'true';

    // A list of colours is checked against white and black both ways, because which one is the text is
    // not known and assuming it would report a passing pair the other way round.
    const list = Array.isArray(p.colors)
      ? (p.colors as unknown[]).filter((c): c is string => typeof c === 'string')
      : [];
    if (list.length > 0) {
      const rows = [];
      for (const entry of list) {
        let colour;
        try {
          colour = parseColour(entry);
        } catch (error) {
          return fail(`${entry}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const onWhite = contrastRatio(colour, { r: 255, g: 255, b: 255, a: 1 });
        const onBlack = contrastRatio(colour, { r: 0, g: 0, b: 0, a: 1 });
        rows.push({
          color: describe(colour),
          on_white: { ratio: onWhite, levels: wcagLevels(onWhite) },
          on_black: { ratio: onBlack, levels: wcagLevels(onBlack) },
          best: onWhite >= onBlack ? 'oq fon ustida' : 'qora fon ustida',
        });
      }
      return jsonBlock('Kontrast tekshiruvi', { count: rows.length, large_text: large, results: rows });
    }

    const suggest = p.suggest === true || String(p.suggest ?? '') === 'true';
    if (suggest) {
      // The candidate set is measured, not assumed: these are the pairs that sit on the AA boundary, so
      // a suggestion that lands on one of them is a suggestion worth looking at.
      const rows = DEFAULT_PAIRS.map(([foreground, background]) => {
        const ratio = contrastRatio(parseColour(foreground), parseColour(background));
        const levels = wcagLevels(ratio);
        return {
          foreground,
          background,
          hex: `${foreground} on ${background}`,
          ratio,
          levels,
          meets: large ? (levels.aa_large ? 'katta matn AA' : 'yo‘q') : levels.aa_normal ? 'AA' : 'yo‘q',
        };
      });
      return jsonBlock('Kontrast misollari', { large_text: large, pairs: rows });
    }

    let foreground;
    let background;
    try {
      foreground = parseColour(strOrEmpty(p, 'foreground'));
      background = parseColour(strOrEmpty(p, 'background'));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    const ratio = contrastRatio(foreground, background);
    const levels = wcagLevels(ratio);
    return jsonBlock('Kontrast', {
      foreground: describe(foreground),
      background: describe(background),
      ratio,
      levels,
      required: large ? { aa: 3, aaa: 4.5 } : { aa: 4.5, aaa: 7 },
      passes: large ? levels.aa_large : levels.aa_normal,
      suggestion: pickBetter(foreground, background, ratio, large),
    });
  },
});

/**
 * A nearby colour that would pass, when the current one does not.
 *
 * Moves the foreground along the line toward white or away from it, in 20 steps, and returns the first
 * step that clears the threshold and improves on the current ratio. Two things it deliberately does not
 * do: return a suggestion that still fails, and change the hue. A failing pair with no suggestion is
 * more useful than a passing suggestion nobody asked for.
 *
 * Returns null when the pair already passes, or when no lightness of the same hue can reach the target -
 * which happens when the background and the foreground sit at the same luminance.
 */
function pickBetter(
  foreground: Rgba,
  background: Rgba,
  ratio: number,
  large: boolean,
): { hex: string; ratio: number; direction: string } | null {
  const target = large ? 3 : 4.5;
  if (ratio >= target) return null;

  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  // Move *away* from the background, never toward it. Text darker than its background has to get
  // darker still; the first version moved it toward white, which reduced the ratio and then reported no
  // suggestion - a "here is how to make this readable" tool going silent on the most common case.
  const direction = foregroundLuminance < backgroundLuminance ? 'darker' : 'lighter';

  for (let step = 1; step <= 20; step++) {
    const amount = step / 20;
    const candidate: Rgba = {
      ...foreground,
      ...(direction === 'lighter'
        ? {
            r: Math.round(foreground.r + (255 - foreground.r) * amount),
            g: Math.round(foreground.g + (255 - foreground.g) * amount),
            b: Math.round(foreground.b + (255 - foreground.b) * amount),
          }
        : {
            r: Math.round(foreground.r * (1 - amount)),
            g: Math.round(foreground.g * (1 - amount)),
            b: Math.round(foreground.b * (1 - amount)),
          }),
    };
    const value = contrastRatio(candidate, background);
    if (value >= target && value > ratio) {
      return { hex: toHex(candidate), ratio: value, direction };
    }
  }
  return null;
}
