import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { formatNumber, findUnit, parseQuantity, unitsInFamily, type Family } from './_units.js';

const USAGE: Record<string, string> = {
  length: 'buyuklik: km, m, cm, mm, mi, ft, in, yd, nmi, ly, pc',
  mass: 'massa: kg, g, mg, t, lb, oz, st, gr, ct',
  temperature: 'harorat: degC, degF, K, degR',
  volume: 'hajm: L, mL, tsp, tbsp, floz, cup, pt, qt, gal, bbl',
  area: 'maydon: m2, km2, ha, acre, ft2, mi2',
  speed: 'tezlik: mps, kmh, mph, fps, kn, c',
  pressure: 'bosim: Pa, kPa, bar, atm, psi, mmHg',
  energy: 'energiya: J, kJ, cal, kcal, Wh, kWh, BTU, eV',
  power: 'quvvat: W, kW, MW, hp',
  time: 'vaqt: s, ms, min, h, d, wk, mo, yr',
  data: 'ma’lumot: bit, byte, kB, MB, GB, KiB, MiB, GiB',
  frequency: 'chastota: Hz, kHz, MHz, rpm',
  force: 'kuch: N, kN, lbf, kgf, dyn',
  angle: 'burchak: rad, deg, grad, turn, arcmin, arcsec',
  fuel: 'yo‘l sarfi: mpg, mpguk, lper100km',
};

/** Families whose unit is a cubic or square of a length, so the list is derived, not restated. */
function derivedUnits(family: Family): string[] {
  if (family === 'volume') {
    return ['m3', 'cm3', 'km3', 'in3', 'ft3', 'yd3'];
  }
  if (family === 'area') {
    return ['m2', 'km2', 'cm2', 'mm2', 'in2', 'ft2', 'yd2', 'mi2'];
  }
  return [];
}

export default defineTool({
  name: 'pro_units_parse',
  description:
    'Miqdorni tahlil qilish: "12.5 km" -> 12.5 va km, birlik oilasi va boshqa birliklarga o‘lchov. ' +
    'Prefixlar avtomatik aniqlanadi (da, h, µ ham). Noto‘g‘ri birlik bo‘lsa, yaqinlari taklif qilinadi.',
  category: 'units',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: { type: 'string', description: 'Miqdor: "12.5 km", "3 mi", "20 degC"' },
      text: { type: 'string', description: 'Bir nechta miqdor: "1 kg, 2 lb, 3 oz"' },
    },
    anyOf: [{ required: ['quantity'] }, { required: ['text'] }],
  },
  async handler(input) {
    const p = view(input);
    const text = strOrEmpty(p, 'text');
    const raw = strOrEmpty(p, 'quantity') || text;

    if (!raw) return jsonBlock('Miqdor', { error: 'quantity yoki text kerak.' });

    // A comma-separated list is the common case for a shopping list or a recipe, and it is cheaper to
    // parse than to make the caller loop.
    const parts = text
      ? text
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [raw];

    const parsed: Array<Record<string, unknown>> = [];
    for (const part of parts) {
      let quantity;
      try {
        quantity = parseQuantity(part);
      } catch (error) {
        return jsonBlock('Miqdor', { error: (error as Error).message, input: part });
      }
      const symbol = quantity.unit;
      const unit = symbol ? findUnit(symbol) : undefined;
      parsed.push({
        input: part,
        value: quantity.value,
        unit: symbol || '(birliksiz)',
        recognised: Boolean(unit),
        family: unit?.family,
        // A bare number is legal - "3" is a quantity - so this is reported, not rejected.
        note: unit ? undefined : symbol ? 'birlikni tanimadim' : 'birlik kiritilmagan',
      });
    }

    const known = parsed.find((entry) => entry.recognised === true);
    const family = known?.family as Family | undefined;
    const extra = family
      ? unitsInFamily(family)
          .map((unit) => `${unit.symbol}`)
          .concat(derivedUnits(family))
      : undefined;

    return jsonBlock(parts.length === 1 ? `Miqdor: ${raw}` : `${parts.length} ta miqdor`, {
      quantities: parsed,
      // The per-family reference is included once, not repeated for every parsed line.
      reference: family
        ? {
            family,
            usage: USAGE[family] ?? family,
            // Included because `m2`, `km3` and `ft3` are derived from a length and are not in the unit
            // table; a caller reading only `units` would conclude they do not exist.
            derived: derivedUnits(family),
          }
        : { usage: Object.values(USAGE) },
    });
  },
});
