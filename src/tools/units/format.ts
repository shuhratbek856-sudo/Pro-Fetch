import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { convert, displayUnitsInFamily, findUnit, formatNumber, parseQuantity, unitsInFamily } from './_units.js';

const ROMAN: Record<string, number> = {
  M: 1000,
  CM: 900,
  D: 500,
  CD: 400,
  C: 100,
  XC: 90,
  L: 50,
  XL: 40,
  X: 10,
  IX: 9,
  V: 5,
  IV: 4,
  I: 1,
};

function toRoman(value: number): string | undefined {
  if (!Number.isInteger(value) || value <= 0 || value > 3999) return undefined;
  let remaining = value;
  let out = '';
  for (const [token, amount] of Object.entries(ROMAN)) {
    while (remaining >= amount) {
      out += token;
      remaining -= amount;
    }
  }
  return out;
}

export default defineTool({
  name: 'pro_units_format',
  description:
    'Miqdorni inson o‘qiydigan shaklda yozish: "1.5e-6" emas, "1.5 µm"; 1 KB va 1 KiB farqi; ' +
    'davomiylikni kun-soat-daqiqa-songacha bo‘lish; butun sonlarni rim raqamida. Noto‘g‘ri birlik ' +
    'bo‘lsa xato qaytariladi - jim qolmaydi.',
  category: 'units',
  inputSchema: {
    type: 'object',
    properties: {
      quantity: { type: 'string', description: 'Miqdor: "0.0000015 m"' },
      as_prefix: { type: 'string', description: 'Shu oila ichida eng mos prefiksli birlikka o‘tkazish: "length"' },
      roman: { type: 'boolean', description: 'Butun sonni rim raqamiga o‘tkazish' },
      duration: { type: 'string', description: 'Sekundlarni "1 kun 3 soat 4 daqiqa" ko‘rinishida yozish' },
    },
    anyOf: [{ required: ['quantity'] }, { required: ['roman'] }, { required: ['duration'] }],
  },
  async handler(input) {
    const p = view(input);
    // A number rather than a boolean flag: `roman: 1987` says what to convert, where `roman: true`
    // still needs a second property and gives the caller two ways to spell the same request.
    const romanValue = Number(p.roman ?? Number.NaN);
    const duration = strOrEmpty(p, 'duration');
    const quantity = strOrEmpty(p, 'quantity');
    const asPrefix = strOrEmpty(p, 'as_prefix');

    if (duration) {
      const seconds = parseQuantity(duration);
      if (seconds.unit && !/^(s|sec|secs|second|seconds|ms|millisecond|milliseconds)$/i.test(seconds.unit)) {
        const unit = findUnit(seconds.unit);
        if (unit && unit.family === 'time') {
          const toSeconds = convert(seconds.value, seconds.unit, 's');
          if (!('error' in toSeconds)) return formatDuration(Math.round(toSeconds.value));
        }
        return jsonBlock('Davr', {
          error: `birlikni tushunmadim: "${seconds.unit}"`,
          expected: 'sekund yoki vaqt birligi (s, min, h, d)',
        });
      }
      return formatDuration(Math.round(seconds.value));
    }

    if (Number.isFinite(romanValue)) {
      const value = romanValue;
      const roman = toRoman(value);
      if (!roman) {
        return jsonBlock('Rim raqam', {
          error: `rim raqamiga faqat 1..3999 oralig‘idagi butun sonlar o‘tadi (kirildi: ${value})`,
        });
      }
      return jsonBlock('Rim raqam', { value, roman });
    }

    if (!quantity) return jsonBlock('Miqdor', { error: 'quantity, roman yoki duration kerak.' });

    let parsed;
    try {
      parsed = parseQuantity(quantity);
    } catch (error) {
      return jsonBlock('Miqdor', { error: (error as Error).message });
    }
    const unit = findUnit(parsed.unit);
    if (!unit) {
      // Not silently passed through: an unrecognised unit formatted as if it were understood is how
      // "5 furlongs" ends up displayed as "5 fm".
      return jsonBlock('Miqdor', {
        input: quantity,
        error: `birlikni tushunmadim: "${parsed.unit}"`,
        value: parsed.value,
      });
    }

    if (asPrefix) {
      const candidates = displayUnitsInFamily(asPrefix as never);
      if (candidates.length === 0) return jsonBlock('Miqdor', { error: `"${asPrefix}" oilasi mavjud emas.` });
      // The point of a prefixed unit is to keep the number readable, so the winner is the *smallest*
      // unit that leaves it at or above 1. The first version compared each candidate against the
      // original value instead of against the current winner, which meant 0.0000015 m stayed as
      // 0.0000015 m - the candidate 1.5 µm is larger than the input, so the test rejected it.
      let best = { unit, value: parsed.value };
      for (const candidate of candidates) {
        const converted = convert(parsed.value, unit.symbol, candidate.symbol);
        if ('error' in converted) continue;
        const magnitude = Math.abs(converted.value);
        const bestMagnitude = Math.abs(best.value);
        const better = magnitude >= 1 && (bestMagnitude < 1 || magnitude < bestMagnitude);
        if (better) best = { unit: candidate, value: converted.value };
      }
      return jsonBlock(`${quantity} =`, {
        input: quantity,
        result: `${formatNumber(best.value)} ${best.unit.symbol}`,
        value: best.value,
        unit: best.unit.symbol,
        family: best.unit.family,
      });
    }

    return jsonBlock(`${quantity} ni ko‘rsatish`, {
      input: quantity,
      value: parsed.value,
      unit: unit.symbol,
      family: unit.family,
      plain: formatNumber(parsed.value),
      // The same number in the base unit, which is the form a machine-readable consumer wants.
      base: (() => {
        const base = convert(parsed.value, unit.symbol, baseSymbol(unit.symbol));
        return 'error' in base ? undefined : base.value;
      })(),
    });
  },
});

/** The family's own base unit, which is the first entry declared for it. */
function baseSymbol(symbol: string): string {
  const familyUnit = unitsInFamily(familyOf(symbol));
  return familyUnit?.[0]?.symbol ?? symbol;
}

function familyOf(symbol: string) {
  return (findUnit(symbol)?.family ?? 'length') as never;
}

function formatDuration(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : '';
  let remaining = Math.abs(totalSeconds);
  const weeks = Math.floor(remaining / 604800);
  remaining -= weeks * 604800;
  const days = Math.floor(remaining / 86400);
  remaining -= days * 86400;
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;

  const parts: string[] = [];
  if (weeks) parts.push(`${weeks} hafta`);
  if (days) parts.push(`${days} kun`);
  if (hours) parts.push(`${hours} soat`);
  if (minutes) parts.push(`${minutes} daqiqa`);
  if (seconds || parts.length === 0) parts.push(`${seconds} soniya`);

  return jsonBlock('Davr', {
    seconds: totalSeconds,
    text: `${sign}${parts.join(' ')}`,
    parts: { weeks, days, hours, minutes, seconds },
  });
}
