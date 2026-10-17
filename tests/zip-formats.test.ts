// ZIP handling, checked at both levels: the pure functions, and the tools that expose them.
//
// The security assertions are the point of this file. A ZIP reader that does not treat entry names as
// attacker-controlled is an arbitrary file write, and the test builds an archive whose entries try to
// escape rather than asserting that the code "looks careful".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { outputRoot } from '../src/core/output-dir.js';
import { crc32, entryPath, readEntry, readZip, summarise, toDosDateTime, writeZip } from '../src/tools/zip/_zip.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

function payload(result: ToolResult): Record<string, never> {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  return match ? (JSON.parse(match[1]) as Record<string, never>) : ({} as Record<string, never>);
}

function textOf(result: ToolResult): string {
  return (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');
}

describe('crc32', () => {
  it('matches the values the format is defined by', () => {
    expect(crc32(Buffer.alloc(0))).toBe(0);
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
  });

  it('agrees with the CRC recorded in the entry it produced', () => {
    const archive = writeZip([{ name: 'a.txt', data: Buffer.from('salom, dunyo') }]);
    const entry = readZip(archive).entries[0];
    expect(entry.crc32).toBe(crc32(Buffer.from('salom, dunyo')));
  });
});

describe('writing and reading back', () => {
  const files = [
    { name: 'salom.txt', data: Buffer.from('salom, dunyo\n'.repeat(50), 'utf8') },
    { name: 'nested/ma_lumot.json', data: Buffer.from('{"oy":"yanvar"}', 'utf8') },
    { name: 'kichik.txt', data: Buffer.from('x', 'utf8') },
  ];

  it('round-trips every entry byte for byte', () => {
    const archive = writeZip(files.map((file) => ({ ...file, dos_date: 0x5721, dos_time: 0x4a3c })));
    const read = readZip(archive);
    expect(read.entries.map((entry) => entry.name)).toEqual(files.map((file) => file.name));
    for (const [index, file] of files.entries()) {
      expect(readEntry(archive, read.entries[index]).equals(file.data), file.name).toBe(true);
    }
  });

  it('compresses only when compressing helps', () => {
    const archive = writeZip(files);
    const read = readZip(archive);
    // Deflate adds a header, so a one-byte file stored with it comes out larger than the input.
    expect(read.entries[0].method).toBe(8);
    expect(read.entries[2].method).toBe(0);
    expect(read.entries[0].compressed_size).toBeLessThan(read.entries[0].uncompressed_size);
  });

  it('reports no ratio for an empty archive rather than zero or Infinity', () => {
    expect(summarise(readZip(writeZip([]))).compression_ratio).toBeNull();
  });

  it('round-trips a DOS timestamp through the packing', () => {
    const stamp = toDosDateTime(new Date('2026-10-16T10:30:00Z'));
    expect(stamp.date >> 9).toBe(2026 - 1980);
    expect((stamp.date >> 5) & 0x0f).toBe(10);
    expect(stamp.date & 0x1f).toBe(16);
    expect(stamp.time >> 11).toBe(10);
  });
});

describe('entry names cannot escape the destination', () => {
  const cases: Array<[string, string]> = [
    ['../../etc/passwd', 'etc/passwd'],
    ['..\\..\\windows\\system32\\cmd', 'windows/system32/cmd'],
    ['/absolute/path.txt', 'absolute/path.txt'],
    ['C:\\Windows\\System32\\evil.dll', 'Windows/System32/evil.dll'],
    ['a/../../b.txt', 'b.txt'],
    ['./normal/file.txt', 'normal/file.txt'],
  ];

  it.each(cases)('%s becomes %s', (input, expected) => {
    expect(entryPath(input).path).toBe(expected);
  });

  it('never leaves a ".." segment or a leading slash behind', () => {
    for (const [input] of cases) {
      const result = entryPath(input);
      expect(result.path.split('/'), input).not.toContain('..');
      expect(result.path.startsWith('/'), input).toBe(false);
      expect(/^[A-Za-z]:/.test(result.path), input).toBe(false);
    }
  });

  it('reports every rewrite, including one that only trimmed a leading slash', () => {
    // An absolute name is rewritten too. Reporting only `..` traversal would tell a caller that an
    // absolute path was untouched while it had silently lost its leading slash.
    expect(entryPath('/a/b.txt').contained).toBe(true);
    expect(entryPath('C:/a/b.txt').contained).toBe(true);
    expect(entryPath('a/b.txt').contained).toBe(false);
  });

  it('leaves a legitimate name beginning with four dots alone', () => {
    // `....` is not `..`: it is a legal directory name, and rewriting it would rename a real folder.
    expect(entryPath('....//....//x').path).toBe('..../..../x');
    expect(entryPath('....//....//x').contained).toBe(false);
  });
});

describe('an archive that is not an archive', () => {
  it('refuses text', () => {
    expect(() => readZip(Buffer.from('bu zip emas, bu oddiy matn.'))).toThrow();
  });

  it('refuses something too short to hold a directory', () => {
    expect(() => readZip(Buffer.from('qisqa'))).toThrow();
  });
});

describe('limits', () => {
  it('refuses a decompression bomb rather than filling memory', () => {
    // 600 MB of zeros compresses to about 600 KB. The refusal has to happen on the inflated length,
    // not on the header's claim, because the header is the part an attacker writes.
    const bomb = writeZip([{ name: 'bomb.bin', data: Buffer.alloc(600 * 1024 * 1024, 0) }]);
    const entry = readZip(bomb).entries[0];
    expect(entry.compressed_size).toBeLessThan(2 * 1024 * 1024);
    expect(entry.uncompressed_size).toBe(600 * 1024 * 1024);
    expect(() => readEntry(bomb, entry, 1024 * 1024)).toThrow(/chegr|larger than/i);
  });

  it('refuses an archive with more entries than the limit', () => {
    // Two entries against a limit of one. A limit equal to the count is not a violation, so a
    // single-entry archive checked with a limit of one passes - and a test that expected it to throw
    // would be asserting the wrong boundary.
    const archive = writeZip([
      { name: 'a.txt', data: Buffer.from('a') },
      { name: 'b.txt', data: Buffer.from('b') },
    ]);
    expect(() => readZip(archive, 1)).toThrow();
    expect(readZip(archive, 2).entries.length).toBe(2);
  });
});

describe('pro_zip_create', () => {
  it('builds an archive that inspect then reads back', async () => {
    const created = await callTool('pro_zip_create', {
      files: [
        { name: 'salom.txt', text: 'salom, dunyo\n'.repeat(40) },
        { name: 'kichik.txt', text: 'x' },
      ],
      comment: 'sinov',
    });
    const data = payload(created);
    expect(created.isError).toBeFalsy();
    expect(data.files).toBe(2);
    expect(data.comment).toBe('sinov');

    const inspected = await callTool('pro_zip_inspect', { base64: data.base64 as unknown as string });
    const seen = payload(inspected);
    expect(seen.entries).toBe(2);
    expect(seen.comment).toBe('sinov');
  });

  it('refuses an entry with neither text nor base64, rather than writing an empty file', async () => {
    const result = await callTool('pro_zip_create', { files: [{ name: 'a.txt' }] });
    expect(result.isError).toBeTruthy();
  });

  it('refuses an unparseable date instead of packing year 0', async () => {
    // NaN shifted into the DOS date field is read back as 1980 by every tool, silently.
    const result = await callTool('pro_zip_create', {
      files: [{ name: 'a.txt', text: 'a' }],
      date: 'bugun',
    });
    expect(result.isError).toBeTruthy();
  });

  it('refuses malformed base64', async () => {
    const result = await callTool('pro_zip_create', { files: [{ name: 'a.txt', base64: 'not@@here' }] });
    expect(result.isError).toBeTruthy();
  });
});

describe('pro_zip_verify', () => {
  it('reports a healthy archive as whole, byte by byte', async () => {
    const created = await callTool('pro_zip_create', {
      files: [
        { name: 'a.txt', text: 'salom' },
        { name: 'b.txt', text: 'dunyo' },
      ],
    });
    const verified = payload(
      await callTool('pro_zip_verify', {
        base64: payload(created).base64 as unknown as string,
        deep: true,
      }),
    );
    expect(verified.verdict).toBe('butun');
    expect(verified.verified_entries).toBe(2);
  });

  it('catches a flipped byte in the compressed stream', async () => {
    const created = await callTool('pro_zip_create', {
      files: [{ name: 'a.txt', text: 'salom, dunyo, bu yetarli uzun matn siqilishi uchun' }],
    });
    const archive = Buffer.from(payload(created).base64 as unknown as string, 'base64');
    archive[40] = archive[40] ^ 0xff;
    const verified = payload(await callTool('pro_zip_verify', { base64: archive.toString('base64'), deep: true }));
    expect(verified.verdict).toBe('buzilgan');
  });

  it('says so when it did not read the bytes', async () => {
    const created = await callTool('pro_zip_create', { files: [{ name: 'a.txt', text: 'salom' }] });
    const shallow = payload(await callTool('pro_zip_verify', { base64: payload(created).base64 as unknown as string }));
    expect(shallow.note).toMatch(/deep=true/);
  });
});

describe('pro_zip_find', () => {
  const make = async () => {
    const created = await callTool('pro_zip_create', {
      files: [
        { name: 'birinchi.txt', text: 'yanvar oyi boshlanadi\nikkinchi qator' },
        { name: 'ikkinchi.txt', text: 'yanvar ham, fevral ham' },
      ],
    });
    return payload(created).base64 as unknown as string;
  };

  it('finds text and reports the line number', async () => {
    const base64 = await make();
    const found = payload(await callTool('pro_zip_find', { base64, query: 'yanvar' }));
    expect(found.result_count).toBeGreaterThanOrEqual(2);
    const first = (found.results as Array<{ line: number }>)[0];
    expect(first.line).toBeGreaterThanOrEqual(1);
  });

  it('honours case_sensitive', async () => {
    const base64 = await make();
    expect(payload(await callTool('pro_zip_find', { base64, query: 'YANVAR' })).result_count).toBeGreaterThan(0);
    expect(
      payload(await callTool('pro_zip_find', { base64, query: 'YANVAR', case_sensitive: true })).result_count,
    ).toBe(0);
  });

  it('refuses to search with neither a query nor a name', async () => {
    const base64 = await make();
    expect((await callTool('pro_zip_find', { base64 })).isError).toBeTruthy();
  });
});

describe('pro_zip_extract', () => {
  it('writes files inside the sandbox and keeps their content', async () => {
    const created = await callTool('pro_zip_create', {
      files: [
        { name: 'salom.txt', text: 'salom, dunyo' },
        { name: 'nested/ichki.json', text: '{"oy":"yanvar"}' },
      ],
    });
    const destination = path.join(outputRoot(), 'zip-out', 'test-fixture');
    rmSync(destination, { recursive: true, force: true });
    try {
      const extracted = await callTool('pro_zip_extract', {
        base64: payload(created).base64 as unknown as string,
        out_dir: destination,
        extract: true,
      });
      const data = payload(extracted);
      expect(extracted.isError).toBeFalsy();
      expect(data.extracted).toBe(2);
      expect(readFileSync(path.join(destination, 'salom.txt'), 'utf8')).toBe('salom, dunyo');
      expect(readFileSync(path.join(destination, 'nested', 'ichki.json'), 'utf8')).toContain('yanvar');
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  });

  it('refuses a destination outside the output root', async () => {
    const created = await callTool('pro_zip_create', { files: [{ name: 'a.txt', text: 'a' }] });
    const result = await callTool('pro_zip_extract', {
      base64: payload(created).base64 as unknown as string,
      out_dir: path.join(process.cwd(), '..', 'escaped'),
      extract: true,
    });
    expect(result.isError).toBeTruthy();
    expect(textOf(result)).toMatch(/sandbox/);
  });

  it('contains a traversing entry name instead of writing outside', async () => {
    // The archive tries to escape; the tool must rewrite the name, say so, and leave the parent
    // directory untouched.
    const created = await callTool('pro_zip_create', {
      files: [{ name: '../../escaped.txt', text: 'bu tashqariga chiqmoqchi edi' }],
    });
    const escapedTarget = path.resolve(outputRoot(), '..', '..', 'escaped.txt');
    rmSync(escapedTarget, { force: true });
    const result = await callTool('pro_zip_extract', {
      base64: payload(created).base64 as unknown as string,
      extract: true,
    });
    const data = payload(result);
    expect(result.isError).toBeFalsy();
    expect((data.renamed as unknown as unknown[]).length).toBe(1);
    expect(existsSync(escapedTarget)).toBe(false);
    expect(existsSync(path.join(outputRoot(), 'escaped.txt'))).toBe(true);
    rmSync(path.join(outputRoot(), 'escaped.txt'), { force: true });
  });

  it('rebuilds a sanitised archive that verifies clean', async () => {
    const created = await callTool('pro_zip_create', {
      files: [
        { name: '../../yuqoriga.txt', text: 'yuqoriga chiqmoqchi' },
        { name: 'oddiy.txt', text: 'oddiy' },
      ],
    });
    const repacked = payload(
      await callTool('pro_zip_extract', {
        base64: payload(created).base64 as unknown as string,
        repack: true,
      }),
    );
    expect(repacked.repacked_bytes).toBeGreaterThan(0);
    const verified = payload(
      await callTool('pro_zip_verify', {
        base64: repacked.repacked_base64 as unknown as string,
        deep: true,
      }),
    );
    expect(verified.verdict).toBe('butun');
    expect(verified.suspicious_entries).toBeUndefined();
  });

  it('does nothing at all when neither extract nor repack is asked for', async () => {
    const created = await callTool('pro_zip_create', { files: [{ name: 'a.txt', text: 'a' }] });
    const result = await callTool('pro_zip_extract', {
      base64: payload(created).base64 as unknown as string,
    });
    expect(result.isError).toBeTruthy();
  });
});

describe('the zip category does not pollute the repository', () => {
  it('writes nothing into the working tree', async () => {
    const before = readdirSync(process.cwd());
    const created = await callTool('pro_zip_create', {
      files: [{ name: 'a.txt', text: 'salom' }],
      save: true,
    });
    expect(payload(created).path).toContain(outputRoot());
    expect(readdirSync(process.cwd())).toEqual(before);
  });
});
