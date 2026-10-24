// Genuine tool-operation failures must set `isError: true`, so MCP clients that branch on
// `isError` / `structuredContent.ok` do not mistake a failed conversion or lookup for a success.
//
// This is the Fix-2 contract: previously these paths returned `jsonBlock({ error })` — a success-shaped
// result (isError:false, ok:true) with the error buried in the payload. They now go through `failJson`.
// Note the deliberate boundary: "resource not found" style results that the tool successfully determined
// (e.g. pro_opendata_dataset unknown id) are NOT tool errors and intentionally stay non-error.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';

const textOf = (r: any): string => r?.content?.[0]?.text ?? '';

describe('bad-argument failures are flagged isError', () => {
  it('pro_units_convert: unknown unit', async () => {
    const r = await callTool('pro_units_convert', { value: 1, from: 'kilozap', to: 'm' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/tushunmadim|error/i);
  });

  it('pro_units_convert: missing value', async () => {
    const r = await callTool('pro_units_convert', { from: 'km', to: 'm' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/qiymat|error/i);
  });

  it('pro_units_convert: cross-family mismatch', async () => {
    const r = await callTool('pro_units_convert', { value: 1, from: 'km', to: 'kg' });
    expect(r.isError).toBe(true);
  });

  it('pro_units_temperature: missing value', async () => {
    const r = await callTool('pro_units_temperature', {});
    expect(r.isError).toBe(true);
  });

  it('pro_phonetics_compare: missing operand', async () => {
    const r = await callTool('pro_phonetics_compare', { a: 'smith' });
    expect(r.isError).toBe(true);
  });

  it('pro_phonetics_match: empty inputs', async () => {
    const r = await callTool('pro_phonetics_match', {});
    expect(r.isError).toBe(true);
  });
});

describe('successful operations remain non-error', () => {
  it('pro_units_convert: valid conversion is not an error', async () => {
    const r = await callTool('pro_units_convert', { value: 100, from: 'km', to: 'mi' });
    expect(r.isError).toBeFalsy();
  });

  it('pro_phonetics_compare: valid inputs are not an error', async () => {
    const r = await callTool('pro_phonetics_compare', { a: 'smith', b: 'smyth' });
    expect(r.isError).toBeFalsy();
  });
});
