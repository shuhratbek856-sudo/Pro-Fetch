// Unit conversion, checked against values that are defined rather than approximated.
//
// Every expected number here is either a definition (1 inch = 0.0254 m exactly, Fahrenheit's
// defining points) or a published constant. A test that asserted 1 km = 1000 m would pass against a
// converter that multiplied by one hundred.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { convert, findUnit, parseQuantity, UNITS } from '../src/tools/units/_units.js';
import type { ToolResult } from '../src/core/types.js';

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

function converted(value: number, from: string, to: string): number {
  const result = convert(value, from, to);
  if ('error' in result) throw new Error(result.error);
  return result.value;
}

describe('length', () => {
  it('uses the exact international definitions', () => {
    // Both are exact by treaty, not measurements.
    expect(converted(1, 'in', 'm')).toBe(0.0254);
    expect(converted(1, 'ft', 'm')).toBe(0.3048);
    expect(converted(1, 'yd', 'm')).toBe(0.9144);
    expect(converted(1, 'mi', 'm')).toBe(1609.344);
    expect(converted(1, 'nmi', 'm')).toBe(1852);
  });

  it('applies SI prefixes by exponent', () => {
    expect(converted(1, 'km', 'm')).toBe(1000);
    expect(converted(1, 'cm', 'm')).toBe(0.01);
    expect(converted(1, 'mm', 'm')).toBe(0.001);
    expect(converted(1, 'um', 'm')).toBe(1e-6);
    // The micro sign and the Greek mu are the same prefix written two ways.
    expect(converted(1, 'µm', 'm')).toBe(converted(1, 'μm', 'm'));
    // `da` (deca) and `h` (hecto) are real SI prefixes that a hand-written alias list leaves out.
    expect(converted(1, 'dam', 'm')).toBe(10);
    expect(converted(1, 'hm', 'm')).toBe(100);
  });

  it('reads a spelled-out name', () => {
    expect(converted(1, 'kilometer', 'm')).toBe(1000);
    expect(converted(1, 'miles', 'm')).toBe(1609.344);
    expect(converted(1, 'feet', 'm')).toBe(0.3048);
  });

  it('round-trips', () => {
    expect(converted(converted(42.5, 'km', 'mi'), 'mi', 'km')).toBeCloseTo(42.5, 9);
  });
});

describe('mass', () => {
  it('uses the international definition of the pound', () => {
    expect(converted(1, 'lb', 'g')).toBeCloseTo(453.59237, 6);
    expect(converted(1, 'oz', 'g')).toBeCloseTo(28.349523125, 9);
    expect(converted(1, 'st', 'lb')).toBe(14);
  });

  it('does not confuse the tonne with the short ton', () => {
    expect(converted(1, 't', 'kg')).toBe(1000);
    expect(converted(1, 'lb', 'oz')).toBe(16);
  });
});

describe('temperature is affine, not a factor', () => {
  it('converts the defining points exactly', () => {
    // Water freezing and boiling are the Fahrenheit scale's definition: 32 and 212.
    // Tolerance, not equality: 100 * 5/9 + 17.777... is 211.99999999999997 in binary floating point.
    // Demanding exactly 212 would be asserting that the arithmetic has no representation error.
    expect(converted(0, 'degC', 'degF')).toBeCloseTo(32, 12);
    expect(converted(100, 'degC', 'degF')).toBeCloseTo(212, 12);
  });

  it('gets the crossing point right', () => {
    // -40 is the one temperature that is the same number on both scales.
    expect(converted(-40, 'degC', 'degF')).toBeCloseTo(-40, 12);
  });

  it('places absolute zero correctly on every scale', () => {
    expect(converted(-273.15, 'degC', 'K')).toBeCloseTo(0, 9);
    expect(converted(-273.15, 'degC', 'degF')).toBeCloseTo(-459.67, 2);
    expect(converted(0, 'K', 'degC')).toBeCloseTo(-273.15, 9);
  });

  it('would be wrong under a single-factor conversion, which is the point', () => {
    // A table with only a factor column gives 20 * 9/5 = 36. The answer is 68.
    expect(converted(20, 'degC', 'degF')).toBe(68);
  });
});

describe('data sizes distinguish binary from decimal', () => {
  it('treats KB as 1000 and KiB as 1024', () => {
    // The distinction is the whole reason KiB exists, and a converter that merges them is wrong by
    // 2.4% on every megabyte.
    expect(converted(1, 'kB', 'B')).toBe(1000);
    expect(converted(1, 'KiB', 'B')).toBe(1024);
    expect(converted(1, 'MB', 'KiB')).toBeCloseTo(1000 / 1.024, 6);
    expect(converted(1, 'GiB', 'MiB')).toBe(1024);
  });

  it('knows a bit is not a byte', () => {
    expect(converted(8, 'bit', 'byte')).toBe(1);
  });
});

describe('cross-family conversion is refused', () => {
  it('says the families differ instead of returning a number', () => {
    // Kilometres to kilograms has no answer, and a tool that produces one is worse than one that
    // refuses.
    const result = convert(1, 'km', 'kg');
    expect('error' in result).toBe(true);
    expect('error' in result ? result.error : '').toContain('boshqa oilalar');
  });

  it('reports an unknown unit', () => {
    const result = convert(1, 'furlong', 'm');
    expect('error' in result).toBe(true);
  });
});

describe('parseQuantity', () => {
  it('splits a number from its unit', () => {
    expect(parseQuantity('12.5 km')).toEqual({ value: 12.5, unit: 'km' });
    expect(parseQuantity('-3 mi')).toEqual({ value: -3, unit: 'mi' });
    expect(parseQuantity('1,234.5 kg')).toEqual({ value: 1234.5, unit: 'kg' });
    expect(parseQuantity('2e3 m')).toEqual({ value: 2000, unit: 'm' });
  });

  it('accepts a bare number and says the unit was absent', () => {
    expect(parseQuantity('42')).toEqual({ value: 42, unit: '' });
  });

  it('refuses what it cannot read rather than guessing zero', () => {
    expect(() => parseQuantity('abc')).toThrow();
  });
});

describe('the unit table itself', () => {
  it('has no duplicate symbols', () => {
    const keys = new Set<string>();
    const duplicates: string[] = [];
    for (const unit of UNITS) {
      const key = unit.symbol.toLowerCase();
      if (keys.has(key)) duplicates.push(key);
      keys.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it('never declares a zero factor', () => {
    // A zero factor would turn every conversion involving that unit into 0 or Infinity without an error.
    expect(UNITS.filter((unit) => unit.factor === 0)).toEqual([]);
  });

  it('resolves a prefixed unit to a shifted symbol', () => {
    expect(findUnit('km')?.symbol).toBe('km');
    expect(findUnit('cm')?.symbol).toBe('cm');
    // `kms` is not a unit in any system, and resolving it would mean guessing.
    expect(findUnit('kms')).toBeUndefined();
  });
});

describe('pro_units_convert', () => {
  it('converts from separate arguments', async () => {
    const data = payload(await callTool('pro_units_convert', { value: 100, from: 'km', to: 'mi' }));
    expect(data.value).toBeCloseTo(62.1371, 4);
    expect(data.family).toBe('length');
  });

  it('converts from a single quantity string', async () => {
    const data = payload(await callTool('pro_units_convert', { quantity: '2.5 lb', to: 'g' }));
    expect(data.value).toBeCloseTo(1133.980925, 4);
  });

  it('refuses a cross-family conversion with a message naming both families', async () => {
    const data = payload(await callTool('pro_units_convert', { value: 1, from: 'km', to: 'kg' }));
    expect(data.error).toContain('boshqa oilalar');
  });

  it('tolerates a typo that the prefix rules can absorb', async () => {
    // `kmetre` is not in the alias table, but the prefix rule reads it as k + metre. That is a
    // desirable accident, and the reason the test is here is to pin it down rather than let it drift.
    const data = payload(await callTool('pro_units_convert', { value: 1, from: 'kmetre', to: 'm' }));
    expect(data.value).toBe(1000);
  });

  it('offers near matches for a unit it cannot resolve at all', async () => {
    const data = payload(await callTool('pro_units_convert', { value: 1, from: 'kilozap', to: 'm' }));
    expect(data.suggestion).toEqual(expect.any(Array));
  });

  it('lists every unit in a family at once', async () => {
    const data = payload(await callTool('pro_units_convert', { value: 1, from: 'km', to: 'm', all: true }));
    expect(data.units).toBeGreaterThan(3);
    expect((data.results as unknown as string[]).join(' ')).toContain('km');
  });
});

describe('pro_units_temperature', () => {
  it('shows every scale at once by default', async () => {
    const data = payload(await callTool('pro_units_temperature', { value: 20 }));
    const rows = data.results as unknown as Array<{ unit: string; value: number }>;
    const fahrenheit = rows.find((row) => row.unit === 'degF');
    expect(fahrenheit?.value).toBe(68);
  });

  it('refuses a non-temperature unit instead of converting it', async () => {
    const data = payload(await callTool('pro_units_temperature', { value: 20, from: 'km' }));
    expect(data.error).toContain('harorat birligi emas');
  });

  it('reports the defining points it computed rather than assumed', async () => {
    const data = payload(await callTool('pro_units_temperature', { points: true }));
    const points = data.points as unknown as Array<Record<string, number | string>>;
    const freezing = points.find((point) => String(point.name).includes('muzlash'));
    expect(freezing?.degF).toBe(32);
    expect(freezing?.degC).toBe(0);
  });
});

describe('pro_units_list', () => {
  it('counts families and units', async () => {
    const data = payload(await callTool('pro_units_list', {}));
    expect(data.families).toBe(15);
    expect(data.total).toBeGreaterThan(80);
  });

  it('can be narrowed to one family', async () => {
    const data = payload(await callTool('pro_units_list', { family: 'temperature' }));
    expect(Object.keys(data.units as object)).toEqual(['temperature']);
  });

  it('lists the SI prefixes, including the two that are usually missed', async () => {
    const data = payload(await callTool('pro_units_list', { prefixes: true }));
    expect(data.decimal).toContain('da');
    expect(data.decimal).toContain('h');
  });

  it('names a family it does not know', async () => {
    const data = payload(await callTool('pro_units_list', { family: 'luminosity' }));
    expect(data.error).toContain('yo‘q');
  });
});

describe('pro_units_parse', () => {
  it('parses one quantity and names its family', async () => {
    const data = payload(await callTool('pro_units_parse', { quantity: '12.5 km' }));
    const rows = data.quantities as unknown as Array<Record<string, unknown>>;
    expect(rows[0].value).toBe(12.5);
    expect(rows[0].unit).toBe('km');
    expect(rows[0].family).toBe('length');
  });

  it('parses a list and keeps each line', async () => {
    const data = payload(await callTool('pro_units_parse', { text: '1 kg, 2 lb, 3 oz' }));
    expect((data.quantities as unknown[]).length).toBe(3);
  });

  it('says a bare number has no unit rather than inventing one', async () => {
    const data = payload(await callTool('pro_units_parse', { quantity: '42' }));
    const rows = data.quantities as unknown as Array<Record<string, unknown>>;
    expect(rows[0].unit).toBe('(birliksiz)');
    expect(rows[0].recognised).toBe(false);
  });

  it('reports an unknown unit instead of accepting it', async () => {
    const data = payload(await callTool('pro_units_parse', { quantity: '5 furlong' }));
    const rows = data.quantities as unknown as Array<Record<string, unknown>>;
    expect(rows[0].recognised).toBe(false);
    expect(rows[0].note).toContain('tanimadim');
  });

  it('resolves cubic and square units as the families they belong to', async () => {
    // These were missing from the table entirely, which meant `pro_units_convert` could not convert a
    // volume in cubic metres at all. m3 is the family base and cm3 is its prefix.
    const cubic = payload(await callTool('pro_units_parse', { quantity: '1 cm3' }));
    expect((cubic.quantities as unknown as Array<Record<string, unknown>>)[0].family).toBe('volume');
    const square = payload(await callTool('pro_units_parse', { quantity: '2 km2' }));
    expect((square.quantities as unknown as Array<Record<string, unknown>>)[0].family).toBe('area');
  });
});

describe('pro_units_format', () => {
  it('refuses to format an unknown unit', async () => {
    const data = payload(await callTool('pro_units_format', { quantity: '5 furlong' }));
    expect(data.error).toContain('tushunmadim');
  });

  it('writes a duration in words', async () => {
    const data = payload(await callTool('pro_units_format', { duration: '93784' }));
    expect(data.text).toContain('kun');
    expect(data.parts).toMatchObject({ days: 1, hours: 2 });
  });

  it('converts a duration given in another unit', async () => {
    const data = payload(await callTool('pro_units_format', { duration: '90 min' }));
    expect(data.seconds).toBe(5400);
  });

  it('converts an integer to Roman numerals and refuses a non-integer', async () => {
    expect(payload(await callTool('pro_units_format', { roman: 1987 })).roman as unknown as string).toBe('MCMLXXXVII');
    expect(payload(await callTool('pro_units_format', { roman: 4.5 })).error).toBeDefined();
    expect(payload(await callTool('pro_units_format', { roman: 0 })).error).toBeDefined();
  });

  it('picks a prefixed unit that keeps the number readable', async () => {
    const data = payload(await callTool('pro_units_format', { quantity: '0.0000015 m', as_prefix: 'length' }));
    expect(data.result).toBe('1.5 µm');
  });
});
