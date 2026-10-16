import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { contrastRatio, describe, mix, parseColour, toHsl, toHex, wcagLevels } from './_color.js';
import type { Rgba } from './_color.js';

/**
 * Palette generation.
 *
 * Ramps are built by mixing toward white and black rather than by stepping lightness in HSL, because
 * mixing in HSL shifts the hue as lightness changes: a blue ramp built that way turns violet at the
 * light end. Mixing in sRGB holds the hue and is what a designer means by "lighter" and "darker".
 */
export default defineTool({
  name: 'pro_color_palette',
  description:
    'Rangdan palitra yasash: yorqin va quyuq pog‘onalar (tints/shades), analogik, komplementar, ' +
    'triadik, split-komplementar. Har bir rang WCAG kontrasti bilan tekshiriladi, shuning uchun ' +
    'o‘qilishi mumkin bo‘lgan juftliklarni ko‘rasiz.',
  category: 'color',
  inputSchema: {
    type: 'object',
    properties: {
      color: { type: 'string', description: 'Asosiy rang (hex, rgb(), hsl(), oklch() yoki nom)' },
      steps: { type: 'number', description: 'Pog‘ona soni (standart 5, ko‘pi 11)' },
      mode: {
        type: 'string',
        enum: ['tints', 'shades', 'both', 'harmony'],
        description: 'Palitra turi (standart both — yorqin va quyuq)',
      },
      harmony: {
        type: 'string',
        enum: ['analogous', 'complementary', 'triadic', 'split', 'tetradic'],
        description: 'Harmoniya turi (mode=harmony bo‘lganda)',
      },
      background: { type: 'string', description: 'Kontrast uchun fon rangi (standart oq)' },
    },
    required: ['color'],
  },
  async handler(input) {
    const p = view(input);
    let base;
    try {
      base = parseColour(p.color);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const steps = num(p, 'steps', 5, 2, 11);
    const mode = strOrEmpty(p, 'mode') || 'both';
    const background = (() => {
      const raw = strOrEmpty(p, 'background');
      if (!raw) return { r: 255, g: 255, b: 255, a: 1 };
      try {
        return parseColour(raw);
      } catch (error) {
        throw error instanceof Error ? error.message : String(error);
      }
    })();

    const white = { r: 255, g: 255, b: 255, a: 1 };
    const black = { r: 0, g: 0, b: 0, a: 1 };

    interface Swatch extends Record<string, unknown> {
      label: string;
      contrast_with_background: { ratio: number; levels: ReturnType<typeof wcagLevels>; readable_as_text: boolean };
    }

    const swatch = (colour: Rgba, label: string, amount: number): Swatch => {
      const ratio = contrastRatio(colour, background);
      return {
        label,
        amount: Number(amount.toFixed(3)),
        hex: toHex(colour),
        ...describe(colour),
        contrast_with_background: {
          ratio,
          levels: wcagLevels(ratio),
          readable_as_text: wcagLevels(ratio).aa_normal,
        },
      };
    };

    const tints: Swatch[] = [];
    const shades: Swatch[] = [];
    if (mode === 'tints' || mode === 'both') {
      for (let index = 1; index <= steps; index++) {
        const amount = index / (steps + 1);
        tints.push(swatch(mix(base, white, amount), `tint ${index}/${steps}`, amount));
      }
    }
    if (mode === 'shades' || mode === 'both') {
      for (let index = 1; index <= steps; index++) {
        const amount = index / (steps + 1);
        shades.push(swatch(mix(base, black, amount), `shade ${index}/${steps}`, amount));
      }
    }

    let harmony: Array<Record<string, unknown>> = [];
    if (mode === 'harmony') {
      const hsl = toHsl(base);
      const kind = strOrEmpty(p, 'harmony') || 'analogous';
      const offsets: Record<string, number[]> = {
        analogous: [-30, -15, 0, 15, 30],
        complementary: [0, 180],
        triadic: [0, 120, 240],
        split: [0, 150, 210],
        tetradic: [0, 90, 180, 270],
      };
      const angles = offsets[kind];
      if (!angles) return fail(`ma’lum emas: ${kind}. Mumkin: ${Object.keys(offsets).join(', ')}.`);
      harmony = angles.map((angle, index) => {
        const rotated = parseColour(`hsl(${hsl.h + angle}, ${hsl.s}%, ${hsl.l}%)`);
        return { label: `${kind} ${index + 1}`, hue_offset: angle, ...describe(rotated) };
      });
    }

    return jsonBlock('Palitra', {
      base: describe(base),
      mode,
      steps,
      background: describe(background),
      // A ramp a reader cannot use is a decoration. Naming which steps clear AA on the given background
      // is what turns a swatch list into something a design decision can be made on.
      usable_on_background: {
        tints: tints.filter((s) => s.contrast_with_background.readable_as_text === true).map((s) => s.label),
        shades: shades.filter((s) => s.contrast_with_background.readable_as_text === true).map((s) => s.label),
      },
      tints,
      shades,
      harmony,
    });
  },
});
