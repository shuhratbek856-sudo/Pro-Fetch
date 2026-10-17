// Locks a hazard that is invisible at every layer above it.
//
// `num` floors. That is correct for a pixel count and destructive for anything on a unit scale: a
// brightness of 0.5 becomes 0, 0 is the "not supplied" fallback, and the tool then reports that
// nothing changed while returning the input file. Measured before this fix:
//
//   pro_image_adjust({ brightness: 0.5 })   -> "Hech qanday o'zgarish berilmadi"
//   pro_image_adjust({ contrast: 0.5 })    -> applied.modulate: [] (contrast silently dropped)
//   pro_image_adjust({ saturation: -0.7 }) -> applied.modulate: []
//   pro_image_watermark({ opacity: 0.5 })  -> opacity 0.01  (floored to 0, clamped to the minimum)
//   pro_pdf_watermark({ opacity: 0.25 })   -> opacity 0.01
//   pro_image_watermark({ width_ratio: 0.3 }) -> 2 px banner on a 400 px image
//
// Six silent no-ops, all of them reporting success. The assertions below are on the values themselves
// rather than on "did not throw", because "did not throw" is exactly what was true before.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { float, num } from '../src/core/input.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
  // `process.env.TMPDIR ?? '.'` is what put 78 generated PNGs into `img-out/` in commits 20f59a9
  // through 90bf3e0. TMPDIR is a Unix variable; on Windows it is undefined, so the fallback ran and
  // pointed the output root at the repository. `tmpdir()` from `node:os` is the cross-platform one,
  // and there is no `'.'` fallback: if the platform cannot tell us where temporary files go, failing
  // loudly beats writing into whatever directory the suite happens to run from.
  process.env.PRO_FETCH_OUTPUT_ROOT = path.join(tmpdir(), 'pro-fetch-float-hazard');
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

describe('num floors, which is a trap off a unit scale', () => {
  it('is documented at the definition rather than only here', () => {
    // The hazard is invisible at the call site - `num(p, 'brightness', 0, -1, 1)` reads as ordinary
    // clamping - so the warning belongs where the function is defined.
    const source = readFileSync(new URL('../src/core/input.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/Use `float` for any parameter that is not a count/);
  });

  it('float keeps a value below 1', () => {
    expect(float({ brightness: 0.5 }, 'brightness', 0, -1, 1)).toBe(0.5);
    expect(float({ saturation: -0.7 }, 'saturation', 0, -1, 1)).toBe(-0.7);
  });

  it('num destroys the same value, which is why float exists', () => {
    expect(num({ brightness: 0.5 }, 'brightness', 0, -1, 1)).toBe(0);
  });

  it('float still clamps and still falls back', () => {
    expect(float({ a: 5 }, 'a', 0, -1, 1)).toBe(1);
    expect(float({ a: -5 }, 'a', 0, -1, 1)).toBe(-1);
    expect(float({}, 'a', 0.25, -1, 1)).toBe(0.25);
    expect(float({ a: 'nonsense' }, 'a', 0.25, -1, 1)).toBe(0.25);
  });
});

describe('a fractional adjustment is applied, not discarded', () => {
  it('brightness below 1 changes the image', async () => {
    // Before the fix this returned "nothing was changed" with isError falsy.
    const result = await callTool('pro_image_adjust', {
      base64: PNG_200x120,
      brightness: 0.5,
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/brightness=0\.50/);
  });

  it('contrast below 1 reaches the linear pass', async () => {
    const result = await callTool('pro_image_adjust', {
      base64: PNG_200x120,
      contrast: 0.5,
      saturation: -0.3,
    });
    const body = text(result);
    expect(body).toMatch(/linear_contrast/);
    expect(body).toMatch(/saturation=-0\.30/);
  });

  it('an out-of-range adjustment is refused rather than quietly clamped', async () => {
    // blur 999 clamped to 100 and the output reported blur: 100. Honest in the result, but the
    // caller is told about the mistake only by reading a number they did not type.
    const result = await callTool('pro_image_adjust', { base64: PNG_200x120, blur: 999 });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/0\.\.100/);
  });
});

describe('opacity survives being below 1', () => {
  it('image watermark', async () => {
    for (const opacity of [0.5, 0.25, 0.8]) {
      const body = text(await callTool('pro_image_watermark', { base64: PNG_200x120, text: 'A', opacity }));
      expect(body, `opacity ${opacity}`).toContain(`"opacity": ${opacity}`);
    }
  });

  it('a ratio produces a banner sized from the image', async () => {
    // 0.3 floored to 0, clamped to the 0.01 minimum, gave a 2 px banner on a 400 px image.
    const body = text(
      await callTool('pro_image_watermark', {
        base64: PNG_400x300,
        text: 'X',
        width_ratio: 0.3,
      }),
    );
    expect(body).toMatch(/"region":\s*\{[^}]*"width":\s*120/);
  });
});

// A 200x120 solid colour and a 400x300 one, as base64 PNG. Generated rather than embedded as long
// literals so the bytes are obviously the thing they claim to be, and so the tests do not depend on a
// fixture file existing.
let PNG_200x120 = '';
let PNG_400x300 = '';

beforeAll(async () => {
  const { default: sharp } = await import('sharp');
  PNG_200x120 = (
    await sharp({
      create: { width: 200, height: 120, channels: 3, background: { r: 200, g: 60, b: 40 } },
    })
      .png()
      .toBuffer()
  ).toString('base64');
  PNG_400x300 = (
    await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .png()
      .toBuffer()
  ).toString('base64');
});

describe('the suite is honest about its own fixtures', () => {
  it('the images above are real', () => {
    // Without this, the fixtures could be empty strings and every assertion above would pass against
    // an error message containing the opacity it was given.
    expect(PNG_200x120.length).toBeGreaterThan(100);
    expect(PNG_400x300.length).toBeGreaterThan(100);
  });
});
