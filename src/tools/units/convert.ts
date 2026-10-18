import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { float, num, strOrEmpty, view } from '../../core/input.js';
import {
  allFamilies,
  convert,
  displayUnitsInFamily,
  findUnit,
  formatNumber,
  parseQuantity,
  PREFIXES,
  unitsInFamily,
  UNITS,
} from './_units.js';

/** Close names, for a message that would otherwise just say "I do not know that unit". */
function suggest(name: string): string[] {
  const key = name.trim().toLowerCase();
  if (!key) return [];
  const near = UNITS.filter(
    (unit) =>
      unit.symbol.toLowerCase().includes(key) ||
      (unit.aliases ?? []).some((alias) => alias.includes(key)) ||
      key.includes(unit.symbol.toLowerCase()),
  ).map((unit) => unit.symbol);
  const prefixed = Object.keys(PREFIXES)
    .map((prefix) => `${prefix}m`)
    .filter((candidate) => candidate.startsWith(key) || key.startsWith(candidate));
  return [...new Set([...near, ...prefixed])].slice(0, 8);
}

export default defineTool({
  name: 'pro_units_convert',
  description:
    'Birliklarni o‘lchash: uzunlik, massa, hajm, maydon, tezlik, bosim, energiya, quvvat, vaqt, ' +
    'ma’lumot hajmi, chastota, kuch, burchak, yo‘l sarfi. Avto-prefikslar: km, cm, mm, µg, MB, KiB. ' +
    'Harorat chiziqli emas - u alohida hisoblanadi, shuning uchun 20 degC 68 degF bo‘ladi, 20 emas.',
  category: 'units',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'Qiymat (berilmasa "quantity" satridan o‘qiladi)' },
      from: { type: 'string', description: 'Manzil birlik: "km", "mi", "lb", "degC", "mph"' },
      to: { type: 'string', description: 'Nishon birlik' },
      quantity: { type: 'string', description: 'Hammasi bitta satrda: "12.5 km"' },
      all: { type: 'boolean', description: 'Berilgan oilaning barcha birliklariga bir vaqtda o‘lchash' },
      precision: { type: 'number', description: 'Ko‘rsatiladigan ahamiyatli raqamlar (standart 10)' },
    },
    required: ['to'],
  },
  async handler(input) {
    const p = view(input);
    const toName = strOrEmpty(p, 'to');
    const quantity = strOrEmpty(p, 'quantity');
    const convertAll = p.all === true || String(p.all ?? '') === 'true';
    const precision = Math.max(1, Math.min(num(p, 'precision', 10) || 10, 17));

    let value: number;
    let fromName: string;
    if (quantity) {
      let parsed;
      try {
        parsed = parseQuantity(quantity);
      } catch (error) {
        return jsonBlock('Birlik', { error: (error as Error).message });
      }
      value = parsed.value;
      fromName = parsed.unit;
    } else {
      value = float(p, 'value', Number.NaN);
      fromName = strOrEmpty(p, 'from');
    }
    if (!Number.isFinite(value)) {
      return jsonBlock('Birlik', { error: 'qiymat kerak, yoki "quantity" satri: "12.5 km".' });
    }
    if (!fromName) {
      return jsonBlock('Birlik', { error: 'from birlik kerak (yoki "quantity" satri).' });
    }

    const from = findUnit(fromName);
    if (!from) {
      return jsonBlock('Birlik', { error: `birlikni tushunmadim: "${fromName}"`, suggestion: suggest(fromName) });
    }
    const to = findUnit(toName);
    if (!to) {
      return jsonBlock('Birlik', { error: `birlikni tushunmadim: "${toName}"`, suggestion: suggest(toName) });
    }
    if (from.family !== to.family) {
      return jsonBlock('Birlik', {
        error: `boshqa oilalar: "${fromName}" (${from.family}) va "${toName}" (${to.family})`,
        hint: 'faqat bir oila ichida o‘lchash mumkin.',
        families: allFamilies(),
      });
    }

    if (convertAll) {
      const rows: Array<{ unit: string; value: number }> = [];
      for (const unit of displayUnitsInFamily(from.family)) {
        const converted = convert(value, fromName, unit.symbol);
        // Same family was checked above, so this cannot fail; the guard keeps the type honest rather
        // than asserting with a cast.
        if ('error' in converted) continue;
        rows.push({ unit: unit.symbol, value: converted.value });
      }
      return jsonBlock(`${from.symbol} bo‘yicha barcha ${from.family} birliklari`, {
        input: `${formatNumber(value)} ${from.symbol}`,
        family: from.family,
        units: rows.length,
        results: rows.map((row) => `${formatNumber(row.value)} ${row.unit}`),
      });
    }

    const result = convert(value, fromName, toName);
    if ('error' in result) return jsonBlock('Birlik', { error: result.error });

    return jsonBlock(`${formatNumber(value, precision)} ${result.from.symbol} o‘lchovi`, {
      input: `${formatNumber(value, precision)} ${result.from.symbol}`,
      result: `${formatNumber(result.value, precision)} ${result.to.symbol}`,
      value: result.value,
      family: result.from.family,
      // Printed so a caller can see the arithmetic rather than trust it.
      factor: result.from.factor / result.to.factor,
    });
  },
});
