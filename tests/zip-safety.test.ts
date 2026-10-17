// Archive distribution safety, asserted rather than assumed.
//
// An audit concluded that the ZIP tools "cannot currently be considered safe" without naming a case. Each
// attack below was run against the real tool before this file existed; all of them are refused, and the
// refusals are pinned here so a later change cannot quietly drop one.
//
// The important property is the second half of each case: not only is the call refused, but **no file is
// written**. An extractor that aborts halfway leaves the archive it was told to distrust on disk, which
// is the outcome that matters.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { entryPath, readEntry, readZip, writeZip } from '../src/tools/zip/_zip.js';
import type { ToolResult } from '../src/core/types.js';

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

const build = (pairs: Array<[string, string]>): Buffer =>
  writeZip(pairs.map(([name, data]) => ({ name, data: Buffer.from(data) })));

describe('entry names cannot point outside the destination', () => {
  it.each([
    ['../../escaped.txt', 'escaped.txt'],
    ['a/../../../also-escaped.txt', 'also-escaped.txt'],
    ['/abs/escaped.txt', 'abs/escaped.txt'],
    ['..\\..\\win-escaped.txt', 'win-escaped.txt'],
    ['C:/drive/escaped.txt', 'drive/escaped.txt'],
  ])('%s becomes %s', (name, expected) => {
    const safe = entryPath(name);
    expect(safe.contained).toBe(true);
    expect(safe.path).toBe(expected);
    // The containment check is on the resolved path, not on the string: `C:\out-evil` starts with
    // `C:\out`, so a prefix test would pass it.
    expect(safe.path.includes('..')).toBe(false);
    expect(safe.path.startsWith('/')).toBe(false);
    expect(/^[A-Za-z]:/.test(safe.path)).toBe(false);
  });

  it('leaves an ordinary path alone', () => {
    expect(entryPath('dir/nested/ok.txt')).toEqual({ contained: false, path: 'dir/nested/ok.txt' });
    expect(entryPath('safe.txt')).toEqual({ contained: false, path: 'safe.txt' });
  });
});

describe('a hostile archive is refused, and nothing is written', () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'zip-safety-'));
    previousRoot = process.env.PRO_FETCH_OUTPUT_ROOT;
    process.env.PRO_FETCH_OUTPUT_ROOT = root;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (previousRoot === undefined) delete process.env.PRO_FETCH_OUTPUT_ROOT;
    else process.env.PRO_FETCH_OUTPUT_ROOT = previousRoot;
  });

  const extract = async (archive: Buffer, outDir: string, extra: Record<string, unknown> = {}) => {
    const destination = path.join(root, outDir);
    const result = await callTool('pro_zip_extract', {
      base64: archive.toString('base64'),
      out_dir: destination,
      extract: true,
      ...extra,
    });
    return { result, destination };
  };

  it('refuses a corrupted entry and writes no file', async () => {
    const good = build([['hello.txt', 'salom dunyo']]);
    const entry = readZip(good).entries[0]!;
    const nameLength = good.readUInt16LE(entry.local_offset + 26);
    const extraLength = good.readUInt16LE(entry.local_offset + 28);
    const dataStart = entry.local_offset + 30 + nameLength + extraLength;

    // Corrupt the last byte of the *payload*, not the name. An earlier version of this probe flipped a
    // byte inside `hello.txt` in the header, which left the data intact, so the CRC matched and the
    // archive extracted cleanly - a probe that proved nothing.
    const corrupt = Buffer.from(good);
    corrupt[dataStart + entry.compressed_size - 1] ^= 0xff;

    expect(() => readEntry(corrupt, readZip(corrupt).entries[0]!)).toThrow(/CRC/);

    const { result, destination } = await extract(corrupt, 'crc-out');
    expect(result.isError).toBeTruthy();
    expect(existsSync(destination) ? readdirSync(destination) : []).toEqual([]);
  });

  it('refuses an archive whose declared size exceeds the limit, without inflating it', async () => {
    const bomb = build([['bomb.bin', Buffer.alloc(4 * 1024 * 1024, 0x41).toString('base64')]]);
    const declared = readZip(bomb).entries[0]!.uncompressed_size ?? 0;
    expect(declared).toBeGreaterThan(1_000_000);

    const { result, destination } = await extract(bomb, 'bomb-out', { max_inflated_bytes: 65_536 });
    expect(result.isError).toBeTruthy();
    expect(existsSync(destination) ? readdirSync(destination) : []).toEqual([]);
  });

  it('refuses an archive with more entries than the cap', () => {
    const many = build(Array.from({ length: 12_000 }, (_, index) => [`f${index}.txt`, 'x']));
    expect(() => readZip(many)).toThrow(/chegaradan ko‘p/);
  });

  it('refuses something that is not an archive at all', async () => {
    const result = await callTool('pro_zip_inspect', {
      base64: Buffer.from('bu zip emas').toString('base64'),
    });
    expect(result.isError).toBeTruthy();
  });

  it('refuses a destination outside the output root', async () => {
    const good = build([['hello.txt', 'salom']]);
    const result = await callTool('pro_zip_extract', {
      base64: good.toString('base64'),
      out_dir: path.join(root, '..', 'escape-target'),
      extract: true,
    });
    expect(result.isError).toBeTruthy();
    expect(existsSync(path.join(root, '..', 'escape-target'))).toBe(false);
  });

  it('contains traversal entries instead of writing them outside', async () => {
    // A traversal entry is not an error here: it is renamed and reported, because an archive legitimately
    // containing `sub/../x` should still extract. What matters is that it lands inside and that the
    // rename is visible rather than silent.
    const trav = build([
      ['../../pwned.txt', 'x'],
      ['sub/../../also-pwned.txt', 'x'],
    ]);
    const { result, destination } = await extract(trav, 'trav-out');
    expect(result.isError).toBeFalsy();
    const data = payload(result);
    expect(data.contained_paths_fixed).toBe(2);
    expect(readdirSync(destination).sort()).toEqual(['also-pwned.txt', 'pwned.txt']);
    // Nothing above the destination directory was created.
    expect(readdirSync(root).filter((name) => name.includes('pwned'))).toEqual([]);
  });

  it('still extracts an ordinary archive', async () => {
    // The refusal tests above would all pass against an extractor that refuses everything, so the
    // positive case is what makes them mean something.
    const good = build([['hello.txt', 'salom dunyo']]);
    const { result, destination } = await extract(good, 'good-out');
    expect(result.isError).toBeFalsy();
    expect(readFileSync(path.join(destination, 'hello.txt'), 'utf8')).toBe('salom dunyo');
  });

  it('reports a CRC failure once, not twice', async () => {
    const good = build([['hello.txt', 'salom dunyo']]);
    const entry = readZip(good).entries[0]!;
    const dataStart =
      entry.local_offset + 30 + good.readUInt16LE(entry.local_offset + 26) + good.readUInt16LE(entry.local_offset + 28);
    const corrupt = Buffer.from(good);
    corrupt[dataStart + entry.compressed_size - 1] ^= 0xff;

    const { result } = await extract(corrupt, 'crc-msg');
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    // `readEntry` already prefixes the entry name; the handler used to add it a second time.
    expect(body).toMatch(/hello\.txt: CRC mos kelmadi/);
    expect(body).not.toMatch(/hello\.txt: hello\.txt/);
  });
});
