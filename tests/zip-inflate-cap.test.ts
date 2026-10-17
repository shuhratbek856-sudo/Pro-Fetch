// F-05 va F-22: ZIP umumiy ochilgan hajm chegarasi haqiqiy o'lchov bilan tekshiriladimi?
//
// Audit reproducer'i asosida: markaziy katalogdagi `uncompressed_size` ni o'zgartirib, haqiqiy
// kontentni o'zgartirmasdan. Natija e'lon qilingan jami 2 bayt, haqiqiy jami 40 bayt bo'lishi kerak.
//
// Uchta o'lchov, hammasi haqiqiy disk yozuvi bilan:
//   1) chegara oshsa — rad etiladi va HECH NARSA yozilmaydi
//   2) chegara oshmasa — haqiqiy yozilgan baytlar haqiqiy kontent bilan mos bo'ladi
//   3) kech xato — oldingi yozuvlar qolmaydi

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEntry, readZip, writeZip } from '../src/tools/zip/_zip.js';
import extractTool from '../src/tools/zip/extract.js';

let tool: typeof extractTool;
let workspace: string;
let outputRoot: string;

const textOf = (result: unknown): string =>
  ((result as { content?: Array<{ type: string; text?: string }> }).content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');

/**
 * A ZIP whose central-directory `uncompressed_size` fields claim less than the payload holds.
 *
 * `writeZip` computes both sizes correctly, so this rewrites the central directory afterwards. The
 * local headers keep the real size - that is what `readEntry` reads the data span from - so only the
 * central directory lies, and only about a number. The archive stays fully valid to a real unzipper:
 * the CRC matches, the data is intact, and nothing about it is corrupt. It is simply untrue about its
 * own size, which is exactly what the old limit check believed.
 */
function archiveWithLyingSizes(files: Array<{ name: string; data: string; declaredSize: number }>): Buffer {
  const copy = Buffer.from(writeZip(files.map((f) => ({ name: f.name, data: Buffer.from(f.data) }))));

  let eocd = copy.length - 22;
  while (eocd >= 0 && copy.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('EOCD topilmadi');
  const count = copy.readUInt16LE(eocd + 10);
  let cursor = copy.readUInt32LE(eocd + 16);

  for (let index = 0; index < count; index += 1) {
    if (copy.readUInt32LE(cursor) !== 0x02014b50) throw new Error('markaziy katalog imzosi noto‘g‘ri');
    const nameLength = copy.readUInt16LE(cursor + 28);
    const extraLength = copy.readUInt16LE(cursor + 30);
    const commentLength = copy.readUInt16LE(cursor + 32);
    copy.writeUInt32LE(files[index].declaredSize, cursor + 24);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return copy;
}

/**
 * A ZIP whose central-directory CRC field disagrees with the payload.
 *
 * Rewritten rather than corrupted in place, because flipping a byte inside deflate-compressed data
 * breaks the stream itself - the inflate fails with `invalid code lengths set` before any CRC is
 * compared, so the test would be checking the wrong refusal. Changing the stored CRC leaves the
 * payload intact and the stream valid, so the only thing wrong is the checksum, which is what the
 * CRC check exists to catch.
 */
function archiveWithWrongCrc(names: string[]): Buffer {
  const copy = Buffer.from(writeZip(names.map((name) => ({ name, data: Buffer.from(name.repeat(10)) }))));

  let eocd = copy.length - 22;
  while (eocd >= 0 && copy.readUInt32LE(eocd) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('EOCD topilmadi');
  const count = copy.readUInt16LE(eocd + 10);
  let cursor = copy.readUInt32LE(eocd + 16);

  for (let index = 0; index < count; index += 1) {
    if (copy.readUInt32LE(cursor) !== 0x02014b50) throw new Error('markaziy katalog imzosi noto‘g‘ri');
    const nameLength = copy.readUInt16LE(cursor + 28);
    const extraLength = copy.readUInt16LE(cursor + 30);
    const commentLength = copy.readUInt16LE(cursor + 32);
    if (names[index] === names.at(-1)) copy.writeUInt32LE(0xdeadbeef, cursor + 16);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return copy;
}

beforeAll(async () => {
  process.env.PRO_FETCH_PROFILE = 'full';
  workspace = mkdtempSync(path.join(tmpdir(), 'pf-zip-'));
  outputRoot = workspace;
  process.env.PRO_FETCH_OUTPUT_ROOT = outputRoot;
  process.env.PRO_FETCH_CACHE_DIR = workspace;
  await import('../src/env.js');
  await import('../src/loader.js');
  tool = (await import('../src/tools/zip/extract.js')).default;
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('ZIP ochiq hajm chegarasi haqiqiy o‘lchov bilan', () => {
  it('e’lon qilingan hajm chegaradan kichik bo‘lsa ham, haqiqiy jami oshsa — rad etadi', async () => {
    // 20 bytes of real content per entry, declared as 1 byte each. 60 entries: 60 declared, 1200 real.
    //
    // The limit cannot be set below 1024 - `Math.max(1024, ...)` floors it, so a two-entry archive with a
    // limit of 30 is silently raised to 1024 and the test would be checking a limit that was never in
    // force. Measured: `max_inflated_bytes: 30` on a 40-byte archive extracted both files. The floor
    // is deliberate, so the fixture is sized to clear it instead.
    const entryCount = 60;
    const archive = archiveWithLyingSizes(
      Array.from({ length: entryCount }, (_, index) => ({
        name: `file-${String(index).padStart(2, '0')}.txt`,
        data: 'A'.repeat(20),
        declaredSize: 1,
      })),
    );

    // Confirm the fixture is what it claims to be, so the test cannot pass for the wrong reason.
    const parsed = readZip(archive);
    const declaredTotal = parsed.entries.reduce((sum, e) => sum + e.uncompressed_size, 0);
    const actualTotal = parsed.entries.reduce((sum, e) => sum + readEntry(archive, e, 1_000_000).length, 0);
    expect(declaredTotal).toBe(entryCount);
    expect(actualTotal).toBe(entryCount * 20);

    const destination = path.join(outputRoot, 'f05-refused');
    const result = await tool.handler(
      {
        base64: archive.toString('base64'),
        out_dir: destination,
        extract: true,
        max_inflated_bytes: 1024, // the floor, and below the real total
      },
      {} as never,
    );
    const text = textOf(result);

    // The refusal must name the measured size, not the declared one. It fires as soon as the running
    // total crosses the limit - at 1040 of 1200 - which is the correct behaviour: the point of a
    // cumulative cap is to stop, not to finish counting.
    const measured = /haqiqiy ochilgan hajm (\d+) bayt/.exec(text);
    expect(measured).not.toBeNull();
    expect(Number(measured?.[1])).toBeGreaterThan(1024);
    expect(text).not.toMatch(/e’lon qilingan umumiy ochilgan hajm/);
    // Nothing on disk.
    expect(readdirSync(destination, { recursive: true })).toEqual([]);
  });

  it('chegara o‘tmaydigan arxivda yozilgan fayllar haqiqiy kontent bilan mos bo‘ladi', async () => {
    const archive = archiveWithLyingSizes([
      { name: 'a.txt', data: 'A'.repeat(20), declaredSize: 1 },
      { name: 'b.txt', data: 'B'.repeat(20), declaredSize: 1 },
    ]);
    const destination = path.join(outputRoot, 'f05-allowed');
    const result = await tool.handler(
      { base64: archive.toString('base64'), out_dir: destination, extract: true, max_inflated_bytes: 1000 },
      {} as never,
    );
    const text = textOf(result);

    expect(text).not.toMatch(/chegaradan/);
    expect(readFileSync(path.join(destination, 'a.txt'), 'utf8')).toBe('A'.repeat(20));
    expect(readFileSync(path.join(destination, 'b.txt'), 'utf8')).toBe('B'.repeat(20));
    expect(text).toMatch(/40/);
  });

  it('keyingi yozuv xato bersa, oldingi yozuvlar diskda qolmaydi', async () => {
    const archive = archiveWithWrongCrc(['first.txt', 'second.txt', 'third.txt']);

    const destination = path.join(outputRoot, 'f22-atomic');
    const result = await tool.handler(
      { base64: archive.toString('base64'), out_dir: destination, extract: true },
      {} as never,
    );
    const text = textOf(result);

    expect(text).toMatch(/CRC mos kelmadi/);
    // The whole point: the two valid entries that came before the failure do not survive it.
    expect(readdirSync(destination, { recursive: true })).toEqual([]);
  });

  it('o‘quvchi butun arxivni o‘qiydi — haqiqiy yozuvlar ham tekshiriladi', async () => {
    // The size lie is not a licence to skip real validation: a genuinely bad entry in an archive that
    // declares its size correctly is still refused.
    const archive = archiveWithWrongCrc(['ok.txt', 'bad.txt']);

    const destination = path.join(outputRoot, 'f22-crc-still-checked');
    const result = await tool.handler(
      { base64: archive.toString('base64'), out_dir: destination, extract: true },
      {} as never,
    );
    expect(textOf(result)).toMatch(/CRC mos kelmadi/);
    expect(readdirSync(destination, { recursive: true })).toEqual([]);
  });
});
