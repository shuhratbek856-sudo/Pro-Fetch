/**
 * Unit conversion, with the arithmetic kept in this file rather than in each tool.
 *
 * Two decisions shape everything below.
 *
 * **Conversion is a graph, not a table.** A unit has exactly one base unit and one factor; a conversion
 * is a path between two nodes. That is what lets `pro_units_convert` treat `km/h` and `mph` and
 * `knots` as ordinary members of one speed family instead of maintaining a quadratic table of pairs
 * that would be wrong the first time somebody asked for something it lacked.
 *
 * **Temperature is not a factor.** Celsius to Fahrenheit is not a multiplication, so the family is
 * declared affine - an offset plus a factor - and handled separately. A single conversion table with a
 * `factor` column silently produces -17 C as -17 F, which is the kind of wrong answer nobody notices.
 *
 * Prefixes are powers of ten, not a list. `parseQuantity` accepts `km`, `kilometer`, `kilometre`,
 * `kilometers`, `metres`, `m` and `µm`, and every one of them resolves through the same exponent. A
 * curated alias list is how a converter ends up not knowing `dam` or `daN`.
 */

// SI base units per family. Angles, information and a few others are exact rather than physical.
export type Family =
  | 'length'
  | 'mass'
  | 'temperature'
  | 'volume'
  | 'area'
  | 'speed'
  | 'pressure'
  | 'energy'
  | 'power'
  | 'time'
  | 'data'
  | 'frequency'
  | 'force'
  | 'angle'
  | 'fuel';

export interface Unit {
  /** Canonical symbol, used as the lookup key. */
  symbol: string;
  family: Family;
  /** How many base units one of this unit is. Unused for an affine family. */
  factor: number;
  /** Prefix is allowed for this unit. `g` is a base unit but `mg` is mass; `m` takes prefixes but `min` is not a prefixable metre. */
  prefixable: boolean;
  /** Affine families only: value_in_base = value * factor + offset. */
  offset?: number;
  aliases?: string[];
}

const LENGTH_BASE = 1; // metre
const MASS_BASE = 1; // kilogram

export const UNITS: Unit[] = [
  // ---- length, base metre -------------------------------------------------------------------
  {
    symbol: 'm',
    family: 'length',
    factor: LENGTH_BASE,
    prefixable: true,
    aliases: ['meter', 'meters', 'metre', 'metres'],
  },
  { symbol: 'in', family: 'length', factor: 0.0254, prefixable: false, aliases: ['inch', 'inches'] },
  { symbol: 'ft', family: 'length', factor: 0.3048, prefixable: true, aliases: ['foot', 'feet'] },
  { symbol: 'yd', family: 'length', factor: 0.9144, prefixable: true, aliases: ['yard', 'yards'] },
  { symbol: 'mi', family: 'length', factor: 1609.344, prefixable: true, aliases: ['mile', 'miles'] },
  { symbol: 'nmi', family: 'length', factor: 1852, prefixable: false, aliases: ['nauticalmile', 'nauticalmiles'] },
  { symbol: 'fathom', family: 'length', factor: 1.8288, prefixable: false },
  { symbol: 'au', family: 'length', factor: 1.495978707e11, prefixable: false, aliases: ['astronomicalunit'] },
  {
    symbol: 'ly',
    family: 'length',
    factor: 9.4607304725808e15,
    prefixable: false,
    aliases: ['lightyear', 'lightyears'],
  },
  { symbol: 'pc', family: 'length', factor: 3.0856775814913673e16, prefixable: false, aliases: ['parsec', 'parsecs'] },

  // ---- mass, base kilogram -------------------------------------------------------------------
  { symbol: 'g', family: 'mass', factor: 0.001, prefixable: true, aliases: ['gram', 'grams', 'gramme', 'grammes'] },
  {
    symbol: 't',
    family: 'mass',
    factor: 1000,
    prefixable: true,
    aliases: ['tonne', 'tonnes', 'metricton', 'metrictonne'],
  },
  { symbol: 'lb', family: 'mass', factor: 0.45359237, prefixable: true, aliases: ['pound', 'pounds', 'lbs'] },
  { symbol: 'oz', family: 'mass', factor: 0.028349523125, prefixable: true, aliases: ['ounce', 'ounces'] },
  { symbol: 'st', family: 'mass', factor: 6.35029318, prefixable: false, aliases: ['stone', 'stones'] },
  { symbol: 'gr', family: 'mass', factor: 6.479891e-5, prefixable: false, aliases: ['grain', 'grains'] },
  { symbol: 'ct', family: 'mass', factor: 0.2, prefixable: false, aliases: ['carat', 'carats'] },
  { symbol: 'u', family: 'mass', factor: 1.6605390666e-27, prefixable: false, aliases: ['dalton'] },

  // ---- temperature, affine --------------------------------------------------------------------
  //
  // The offset is expressed in the family's base unit - Celsius - so it is *not* the number that
  // appears on the Fahrenheit scale. The first version stored 255.372, the size of the 459.67 degree
  // gap, which put 0 degC at -459.67 degF and 100 degC at -279.67. The correct value is -32 * (5/9):
  // base_C = F * (5/9) - 17.78, which places 32 at 0 and 212 at 100.
  {
    symbol: 'degC',
    family: 'temperature',
    factor: 1,
    offset: 0,
    prefixable: false,
    aliases: ['c', 'celsius', 'centigrade', 'degc', '°c'],
  },
  {
    symbol: 'degF',
    family: 'temperature',
    factor: 5 / 9,
    offset: (-32 * 5) / 9,
    prefixable: false,
    aliases: ['f', 'fahrenheit', 'degf', '°f'],
  },
  { symbol: 'K', family: 'temperature', factor: 1, offset: -273.15, prefixable: true, aliases: ['kelvin'] },
  // Rankine has no zero point of its own, so 0 degR is -273.15 C: base_C = R * (5/9) - 151.75.
  {
    symbol: 'degR',
    family: 'temperature',
    factor: 5 / 9,
    offset: (-273.15 * 5) / 9,
    prefixable: false,
    aliases: ['rankine', 'r'],
  },

  // ---- volume, base cubic metre ----------------------------------------------------------------
  //
  // The cubic metre is the base unit of this family and the litre is a prefixed alias for a thousandth
  // of it. Deriving the prefix instead of declaring a second base keeps `1 L` and `1000 cm3` in
  // agreement, which a table with both as bases does not guarantee.
  { symbol: 'm3', family: 'volume', factor: 1, prefixable: true, aliases: ['cubicmeter', 'cubicmetre'] },
  { symbol: 'cm3', family: 'volume', factor: 1e-6, prefixable: false, aliases: ['cubiccentimeter', 'cubiccentimetre'] },
  {
    symbol: 'L',
    family: 'volume',
    factor: 0.001,
    prefixable: true,
    aliases: ['l', 'liter', 'liters', 'litre', 'litres'],
  },
  { symbol: 'mL', family: 'volume', factor: 1e-6, prefixable: true, aliases: ['ml', 'milliliter', 'millilitre'] },
  { symbol: 'tsp', family: 'volume', factor: 4.92892159375e-6, prefixable: false, aliases: ['teaspoon', 'teaspoons'] },
  {
    symbol: 'tbsp',
    family: 'volume',
    factor: 1.478676478125e-5,
    prefixable: false,
    aliases: ['tablespoon', 'tablespoons'],
  },
  {
    symbol: 'floz',
    family: 'volume',
    factor: 2.95735295625e-5,
    prefixable: false,
    aliases: ['fluidounce', 'floz_us', 'usfloz'],
  },
  { symbol: 'cup', family: 'volume', factor: 2.365882365e-4, prefixable: false, aliases: ['cups'] },
  { symbol: 'pt', family: 'volume', factor: 4.73176473e-4, prefixable: false, aliases: ['pint', 'pints'] },
  { symbol: 'qt', family: 'volume', factor: 9.46352946e-4, prefixable: false, aliases: ['quart', 'quarts'] },
  { symbol: 'gal', family: 'volume', factor: 3.785411784e-3, prefixable: true, aliases: ['gallon', 'gallons'] },
  { symbol: 'ft3', family: 'volume', factor: 0.028316846592, prefixable: false, aliases: ['cubicfoot', 'cuft'] },
  { symbol: 'in3', family: 'volume', factor: 1.6387064e-5, prefixable: false, aliases: ['cubicinch'] },
  { symbol: 'yd3', family: 'volume', factor: 0.764554857984, prefixable: false, aliases: ['cubicyard'] },
  { symbol: 'bbl', family: 'volume', factor: 0.158987294928, prefixable: false, aliases: ['barrel', 'oilbarrel'] },

  // ---- area, base square metre -------------------------------------------------------------------
  { symbol: 'm2', family: 'area', factor: 1, prefixable: true, aliases: ['squaremeter', 'm^2'] },
  { symbol: 'km2', family: 'area', factor: 1e6, prefixable: false, aliases: ['squarekilometer', 'km^2'] },
  { symbol: 'cm2', family: 'area', factor: 1e-4, prefixable: false, aliases: ['squarecentimeter'] },
  { symbol: 'mm2', family: 'area', factor: 1e-6, prefixable: false, aliases: ['squaremillimeter'] },
  { symbol: 'ha', family: 'area', factor: 10000, prefixable: false, aliases: ['hectare', 'hectares'] },
  { symbol: 'a', family: 'area', factor: 1, prefixable: true, aliases: ['are', 'ares'] },
  { symbol: 'acre', family: 'area', factor: 4046.8564224, prefixable: false, aliases: ['acres'] },
  {
    symbol: 'ft2',
    family: 'area',
    factor: 0.09290304,
    prefixable: false,
    aliases: ['sqft', 'squarefoot', 'squarefeet'],
  },
  { symbol: 'in2', family: 'area', factor: 0.00064516, prefixable: false, aliases: ['sqin'] },
  { symbol: 'mi2', family: 'area', factor: 2589988.110336, prefixable: false, aliases: ['sqmi'] },
  { symbol: 'yd2', family: 'area', factor: 0.83612736, prefixable: false, aliases: ['sqyd'] },

  // ---- speed, base metre per second --------------------------------------------------------------
  // `ms` is deliberately NOT an alias here: it collides with milli + second, and a converter that
  // reads `1 ms` as a speed is worse than one that reads it as a millisecond.
  {
    symbol: 'mps',
    family: 'speed',
    factor: 1,
    prefixable: false,
    aliases: ['m/s', 'meterpersecond', 'metrespersecond'],
  },
  {
    symbol: 'kmh',
    family: 'speed',
    factor: 1 / 3.6,
    prefixable: false,
    aliases: ['kmph', 'kph', 'km/h', 'kilometerperhour'],
  },
  {
    symbol: 'mph',
    family: 'speed',
    factor: 0.44704,
    prefixable: false,
    aliases: ['mi/h', 'mileperhour', 'milesperhour'],
  },
  { symbol: 'fps', family: 'speed', factor: 0.3048, prefixable: false, aliases: ['ft/s', 'feetpersecond'] },
  { symbol: 'kn', family: 'speed', factor: 0.5144444444444445, prefixable: false, aliases: ['knot', 'knots', 'kt'] },
  { symbol: 'c', family: 'speed', factor: 299792458, prefixable: false, aliases: ['lightspeed'] },
  { symbol: 'mach', family: 'speed', factor: 340.29, prefixable: false, aliases: ['machsea'] },

  // ---- pressure, base pascal ------------------------------------------------------------------------
  { symbol: 'Pa', family: 'pressure', factor: 1, prefixable: true, aliases: ['pascal', 'pascals'] },
  { symbol: 'bar', family: 'pressure', factor: 100000, prefixable: true, aliases: ['bars'] },
  { symbol: 'atm', family: 'pressure', factor: 101325, prefixable: false, aliases: ['atmosphere', 'atmospheres'] },
  { symbol: 'psi', family: 'pressure', factor: 6894.757293168, prefixable: false, aliases: ['poundspersquareinch'] },
  { symbol: 'mmHg', family: 'pressure', factor: 133.322387415, prefixable: true, aliases: ['torr'] },
  { symbol: 'ksi', family: 'pressure', factor: 6894757.293168, prefixable: false },

  // ---- energy, base joule ---------------------------------------------------------------------------
  { symbol: 'J', family: 'energy', factor: 1, prefixable: true, aliases: ['joule', 'joules'] },
  { symbol: 'kJ', family: 'energy', factor: 1000, prefixable: false, aliases: ['kilojoule'] },
  { symbol: 'cal', family: 'energy', factor: 4.184, prefixable: true, aliases: ['calorie', 'calories'] },
  { symbol: 'kcal', family: 'energy', factor: 4184, prefixable: false, aliases: ['foodcalorie', 'kilocalorie'] },
  { symbol: 'Wh', family: 'energy', factor: 3600, prefixable: true, aliases: ['watthour', 'watthours'] },
  { symbol: 'kWh', family: 'energy', factor: 3600000, prefixable: false, aliases: ['kilowatthour'] },
  { symbol: 'BTU', family: 'energy', factor: 1055.05585262, prefixable: true, aliases: ['btu'] },
  {
    symbol: 'eV',
    family: 'energy',
    factor: 1.602176634e-19,
    prefixable: true,
    aliases: ['electronvolt', 'electronvolts'],
  },
  { symbol: 'erg', family: 'energy', factor: 1e-7, prefixable: true, aliases: ['ergs'] },

  // ---- power, base watt -------------------------------------------------------------------------------
  { symbol: 'W', family: 'power', factor: 1, prefixable: true, aliases: ['watt', 'watts'] },
  {
    symbol: 'hp',
    family: 'power',
    factor: 745.6998715822702,
    prefixable: false,
    aliases: ['horsepower', 'mechanicalhorsepower'],
  },

  // ---- time, base second ------------------------------------------------------------------------------
  { symbol: 's', family: 'time', factor: 1, prefixable: true, aliases: ['sec', 'secs', 'second', 'seconds'] },
  { symbol: 'min', family: 'time', factor: 60, prefixable: false, aliases: ['mins', 'minute', 'minutes'] },
  { symbol: 'h', family: 'time', factor: 3600, prefixable: true, aliases: ['hr', 'hrs', 'hour', 'hours'] },
  { symbol: 'd', family: 'time', factor: 86400, prefixable: false, aliases: ['day', 'days'] },
  { symbol: 'wk', family: 'time', factor: 604800, prefixable: false, aliases: ['week', 'weeks'] },
  { symbol: 'fortnight', family: 'time', factor: 1209600, prefixable: false, aliases: ['fortnights'] },
  { symbol: 'mo', family: 'time', factor: 2629746, prefixable: false, aliases: ['month', 'months'] },
  { symbol: 'yr', family: 'time', factor: 31556952, prefixable: false, aliases: ['year', 'years'] },

  // ---- data, base byte -----------------------------------------------------------------------------------
  // `b` is a bit and `B` is a byte, by the IEC convention. Both are declared; the exact-case lookup
  // above is what keeps them apart.
  { symbol: 'bit', family: 'data', factor: 0.125, prefixable: true, aliases: ['bits', 'b'] },
  { symbol: 'byte', family: 'data', factor: 1, prefixable: true, aliases: ['bytes', 'B'] },
  { symbol: 'nibble', family: 'data', factor: 0.5, prefixable: false },

  // ---- frequency, base hertz ----------------------------------------------------------------------------
  { symbol: 'Hz', family: 'frequency', factor: 1, prefixable: true, aliases: ['hertz'] },
  { symbol: 'rpm', family: 'frequency', factor: 1 / 60, prefixable: false, aliases: ['r/min', 'revolutionperminute'] },

  // ---- force, base newton -------------------------------------------------------------------------------
  { symbol: 'N', family: 'force', factor: 1, prefixable: true, aliases: ['newton', 'newtons'] },
  { symbol: 'lbf', family: 'force', factor: 4.4482216152605, prefixable: false, aliases: ['poundforce'] },
  { symbol: 'kgf', family: 'force', factor: 9.80665, prefixable: false, aliases: ['kilogramforce'] },
  { symbol: 'dyn', family: 'force', factor: 1e-5, prefixable: true, aliases: ['dyne'] },

  // ---- angle, base radian ---------------------------------------------------------------------------------
  { symbol: 'rad', family: 'angle', factor: 1, prefixable: true, aliases: ['radian', 'radians'] },
  { symbol: 'deg', family: 'angle', factor: Math.PI / 180, prefixable: false, aliases: ['degree', 'degrees', '°'] },
  { symbol: 'grad', family: 'angle', factor: Math.PI / 200, prefixable: false, aliases: ['gradian', 'gon'] },
  {
    symbol: 'turn',
    family: 'angle',
    factor: 2 * Math.PI,
    prefixable: false,
    aliases: ['rev', 'revolution', 'revolutions', 'cycle'],
  },
  { symbol: 'arcmin', family: 'angle', factor: Math.PI / 10800, prefixable: true, aliases: ['arcminute'] },
  { symbol: 'arcsec', family: 'angle', factor: Math.PI / 648000, prefixable: true, aliases: ['arcsecond'] },

  // ---- fuel economy, base metre per litre ------------------------------------------------------------------
  { symbol: 'mpg_us', family: 'fuel', factor: 425143.707488 / 3.785411784, prefixable: false, aliases: ['mpg'] },
  { symbol: 'mpg_imp', family: 'fuel', factor: 425143.707488 / 4.54609, prefixable: false, aliases: ['mpguk'] },
  { symbol: 'lper100km', family: 'fuel', factor: 1e5, prefixable: false, aliases: ['l/100km'] },
];

/** The full prefix table. `da` is a real SI prefix and a number of converters leave it out. */
export const PREFIXES: Record<string, number> = {
  Y: 1e24,
  Z: 1e21,
  E: 1e18,
  P: 1e15,
  T: 1e12,
  G: 1e9,
  M: 1e6,
  k: 1e3,
  h: 1e2,
  da: 1e1,
  d: 1e-1,
  c: 1e-2,
  m: 1e-3,
  µ: 1e-6,
  μ: 1e-6,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15,
  a: 1e-18,
  z: 1e-21,
  y: 1e-24,
};

/** Binary prefixes for the `data` family, where a 1 kB is 1000 bytes and a KiB is 1024. */
const BINARY_PREFIXES: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  K: 1024 ** 0,
  M: 1024 ** 1,
  G: 1024 ** 2,
  T: 1024 ** 3,
  P: 1024 ** 4,
  E: 1024 ** 5,
};

const BY_KEY = new Map<string, Unit>();
for (const unit of UNITS) {
  BY_KEY.set(unit.symbol.toLowerCase(), unit);
  for (const alias of unit.aliases ?? []) BY_KEY.set(alias.toLowerCase(), unit);
}

/**
 * Case-sensitive lookup, consulted before the lowercase table.
 *
 * `b` and `B` mean different things and the convention is not optional: lowercase is a bit, uppercase
 * is a byte. A single lowercased table cannot hold both, and whichever is inserted last wins - the
 * measurement had `1 b` coming out as one *byte*, eight times too large.
 */
const BY_EXACT = new Map<string, Unit>();
for (const unit of UNITS) {
  BY_EXACT.set(unit.symbol, unit);
  for (const alias of unit.aliases ?? []) BY_EXACT.set(alias, unit);
}

/**
 * Resolve a name to a unit.
 *
 * Prefixes are matched **case-sensitively**, and that is not a detail. `m` is milli and `M` is mega,
 * so `mm` (a millimetre) and `Mm` (a megametre) differ by a factor of a billion. An earlier version
 * lowercased the prefix before comparing, which destroyed exactly that distinction and produced:
 *
 *     mm  ->  Mm      1 000 000 m      a millimetre weighing a kilometre
 *     mg  ->  Mg          1 000 kg     a milligram weighing a tonne
 *     KiB ->  not found               because `Ki` is not an SI prefix at all
 *
 * Binary prefixes are in the same table as SI ones so `KiB` resolves through the same path, rather than
 * through a second lookup that the prefix loop never reached.
 */
/**
 * Spelled-out prefixes.
 *
 * The symbol table only covers `km`, so `kilometer` - which is how the unit is written in prose and in
 * most configuration files - did not resolve. Matching the long names here means a converter does not
 * quietly reject ordinary English.
 */
const SPELLED_PREFIXES: Record<string, number> = {
  yotta: 1e24,
  zetta: 1e21,
  exa: 1e18,
  peta: 1e15,
  tera: 1e12,
  giga: 1e9,
  mega: 1e6,
  kilo: 1e3,
  hecto: 1e2,
  deka: 1e1,
  deca: 1e1,
  deci: 1e-1,
  centi: 1e-2,
  milli: 1e-3,
  micro: 1e-6,
  nano: 1e-9,
  pico: 1e-12,
  femto: 1e-15,
  atto: 1e-18,
  zepto: 1e-21,
  yocto: 1e-24,
};

export function findUnit(name: string): Unit | undefined {
  const raw = name.trim();

  // Exact case first, so `B` is a byte and `b` is a bit.
  const exact = BY_EXACT.get(raw);
  if (exact) return exact;

  const key = raw.toLowerCase();
  const direct = BY_KEY.get(key);
  if (direct) return direct;

  // Spelled-out prefixes, longest first so `deci` is not read as `dec`.
  for (const prefix of Object.keys(SPELLED_PREFIXES).sort((a, b) => b.length - a.length)) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const base = BY_KEY.get(rest);
    if (base?.prefixable) {
      return { ...base, symbol: `${prefix}${base.symbol}`, factor: base.factor * SPELLED_PREFIXES[prefix] };
    }
  }

  // Prefixes are matched **case-sensitively**, and that is not a detail. `m` is milli and `M` is mega,
  // so `mm` (a millimetre) and `Mm` (a megametre) differ by a factor of a billion. An earlier version
  // lowercased the prefix before comparing, which destroyed exactly that distinction and produced:
  //
  //     mm  ->  Mm      1 000 000 m      a millimetre weighing a kilometre
  //     mg  ->  Mg          1 000 kg     a milligram weighing a tonne
  //     KiB ->  not found               because `Ki` is not an SI prefix at all
  //
  // Binary prefixes are in the same table as SI ones so `KiB` resolves through the same path, rather than
  // through a second lookup the prefix loop never reached.
  const prefixes = [...new Set([...Object.keys(PREFIXES), ...Object.keys(BINARY_PREFIXES)])].sort(
    (a, b) => b.length - a.length,
  );
  for (const prefix of prefixes) {
    if (raw.length <= prefix.length || !raw.startsWith(prefix)) continue;
    const rest = raw.slice(prefix.length);
    const base = BY_KEY.get(rest.toLowerCase());
    if (!base) continue;

    const decimal = PREFIXES[prefix];
    if (base.prefixable && decimal !== undefined) {
      return { ...base, symbol: `${prefix}${base.symbol}`, factor: base.factor * decimal };
    }
    const binary = BINARY_PREFIXES[prefix];
    if (binary !== undefined) {
      return { ...base, symbol: `${prefix}${base.symbol}`, factor: base.factor * binary };
    }
  }

  // A final case-insensitive pass for a name that is only wrong in case, such as `KM`.
  if (key !== raw) {
    for (const prefix of prefixes) {
      if (key.length <= prefix.length || !key.startsWith(prefix.toLowerCase())) continue;
      const base = BY_KEY.get(key.slice(prefix.length));
      if (!base) continue;
      const factor = base.prefixable ? PREFIXES[prefix] : BINARY_PREFIXES[prefix];
      if (factor !== undefined) {
        return { ...base, symbol: `${raw.slice(0, prefix.length)}${base.symbol}`, factor: base.factor * factor };
      }
    }
  }

  return undefined;
}

/**
 * Split `"12.5 km"` into its number and its unit.
 *
 * The number is matched first and the remainder is the unit, so a unit containing a digit cannot be
 * confused with a quantity, and a value with no unit at all comes back as a bare number rather than an
 * error - the caller decides whether a bare number is acceptable.
 */
export function parseQuantity(input: string): { value: number; unit: string } {
  // A comma inside the number is handled by rule, not by stripping everything: between three
  // following digits it is a thousands separator (`1,500` -> 1500), between anything else it is a
  // decimal comma (`1,5` -> 1.5). Stripping every comma read `1,5 kg` as 15 kg - a number a hundred
  // per cent wrong, offered as a normal parse.
  const raw = input.trim().replace(/(\d),(?=\d)/g, (full, digit: string, offset: number, all: string) =>
    // `full` is the digit AND the comma; keep the digit or the number loses its leading part.
    /^\d{3}(?!\d)/.test(all.slice(offset + 2)) ? digit : digit + '.',
  );
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/.exec(raw);
  if (!match) throw new Error(`sonni tushunib bo‘lmadi: "${input}"`);
  return { value: Number(match[1]), unit: match[2].trim() };
}

/** Convert one quantity to another unit. Affine families invert the offset as well as the factor. */
export function convert(
  value: number,
  fromName: string,
  toName: string,
): { value: number; from: Unit; to: Unit } | { error: string } {
  const from = findUnit(fromName);
  const to = findUnit(toName);
  if (!from) return { error: `birlikni tushunmadim: "${fromName}"` };
  if (!to) return { error: `birlikni tushunmadim: "${toName}"` };
  if (from.family !== to.family) {
    return {
      error: `boshqa oilalar: "${fromName}" (${from.family}) va "${toName}" (${to.family}) — o‘lchov bir xil emas.`,
    };
  }
  if (from.family === 'temperature') {
    const base = value * from.factor + (from.offset ?? 0);
    const result = (base - (to.offset ?? 0)) / to.factor;
    return { value: result, from, to };
  }
  return { value: (value * from.factor) / to.factor, from, to };
}

export function unitsInFamily(family: Family): Unit[] {
  return UNITS.filter((unit) => unit.family === family);
}

/**
 * Prefixed variants worth showing when a caller asks for "every unit in this family".
 *
 * Without this, `pro_units_convert` with `all` listed metres, inches and feet but no kilometres or
 * centimetres - the table declares base units only, so the units people actually type were the ones
 * missing from the overview. Derived from the base units through the same prefix lookup the converter
 * uses, so a listed variant cannot disagree with the unit it is derived from.
 */
const DISPLAY_PREFIXES: Record<string, readonly string[]> = {
  m: ['km', 'dm', 'cm', 'mm', 'µm'],
  g: ['kg', 'mg', 'µg'],
  L: ['kL', 'dL', 'cL', 'mL', 'µL'],
  W: ['kW', 'MW', 'GW'],
  Pa: ['kPa', 'MPa', 'hPa'],
  J: ['kJ', 'MJ', 'mJ'],
  bar: ['mbar'],
  Hz: ['kHz', 'MHz', 'GHz'],
  byte: ['kB', 'MB', 'GB', 'TB', 'KiB', 'MiB', 'GiB', 'TiB'],
  N: ['kN', 'MN', 'mN'],
  s: ['ms', 'µs', 'ns', 'ks'],
};

export function displayUnitsInFamily(family: Family): Unit[] {
  const base = unitsInFamily(family);
  const extra: Unit[] = [];
  for (const unit of base) {
    if (!unit.prefixable) continue;
    for (const symbol of DISPLAY_PREFIXES[unit.symbol] ?? []) {
      const resolved = findUnit(symbol);
      if (resolved) extra.push(resolved);
    }
  }
  return [...base, ...extra];
}

export function allFamilies(): Family[] {
  return [...new Set(UNITS.map((unit) => unit.family))];
}

/** Format without exponent noise for ordinary magnitudes, with it for the extremes. */
export function formatNumber(value: number, significant = 10): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e-6 && magnitude < 1e15) {
    return String(Number(value.toPrecision(significant)));
  }
  return value.toExponential(6);
}
