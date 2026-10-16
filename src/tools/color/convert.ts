import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { contrastRatio, describe, parseColour, wcagLevels, NAMED_COLOURS } from './_color.js';

export default defineTool({
  name: 'pro_color_convert',
  description:
    'Rangni barcha shakllar o‘zgartirish: HEX, RGB(A), HSL, OKLCH, LAB va nomlangan ranglar ' +
    '(141 ta). "against" berilsa, ikki rang orasidagi WCAG kontrasti ham hisoblanadi.',
  category: 'color',
  inputSchema: {
    type: 'object',
    properties: {
      color: {
        type: 'string',
        description:
          'Rang: #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), oklch(), lab(), lch() ' +
          'yoki nom (masalan "teal").',
      },
      hex: { type: 'string', description: 'Rang (boshqa yozuv)' },
      rgb: { type: 'array', items: { type: 'number' }, description: 'Rang [r, g, b] yoki [r, g, b, a]' },
      against: { type: 'string', description: 'Ikkinchi rang — kontrast hisoblanadi' },
      list: { type: 'boolean', description: 'Barcha 141 nomlangan rangni ro‘yxat qilish' },
    },
    anyOf: [{ required: ['color'] }, { required: ['hex'] }, { required: ['rgb'] }],
  },
  async handler(input) {
    const p = view(input);
    if (p.list === true || String(p.list ?? '') === 'true') {
      const entries = Object.entries(NAMED_COLOURS);
      return jsonBlock('Nomlangan ranglar', {
        count: entries.length,
        colours: entries.map(([name, hex]) => ({ name, hex })),
      });
    }

    const raw = strOrEmpty(p, 'color') || strOrEmpty(p, 'hex');
    let colour;
    try {
      colour = raw ? parseColour(raw) : Array.isArray(p.rgb) ? parseColour(p.rgb as unknown[]) : null;
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
    if (!colour) return fail('color, hex yoki rgb argumentlaridan biri kerak.');

    const result: Record<string, unknown> = describe(colour);

    const against = strOrEmpty(p, 'against');
    if (against) {
      let other;
      try {
        other = parseColour(against);
      } catch (error) {
        return fail(`against: ${error instanceof Error ? error.message : String(error)}`);
      }
      const ratio = contrastRatio(colour, other);
      const levels = wcagLevels(ratio);
      result.contrast = {
        against: describe(other),
        ratio,
        levels,
        // One line a designer can act on, rather than four booleans they have to compare themselves.
        verdict: levels.aaa_normal
          ? 'AAA — oddiy matn uchun ham yetarli'
          : levels.aa_normal
            ? 'AA — oddiy matn uchun yetarli, kattaroq matn uchun AAA emas'
            : levels.aa_large
              ? 'faqat katta matn uchun AA (kichik matn uchun yetarli emas)'
              : 'hech bir WCAG darajasiga yetmaydi',
      };
    }

    return jsonBlock('Rang', result);
  },
});
