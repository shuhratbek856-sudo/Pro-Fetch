/**
 * Regression pins for audit batch 3 — the small found-by-measurement fixes:
 * slugify regex injection, case_convert non-Latin words, uuid v7 shape, ULID's Crockford
 * alphabet, the base64url enum that advertised what decode refused, html_entity's numeric
 * escapes and named decode table, units' comma handling, and oklch chroma in CSS units.
 *
 * Every test first failed against the unfixed code and pins the fixed behaviour.
 */
import { describe, expect, it } from 'vitest';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';

process.env.PRO_FETCH_PROFILE = 'full';

const ok = (res: { isError?: boolean }) => res.isError !== true;
const textOf = (res: { content?: Array<{ text?: string }> }) =>
  (res.content ?? []).map((item) => item.text ?? '').join('');

describe('pro_fetch_slugify separators are regex-quoted', () => {
  it('a metachar separator no longer throws or erases the slug', async () => {
    const bracket = await dispatch('pro_fetch_slugify', { text: 'Hello World', format: '[' });
    expect(ok(bracket)).toBe(true);
    // `^ [ + |` was an unterminated character class: the tool crashed with a RegExp error.
    expect(textOf(bracket)).toMatch(/^[a-z]/);

    const dot = await dispatch('pro_fetch_slugify', { text: 'Hello World', format: '.' });
    // `^.+|.+$` matches everything, so `.` used to return an empty slug.
    expect(textOf(dot)).toBe('hello.world');

    const star = await dispatch('pro_fetch_slugify', { text: 'A B', format: '**' });
    expect(textOf(star)).toBe('a**b');

    const dash = await dispatch('pro_fetch_slugify', { text: 'A B' });
    expect(textOf(dash)).toBe('a-b');
  });
});

describe('pro_fetch_case_convert is unicode-aware', () => {
  it('Cyrillic words survive instead of vanishing as separators', async () => {
    const snake = await dispatch('pro_fetch_case_convert', { text: 'Привет мир', format: 'snake' });
    expect(textOf(snake)).toBe('привет_мир');
    const title = await dispatch('pro_fetch_case_convert', { text: 'салом дунё', format: 'title' });
    expect(textOf(title)).toBe('Салом Дунё');
  });

  it('Latin behaviour is unchanged', async () => {
    const camel = await dispatch('pro_fetch_case_convert', { text: 'hello camelCase item', format: 'camel' });
    expect(textOf(camel)).toBe('helloCamelCaseItem');
    const kebab = await dispatch('pro_fetch_case_convert', { text: 'Salom Dunyo', format: 'kebab' });
    expect(textOf(kebab)).toBe('salom-dunyo');
  });
});

describe('pro_encode_uuid version 7 emits RFC 9562 ids', () => {
  it('is 32 hex, carries version 7, an RFC variant nibble, and parses back through the same tool', async () => {
    const gen = await dispatch('pro_encode_uuid', { count: 3, version: '7' });
    const ids = textOf(gen).split('\n');
    expect(gen.isError).not.toBe(true);
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(id[14]).toBe('7');
      expect('89ab'.includes(id[19])).toBe(true);
    }
    const parsed = await dispatch('pro_encode_uuid', { uuid: ids[0] });
    expect(ok(parsed)).toBe(true);
    expect(textOf(parsed)).toMatch(/"version":\s*7/);
  });

  it('v4 ids still parse too', async () => {
    const gen = await dispatch('pro_encode_uuid', { count: 1 });
    const parsed = await dispatch('pro_encode_uuid', { uuid: textOf(gen).trim() });
    expect(ok(parsed)).toBe(true);
    expect(textOf(parsed)).toMatch(/"version":\s*4/);
  });
});

describe('pro_encode_ident ULID uses Crockford base32', () => {
  it('never spells I, L, O or U, is 26 chars, and its time half decodes back', async () => {
    const gen = await dispatch('pro_encode_ident', { count: 8, kind: 'ulid' });
    const ids = textOf(gen).split('\n');
    expect(ids).toHaveLength(8);
    for (const id of ids) {
      expect(id).toHaveLength(26);
      expect(/[ILOU]/i.test(id)).toBe(false);
    }
    // Timestamp 2019-01-01 in ms, encoded with the Crockford alphabet, must decode to itself.
    const stamp = Date.UTC(2019, 0, 1);
    const at = await dispatch('pro_encode_ident', { count: 1, kind: 'ulid', timestamp: stamp });
    const id = textOf(at).trim();
    const mp = new Map('0123456789ABCDEFGHJKMNPQRSTVWXYZ'.split('').map((c, i) => [c, BigInt(i)] as const));
    let decoded = 0n;
    for (const c of id.slice(0, 10)) decoded = decoded * 32n + (mp.get(c) ?? 0n);
    expect(Number(decoded)).toBeGreaterThanOrEqual(stamp - 2000);
    expect(Number(decoded)).toBeLessThanOrEqual(stamp + 6000);
  });
});

describe('pro_encode_decode honours every alphabet the enum advertises', () => {
  it('base64url decodes (was "Noma`lum alfavit")', async () => {
    const dec = await dispatch('pro_encode_decode', { text: 'aGVsbG8gd29ybGQ_', alphabet: 'base64url' });
    expect(ok(dec)).toBe(true);
    expect(textOf(dec)).toContain('hello world');
  });

  it('encode base64url works and pad:false emits plain unpadded base64', async () => {
    const enc = await dispatch('pro_encode_encode', { text: 'hello world?/', alphabet: 'base64url' });
    expect(ok(enc)).toBe(true);
    expect(textOf(enc)).toMatch(/^[A-Za-z0-9_-]+$/);

    const unpad = await dispatch('pro_encode_encode', { text: 'a>>>b', alphabet: 'base64', pad: false });
    expect(ok(unpad)).toBe(true);
    const body = textOf(unpad);
    // `pad: false` removed `=` but must NOT switch the alphabet: no `_`, and `+/` survive.
    expect(body.includes('=')).toBe(false);
    expect(body.includes('_')).toBe(false);
    expect(body.includes('-')).toBe(false);
    expect(/[+/]/.test(body)).toBe(true);
  });
});

describe('pro_encode_html_entity', () => {
  it('numeric mode escapes the XML-critical five instead of copying markup through', async () => {
    const res = await dispatch('pro_encode_html_entity', {
      text: '<b>ok</b> caf&"',
      direction: 'encode',
      mode: 'numeric',
    });
    expect(ok(res)).toBe(true);
    const out = textOf(res);
    expect(out.includes('<') || out.includes('>')).toBe(false);
    for (const ref of ['&#60;', '&#62;', '&#38;', '&#34;']) expect(out).toContain(ref);
  });

  it('decode resolves the common named page, not just the critical five', async () => {
    const res = await dispatch('pro_encode_html_entity', {
      text: '&copy; &mdash; &hellip; &eacute;',
      direction: 'decode',
    });
    const expanded = [...textOf(res)].filter((c) => c.codePointAt(0)! > 127).join('');
    expect(expanded).toBe('©—…é');
  });

  it('basic encode still escapes all five', async () => {
    const res = await dispatch('pro_encode_html_entity', { text: '&<>"\'', direction: 'encode' });
    const out = textOf(res);
    for (const ent of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) expect(out).toContain(ent);
  });
});

describe('pro_units_parse comma handling is number-aware', () => {
  it('a decimal comma stays one quantity ("1,5 kg" is 1.5 kg, not "1" plus "5 kg")', async () => {
    const res = await dispatch('pro_units_parse', { text: '1,5 kg' });
    expect(ok(res)).toBe(true);
    expect(textOf(res)).toMatch(/"value":\s*1\.5/);
    expect(textOf(res)).not.toContain('6 ta miqdor');
  });

  it('a thousands comma collapses ("1,500 kg" is 1500)', async () => {
    const res = await dispatch('pro_units_parse', { quantity: '1,500 kg' });
    expect(ok(res)).toBe(true);
    expect(textOf(res)).toMatch(/"value":\s*1500(?![.\d])/);
  });

  it('a real list still splits after a unit letter', async () => {
    const res = await dispatch('pro_units_parse', { text: '1 kg, 2 lb, 3 oz' });
    expect(textOf(res)).toContain('3 ta miqdor');
  });
});

describe('oklch output is valid CSS', () => {
  it('chroma is a raw 0..~0.4 value, and the emitted string re-parses', async () => {
    const palette = await dispatch('pro_color_palette', {
      color: '#22c55e',
      mode: 'harmony',
      harmony: 'analogous',
    });
    expect(ok(palette)).toBe(true);
    const match = /oklch\((\d+(\.\d+)?)% ([0-9.]+) (\d+(\.\d+)?)\)/.exec(textOf(palette));
    expect(match).not.toBeNull();
    expect(Number(match![3])).toBeGreaterThan(0);
    expect(Number(match![3])).toBeLessThanOrEqual(0.4);
    // Whatever this tool emits, its own parser must read back with a sensible hex.
    const back = await dispatch('pro_color_convert', { color: match![0] });
    expect(ok(back)).toBe(true);
    expect(textOf(back)).toMatch(/#[0-9a-f]{6}/i);
  });
});

describe('time invariants stay intact', () => {
  it('month-end clamping and epoch edge cases', async () => {
    const clamped = await dispatch('pro_time_add', { date: '2026-01-31', duration: '1 month' });
    expect(textOf(clamped)).toContain('2026-02-28');
    const leap = await dispatch('pro_time_add', { date: '2024-01-31', duration: '1 month' });
    expect(textOf(leap)).toContain('2024-02-29');
    const neg = await dispatch('pro_time_parse', { value: '-86400' });
    expect(ok(neg)).toBe(true);
    expect(textOf(neg)).toContain('1969-12-31');
  });
});

describe('registry size unchanged by the batch', () => {
  it('still 672 tools', () => {
    expect(allTools().length).toBe(672);
  });
});
