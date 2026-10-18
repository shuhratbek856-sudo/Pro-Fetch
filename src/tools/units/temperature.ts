import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { float, strOrEmpty, view } from '../../core/input.js';
import { convert, findUnit, formatNumber } from './_units.js';

const TEMPERATURE_UNITS = ['degC', 'degF', 'K', 'degR'] as const;

const NAMES: Record<string, string> = {
  degC: 'Selsiy',
  degF: 'Fahrenheit',
  K: 'Kelvin',
  degR: 'Rankine',
};

/**
 * Named points, so "bo‘lish uchun qancha" has an answer without arithmetic.
 *
 * The Celsius values are exact by definition of the scale. Fahrenheit is the only common scale whose
 * defining points are not round numbers - water freezes at 32 and boils at 212 - and they come out of
 * the conversion, so 32 and 212 are what the tool reports rather than what it assumed.
 */
const POINTS: Array<{ celsius: number; name: string }> = [
  { celsius: -273.15, name: 'mutlaq nol' },
  { celsius: -40, name: '-40 (C va F bir xil)' },
  { celsius: 0, name: 'suvning muzlash nuqtasi' },
  { celsius: 37, name: 'odam tana harorati' },
  { celsius: 100, name: 'suvning qaynash nuqtasi (1 atm)' },
  { celsius: 180, name: 'pishirish uchun Fahrenheit' },
  { celsius: 200, name: 'pishirish uchun Celsius' },
];

function at(value: number, unit: string): number | null {
  const result = convert(value, 'degC', unit);
  return 'error' in result ? null : result.value;
}

export default defineTool({
  name: 'pro_units_temperature',
  description:
    'Harorat o‘lchovi: Selsiy, Fahrenheit, Kelvin, Rankine. Qo‘shimcha "muzlash nuqtasi", "qaynash ' +
    'nuqtasi" kabi nomlangan nuqtalar chiqadi. Harorat chiziqli emas — 20 degC 68 degF bo‘ladi, 20 emas.',
  category: 'units',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'number', description: 'Qiymat' },
      from: { type: 'string', description: 'Manzil birlik: degC, degF, K, degR (standart degC)' },
      to: { type: 'string', description: 'Nishon birlik (standart: hammasi)' },
      points: { type: 'boolean', description: 'Faqat nomlangan nuqtalar ro‘yxatini chiqarish' },
    },
  },
  async handler(input) {
    const p = view(input);

    if (p.points === true || String(p.points ?? '') === 'true') {
      return jsonBlock('Harorat nuqtalari', {
        points: POINTS.map((point) => ({
          name: point.name,
          degC: point.celsius,
          degF: at(point.celsius, 'degF'),
          K: at(point.celsius, 'K'),
        })),
      });
    }

    const value = float(p, 'value', Number.NaN);
    if (!Number.isFinite(value)) return jsonBlock('Harorat', { error: 'qiymat kerak.' });

    const from = strOrEmpty(p, 'from') || 'degC';
    const fromUnit = findUnit(from);
    if (!fromUnit || fromUnit.family !== 'temperature') {
      return jsonBlock('Harorat', {
        error: `"${from}" harorat birligi emas`,
        available: TEMPERATURE_UNITS,
      });
    }
    const to = strOrEmpty(p, 'to');
    const targets = to ? [to] : [...TEMPERATURE_UNITS];

    const results: Array<Record<string, unknown>> = [];
    for (const target of targets) {
      const converted = convert(value, from, target);
      if ('error' in converted) {
        results.push({ unit: target, error: converted.error });
        continue;
      }
      results.push({
        unit: target,
        name: NAMES[target] ?? target,
        value: converted.value,
        text: `${formatNumber(converted.value)} ${target}`,
      });
    }

    return jsonBlock(`${formatNumber(value)} ${from}`, {
      from: `${from} (${NAMES[from] ?? from})`,
      results,
      note:
        // Worth saying once, because it is the mistake every single-factor converter makes.
        from !== 'degC'
          ? undefined
          : 'Harorat chiziqli emas: har bir birlik o‘z qo‘shimchasiga ega, shuning uchun koefitsient emas ' +
            'o‘zgarish (offset + koeffitsient) qo‘llaniladi.',
    });
  },
});
