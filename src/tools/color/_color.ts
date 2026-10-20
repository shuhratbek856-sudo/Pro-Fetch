/**
 * Colour maths.
 *
 * Conversions are done here rather than through a dependency: the whole surface is a few dozen lines
 * of arithmetic, and a wrong conversion is invisible in the output the way a slow one is not.
 *
 * Two decisions that matter more than they look:
 *
 * **sRGB gamma is 2.2 by approximation and 2.4 by the piecewise definition.** WCAG's contrast formula
 * uses the piecewise one; a lightness ramp looks better with 2.2. Both are available, named for what
 * they are, because silently picking one means the same tool reports different contrast depending on
 * which function happened to be called.
 *
 * **Alpha is carried, never dropped.** A colour at 40% opacity is not a darker colour, and rounding it
 * to an opaque one before mixing produces a plausible swatch that is the wrong hue entirely.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ColourFormat = 'hex' | 'rgb' | 'hsl' | 'oklch' | 'named';

/** The 148 CSS named colours, kept as hex. Duplicated from the spec rather than pulled in. */
export const NAMED_COLOURS: Readonly<Record<string, string>> = {
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
};

const clampChannel = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
const clampUnit = (value: number): number => Math.max(0, Math.min(1, value));

/** Parse anything this registry accepts into RGBA, or throw with the part that failed. */
export function parseColour(input: unknown): Rgba {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const record = input as Record<string, unknown>;
    if ('r' in record || 'red' in record) {
      return fromRgbNumbers(
        Number(record.r ?? record.red),
        Number(record.g ?? record.green),
        Number(record.b ?? record.blue),
        record.a ?? record.alpha,
      );
    }
    if ('hex' in record) return parseColour(String(record.hex));
    if ('h' in record) return parseColour(`hsl(${record.h}, ${record.s}%, ${record.l}%)`);
    throw new Error('rang obyekti r/g/b, hex yoki h/s/l maydonlaridan birini talab qiladi.');
  }
  if (Array.isArray(input)) {
    if (input.length < 3) throw new Error(`rgb uchta son talab qiladi, berilgan: ${input.length} ta.`);
    return fromRgbNumbers(Number(input[0]), Number(input[1]), Number(input[2]), input[3]);
  }
  return parseColourString(String(input));
}

function parseColourString(text: string): Rgba {
  const raw = text.trim();
  if (!raw) throw new Error('bo‘sh rang.');

  const lower = raw.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(NAMED_COLOURS, lower)) {
    return parseColourString(NAMED_COLOURS[lower]);
  }

  const hex = /^#?([0-9a-f]{3,8})$/i.exec(lower);
  if (hex) return parseHex(hex[1]);

  const functional = /^(rgba?|hsla?|oklch|lab|lch)\(([^)]*)\)$/i.exec(lower);
  if (functional) {
    const parts = functional[2]
      .split(/[,/\s]+/)
      .map((part) => part.trim())
      .filter((part) => part !== '');
    const alpha = parts.length > 3 ? normaliseAlpha(parts[3]) : 1;
    // The `%` marker is kept, because it is the only thing that distinguishes "1%" from "1".
    //
    // Measured before: the marker was stripped first and the bare number was then rescaled, so `1%`
    // became `100%` and `0.5%` became `50%` — every saturation and lightness in (0%, 1%] was wrong
    // by a factor of a hundred. A percentage is a percentage, whatever its size.
    const numeric = parts.slice(0, 3).map((part) => ({
      value: Number.parseFloat(part.replace('%', '')),
      isPercent: part.endsWith('%'),
    }));
    if (numeric.some((entry) => !Number.isFinite(entry.value))) {
      throw new Error(`funktsiya ichidagi sonlarni tushunib bo‘lmadi: ${functional[2]}`);
    }
    switch (functional[1]) {
      case 'rgb':
      case 'rgba':
        return fromRgbNumbers(numeric[0]!.value, numeric[1]!.value, numeric[2]!.value, alpha);
      case 'hsl':
      case 'hsla':
        // A percentage is used as written. A bare number keeps the historical reading: above 1 it is
        // already a percentage, at or below 1 it is a fraction. `hsl(0, 1, 0.5)` is a fully saturated
        // mid-tone and `hsl(0, 1%, 0.5)` a nearly grey one — which is the whole point of the marker.
        return fromHsl(numeric[0]!.value, percent(numeric[1]!), percent(numeric[2]!), alpha);
      case 'oklch':
        // Lightness follows the same rule as hsl's, so `oklch(0.628 …)` and `oklch(62.8% …)` are the
        // same colour. Measured before: lightness was not scaled at all, so the fraction form came
        // out a hundred times too dark — `#130000` where the percentage form gave `#ff0000`.
        //
        // Chroma keeps the ×100 convention this tool uses internally, and the hue is degrees and is
        // never scaled — scaling it turned 0.5° into 50°.
        return fromOklch(percent(numeric[0]!), percent(numeric[1]!), numeric[2]!.value, alpha);
      case 'lab':
        return fromLab(numeric[0]!.value, numeric[1]!.value, numeric[2]!.value, alpha);
      case 'lch':
        return fromLch(numeric[0]!.value, numeric[1]!.value, numeric[2]!.value, alpha);
      default:
        throw new Error(`qo‘llab-quvvatlanmaydigan rang makoni: ${functional[1]}`);
    }
  }

  if (/^[a-z]+$/i.test(raw)) {
    const suggestion = closestNamed(raw);
    throw new Error(
      `nomlangan rang topilmadi: ${raw}` +
        (suggestion ? ` — yaqini: "${suggestion}"` : ` (${Object.keys(NAMED_COLOURS).length} ta nom mavjud)`),
    );
  }
  throw new Error(`rangni tushunib bo‘lmadi: ${raw}`);
}

const toPercent = (value: number): number => (value > 1 ? value : value * 100);

/**
 * Read one component that may carry a `%` marker.
 *
 * A percentage is the percentage as written — `1%` is 1, not 100. A bare number keeps the
 * historical reading: above 1 it is already a percentage, at or below 1 it is a fraction.
 */
const percent = (entry: { value: number; isPercent: boolean }): number => {
  if (entry.isPercent) return entry.value;
  return toPercent(entry.value);
};

function normaliseAlpha(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 1;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value.replace('%', ''));
  if (!Number.isFinite(parsed)) return 1;
  // A bare `0.5` is a fraction and `50%` is a percentage; both appear in real stylesheets.
  return clampUnit(typeof value === 'string' && value.trim().endsWith('%') ? parsed / 100 : parsed);
}

export function parseHex(body: string): Rgba {
  const hex = body.toLowerCase();
  const expand = (part: string) => parseInt(part.length === 1 ? part + part : part, 16);
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: expand(hex[0]),
      g: expand(hex[1]),
      b: expand(hex[2]),
      a: hex.length === 4 ? expand(hex[3]) / 255 : 1,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  throw new Error(`hex uzunligi noto‘g‘ri (3, 4, 6 yoki 8 belgi kerak): ${body.length}`);
}

/** A named colour close enough to be worth suggesting, rather than "not found". */
export function closestNamed(text: string): string | null {
  const target = text.toLowerCase();
  let best: string | null = null;
  // Starts above the acceptance threshold, not at it. Seeding it *at* the threshold meant a candidate
  // exactly that far away could never win - `reddish` is four edits from `red` and reported no
  // suggestion even though the comparison below accepts four.
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const name of Object.keys(NAMED_COLOURS)) {
    let distance = Math.abs(name.length - target.length);
    for (let index = 0; index < Math.min(name.length, target.length); index++) {
      if (name[index] !== target[index]) distance++;
      if (distance >= bestDistance) break;
    }
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }
  // Four characters rather than three: `reddish` is four edits from `red` and is the most likely typo
  // someone makes, and a suggestion that costs nothing is worth more than a tidier threshold.
  return bestDistance <= 4 ? best : null;
}

function fromRgbNumbers(r: number, g: number, b: number, a: unknown): Rgba {
  if (![r, g, b].every((value) => Number.isFinite(value))) {
    throw new Error(`rgb sonlari noto‘g‘ri: ${r}, ${g}, ${b}`);
  }
  if ([r, g, b].some((value) => value < 0 || value > 255)) {
    throw new Error(`rgb qiymatlari 0..255 orasida bo‘lishi kerak: ${r}, ${g}, ${b}`);
  }
  return { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b), a: normaliseAlpha(a as string | number) };
}

const srgbToLinear = (channel: number): number => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const linearToSrgb = (value: number): number => {
  const clamped = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return clampChannel(clamped * 255);
};

export function fromHsl(h: number, s: number, l: number, a = 1): Rgba {
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    throw new Error(`hsl sonlari noto‘g‘ri: ${h}, ${s}, ${l}`);
  }
  const hue = ((h % 360) + 360) % 360;
  const saturation = clampUnit(s / 100);
  const lightness = clampUnit(l / 100);
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  const sector = Math.floor(hue / 60) % 6;
  const table: Array<[number, number, number]> = [
    [chroma, secondary, 0],
    [secondary, chroma, 0],
    [0, chroma, secondary],
    [0, secondary, chroma],
    [secondary, 0, chroma],
    [chroma, 0, secondary],
  ];
  const [r, g, b] = table[sector];
  return {
    r: clampChannel((r + match) * 255),
    g: clampChannel((g + match) * 255),
    b: clampChannel((b + match) * 255),
    a: clampUnit(a),
  };
}

export function toHsl(colour: Rgba): { h: number; s: number; l: number } {
  const r = colour.r / 255;
  const g = colour.g / 255;
  const b = colour.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: Number((lightness * 100).toFixed(2)) };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return {
    h: Number(hue.toFixed(2)),
    s: Number((saturation * 100).toFixed(2)),
    l: Number((lightness * 100).toFixed(2)),
  };
}

export function fromOklch(l: number, c: number, h: number, a = 1): Rgba {
  const lightness = l / 100;
  const chroma = c / 100;
  const hue = (h * Math.PI) / 180;
  const aValue = chroma * Math.cos(hue);
  const bValue = chroma * Math.sin(hue);
  const lPrime = lightness + 0.3963377774 * aValue + 0.2158037573 * bValue;
  const mPrime = lightness - 0.1055613458 * aValue - 0.0638541728 * bValue;
  const sPrime = lightness - 0.0894841775 * aValue - 1.291485548 * bValue;
  const l3 = lPrime ** 3;
  const m3 = mPrime ** 3;
  const s3 = sPrime ** 3;
  return {
    r: linearToSrgb(+4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    g: linearToSrgb(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    b: linearToSrgb(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
    a: clampUnit(a),
  };
}

export function toOklch(colour: Rgba): { l: number; c: number; h: number } {
  const r = srgbToLinear(colour.r);
  const g = srgbToLinear(colour.g);
  const b = srgbToLinear(colour.b);
  const lPrime = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const mPrime = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const sPrime = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * lPrime + 0.793617785 * mPrime - 0.0040720468 * sPrime;
  const aValue = 1.9779984951 * lPrime - 2.428592205 * mPrime + 0.4505937099 * sPrime;
  const bValue = 0.0259040371 * lPrime + 0.7827717662 * mPrime - 0.808675766 * sPrime;
  const chroma = Math.sqrt(aValue ** 2 + bValue ** 2);
  let hue = (Math.atan2(bValue, aValue) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { l: Number((lightness * 100).toFixed(2)), c: Number((chroma * 100).toFixed(2)), h: Number(hue.toFixed(2)) };
}

/** D65 reference white, the one sRGB is defined against. */
const D65 = { x: 0.95047, y: 1, z: 1.08883 } as const;

/** The CIE constants: below this luminance, L* is linear rather than a cube. */
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/**
 * Lab to sRGB, through XYZ.
 *
 * Two things the first version left out, both of which produce a *plausible* colour rather than an
 * obvious failure. Measured round-trip before the fix:
 *
 *   #3b82f6 -> #637ded    #00ff00 -> #48fd00    #ffffff -> #fff9f4    #000000 -> #0a0808
 *
 * **The inverse f is piecewise.** `xPrime ** 3` was used unconditionally, but below the epsilon the
 * standard is linear. That is why black came back as `#0a0808`: the cube of a small number is still a
 * small number where the linear branch is zero.
 *
 * **XYZ is scaled by the reference white.** Without the `Xn/Yn/Zn` factor every channel is off by the
 * white point, which reads as a uniform hue shift rather than a scale error - the blue drifted toward
 * cyan and green toward yellow.
 */
export function fromLab(l: number, a: number, b: number, alpha = 1): Rgba {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const inverse = (value: number): number => (value ** 3 > EPSILON ? value ** 3 : (116 * value - 16) / KAPPA);
  const yr = l > KAPPA * EPSILON ? fy ** 3 : l / KAPPA;

  const x = inverse(fx) * D65.x;
  const y = yr * D65.y;
  const z = inverse(fz) * D65.z;

  return {
    r: linearToSrgb(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: linearToSrgb(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: linearToSrgb(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    a: clampUnit(alpha),
  };
}

export function fromLch(l: number, c: number, h: number, alpha = 1): Rgba {
  const radians = (h * Math.PI) / 180;
  return fromLab(l, c * Math.cos(radians), c * Math.sin(radians), alpha);
}

export function toLab(colour: Rgba): { l: number; a: number; b: number } {
  const r = srgbToLinear(colour.r);
  const g = srgbToLinear(colour.g);
  const b = srgbToLinear(colour.b);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return {
    l: Number((116 * fy - 16).toFixed(2)),
    a: Number((500 * (fx - fy)).toFixed(2)),
    b: Number((200 * (fy - fz)).toFixed(2)),
  };
}

export function toHex(colour: Rgba, alpha = false): string {
  const base = `#${[colour.r, colour.g, colour.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  if (!alpha || colour.a >= 1) return base;
  return `${base}${Math.round(colour.a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** The inverse CSS name, or null when the colour is not exactly one of the 148. */
export function nameOf(colour: Rgba): string | null {
  const hex = toHex({ ...colour, a: 1 });
  for (const [name, value] of Object.entries(NAMED_COLOURS)) {
    if (value === hex) return name;
  }
  return null;
}

/**
 * WCAG 2.x contrast ratio, using the piecewise sRGB definition.
 *
 * The 2.2 approximation differs by up to ~0.4 at the ends of the range, which is enough to move a
 * borderline pair across 4.5. Since the number exists to answer "does this pass AA", it uses the
 * formula the specification uses.
 */
export function relativeLuminance(colour: Rgba): number {
  const r = srgbToLinear(colour.r);
  const g = srgbToLinear(colour.g);
  const b = srgbToLinear(colour.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: Rgba, second: Rgba): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  return Number(ratio.toFixed(2));
}

/** WCAG levels for a contrast ratio, named for what they are. */
export function wcagLevels(ratio: number): {
  aa_normal: boolean;
  aa_large: boolean;
  aaa_normal: boolean;
  aaa_large: boolean;
} {
  return {
    aa_normal: ratio >= 4.5,
    aa_large: ratio >= 3,
    aaa_normal: ratio >= 7,
    aaa_large: ratio >= 4.5,
  };
}

/**
 * Source-over compositing of `top` onto `bottom`.
 *
 * Weighted by alpha, which is the whole point: `mix` that ignores alpha produces a plausible swatch in
 * the wrong hue, and a palette built from it looks fine while disagreeing with the interface.
 */
export function blend(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const channel = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / alpha;
  return {
    r: clampChannel(channel(top.r, bottom.r)),
    g: clampChannel(channel(top.g, bottom.g)),
    b: clampChannel(channel(top.b, bottom.b)),
    a: Number(alpha.toFixed(4)),
  };
}

/** Uniform mix between two colours; `amount` is how much of `to` ends up in the result. */
export function mix(from: Rgba, to: Rgba, amount: number): Rgba {
  const weight = clampUnit(amount);
  return {
    r: clampChannel(from.r + (to.r - from.r) * weight),
    g: clampChannel(from.g + (to.g - from.g) * weight),
    b: clampChannel(from.b + (to.b - from.b) * weight),
    a: Number((from.a + (to.a - from.a) * weight).toFixed(4)),
  };
}

/** Every representation of a colour, so a caller does not have to guess which one to trust. */
export function describe(colour: Rgba): Record<string, unknown> {
  const hsl = toHsl(colour);
  const oklch = toOklch(colour);
  const lab = toLab(colour);
  return {
    hex: toHex(colour),
    hex_with_alpha: toHex(colour, true),
    rgb: `rgb(${colour.r}, ${colour.g}, ${colour.b})`,
    rgba: `rgba(${colour.r}, ${colour.g}, ${colour.b}, ${Number(colour.a.toFixed(4))})`,
    hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`,
    oklch: `oklch(${oklch.l}% ${oklch.c} ${oklch.h})`,
    lab: `lab(${lab.l} ${lab.a} ${lab.b})`,
    channels: { r: colour.r, g: colour.g, b: colour.b, a: Number(colour.a.toFixed(4)) },
    hsl_channels: hsl,
    oklch_channels: oklch,
    lab_channels: lab,
    name: nameOf(colour),
  };
}
