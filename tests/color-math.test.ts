// Colour is the one category here with no network, no clock and no third party in the loop, so its
// assertions can be exact rather than approximate. Every case below is a number that either holds or
// does not.
//
// The Lab round-trip is the reason this file exists. The first implementation used `xPrime ** 3`
// unconditionally and omitted the D65 reference-white scaling. Both defects produce a *plausible*
// colour rather than an obvious failure:
//
//   #3b82f6 -> #637ded    #00ff00 -> #48fd00    #ffffff -> #fff9f4    #000000 -> #0a0808
//
// A test asserting "the result is a valid hex" would have passed on every one of those.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import {
  blend,
  contrastRatio,
  fromLab,
  mix,
  parseColour,
  toHex,
  toLab,
  wcagLevels,
  NAMED_COLOURS,
} from '../src/tools/color/_color.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const payload = (result: ToolResult): Record<string, any> => {
  const body = text(result);
  const start = body.indexOf('```json');
  if (start < 0) throw new Error(`natijada JSON blok yo'q: ${body.slice(0, 140)}`);
  const end = body.indexOf('```', start + 7);
  return JSON.parse(body.slice(start + 7, end < 0 ? undefined : end));
};

describe('every notation round-trips exactly', () => {
  const samples = [
    '#3b82f6',
    '#ff0000',
    '#00ff00',
    '#0000ff',
    '#ffffff',
    '#000000',
    '#808080',
    '#123456',
    '#fedcba',
    '#00ced1',
  ];

  for (const hex of samples) {
    it(`hex -> lab -> hex for ${hex}`, () => {
      const colour = parseColour(hex);
      const lab = toLab(colour);
      expect(toHex(fromLab(lab.l, lab.a, lab.b))).toBe(hex);
    });

    it(`hex -> hsl -> hex for ${hex}`, async () => {
      const forward = payload(await callTool('pro_color_convert', { color: hex }));
      const { h, s, l } = forward.hsl_channels;
      const back = payload(await callTool('pro_color_convert', { color: `hsl(${h}, ${s}%, ${l}%)` }));
      expect(back.hex).toBe(hex);
    });

    it(`hex -> oklch -> hex for ${hex}`, async () => {
      const forward = payload(await callTool('pro_color_convert', { color: hex }));
      const { l, c, h } = forward.oklch_channels;
      const back = payload(await callTool('pro_color_convert', { color: `oklch(${l}% ${c} ${h})` }));
      expect(back.hex).toBe(hex);
    });
  }
});

describe('parsing accepts what it advertises', () => {
  it('short hex, long hex, with and without alpha', () => {
    expect(parseColour('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(Math.round(parseColour('#ff000080').a * 255)).toBe(128);
  });

  it('functional notations', () => {
    expect(parseColour('rgb(59, 130, 246)').r).toBe(59);
    expect(parseColour('hsl(0, 0%, 100%)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour('rgb(0, 0, 0, 0.5)').a).toBe(0.5);
  });

  it('an array, which used to crash on the absent alpha', () => {
    // `rgb: [59, 130, 246]` has no fourth element, and the alpha fallback called a string method on
    // `undefined`: "Cannot read properties of undefined (reading 'replace')".
    expect(parseColour([59, 130, 246])).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    expect(parseColour([59, 130, 246, 0.5]).a).toBe(0.5);
  });

  it('a named colour', () => {
    expect(parseColour('teal')).toEqual({ r: 0, g: 128, b: 128, a: 1 });
  });
});

describe('a bad input is refused with something actionable', () => {
  it('an unknown name suggests the nearest one', async () => {
    const result = await callTool('pro_color_convert', { color: 'reddish' });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/"red"/);
  });

  it('an out-of-range channel names the range', async () => {
    const result = await callTool('pro_color_convert', { color: 'rgb(300, 0, 0)' });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/255/);
  });

  it('a nonsense string does not claim the palette is large', async () => {
    const result = await callTool('pro_color_convert', { color: 'zzzznotacolor' });
    expect(text(result)).toMatch(new RegExp(`${Object.keys(NAMED_COLOURS).length} ta nom`));
  });
});

describe('the named-colour table matches its own description', () => {
  it('the count the tool reports is the count the table holds', async () => {
    // The description said 148 while the table held 141. A description promising a capability the
    // build does not have is the same defect as a status saying ready when the guard will refuse.
    const data = payload(await callTool('pro_color_convert', { color: 'x', list: true }));
    expect(data.count).toBe(Object.keys(NAMED_COLOURS).length);
    expect(data.count).toBe(141);
  });

  it('every name resolves back to its own hex', () => {
    for (const [name, hex] of Object.entries(NAMED_COLOURS)) {
      expect(toHex(parseColour(name)), name).toBe(hex);
    }
  });
});

describe('WCAG contrast uses the specification formula', () => {
  it('black on white is exactly 21', () => {
    expect(contrastRatio(parseColour('#000000'), parseColour('#ffffff'))).toBe(21);
  });

  it('a colour against itself is 1', () => {
    expect(contrastRatio(parseColour('#3b82f6'), parseColour('#3b82f6'))).toBe(1);
  });

  it('the levels follow from the ratio', () => {
    expect(wcagLevels(21)).toEqual({ aa_normal: true, aa_large: true, aaa_normal: true, aaa_large: true });
    expect(wcagLevels(4.48)).toEqual({
      aa_normal: false,
      aa_large: true,
      aaa_normal: false,
      aaa_large: false,
    });
  });

  it('the suggestion actually passes, and moves away from the background', async () => {
    // The first version moved the foreground *toward* white when it was already darker than the
    // background, which reduced the ratio and then reported no suggestion at all - the most common case.
    for (const [foreground, background, direction] of [
      ['#777777', '#ffffff', 'darker'],
      ['#333333', '#000000', 'lighter'],
    ]) {
      const data = payload(await callTool('pro_color_contrast', { foreground, background }));
      expect(data.passes).toBe(false);
      expect(data.suggestion.direction).toBe(direction);
      const verified = payload(
        await callTool('pro_color_contrast', {
          foreground: data.suggestion.hex,
          background,
        }),
      );
      expect(verified.passes, `${data.suggestion.hex} on ${background}`).toBe(true);
    }
  });

  it('a pair that already passes gets no suggestion', async () => {
    const data = payload(await callTool('pro_color_contrast', { foreground: '#ffffff', background: '#000000' }));
    expect(data.passes).toBe(true);
    expect(data.suggestion).toBe(null);
  });
});

describe('alpha is carried, never rounded away', () => {
  it('blend weights by alpha', () => {
    const half = blend(parseColour('rgba(255, 0, 0, 0.5)'), parseColour('rgba(0, 0, 255, 1)'));
    // 50% red over opaque blue: r = 255*0.5 / 1 = 127.5, and Math.round rounds halves up.
    expect(Math.round(half.r)).toBe(128);
    expect(Math.round(half.b)).toBe(128);
    expect(Math.round(half.a * 100) / 100).toBe(1);
  });

  it('an opaque top hides the bottom entirely', () => {
    expect(toHex(blend(parseColour('#ff0000'), parseColour('#0000ff')))).toBe('#ff0000');
  });

  it('mix preserves alpha along the way', () => {
    expect(mix(parseColour('rgba(0,0,0,0)'), parseColour('rgba(0,0,0,1)'), 0.5).a).toBe(0.5);
  });
});
