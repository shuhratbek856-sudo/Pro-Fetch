import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { bool, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { outputRoot } from '../../core/output-dir.js';
import { DEFAULT_MAX_INFLATED_BYTES, entryPath, readEntry, readZip, writeZip, type ZipEntry } from './_zip.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { assertWritablePath, isInside, realResolve } from '../../core/path-containment.js';
import { assertWritable } from '../../core/read-only-guard.js';
import path from 'node:path';

export default defineTool({
  name: 'pro_zip_extract',
  description:
    'ZIP arxivni ochish: har bir yozuv tekshiriladi (yo‘l chegarasi, ochilgan hajm chegarasi, CRC) va ' +
    'faqat shundan keyin yoziladi. "..", mutlaq yo‘l va Windows drayver harfi tozalanadi. ' +
    'Barcha fayllarni bitta arxivga qayta yig‘ish ham mumkin.',
  category: 'zip',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ZIP fayl URL i' },
      base64: { type: 'string', description: 'ZIP fayl base64' },
      data_base64: { type: 'string', description: 'ZIP fayl base64 (boshqa yozuv)' },
      out_dir: { type: 'string', description: 'Chiqish papkasi (chiqish sandboxi ichida bo‘lishi shart)' },
      extract: {
        type: 'boolean',
        // This said the default was yes while the code read `bool(p, 'extract', false)`. A caller who
        // sent only `out_dir` - which reads like "put it here" - got "hech nima qilinmadi: extract yoki
        // repack true bo'lishi kerak". Writing to disk is not something to turn on by omission.
        description: 'Fayllarni diskka yozish (standart: yo‘q; out_dir berilsa ham o‘zi yoqmaydi)',
      },
      repack: { type: 'boolean', description: 'Barcha fayllarni tozalangan arxivga qayta yig‘ish' },
      include: { type: 'string', description: 'Faqat shu nomlarni ochish, qo‘shimcha kabi' },
      max_bytes: { type: 'number', description: 'Arxiv hajm chegarasi' },
      max_inflated_bytes: { type: 'number', description: 'Jami ochilgan hajm chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const extract = bool(p, 'extract', false);
    const repack = bool(p, 'repack', false);
    const outDir = String(p.out_dir ?? '');
    const include = String(p.include ?? '');
    const inflatedLimitValue = Number(p.max_inflated_bytes ?? DEFAULT_MAX_INFLATED_BYTES);
    const inflatedLimit = Math.max(
      1024,
      Math.min(
        Number.isFinite(inflatedLimitValue) ? Math.floor(inflatedLimitValue) : DEFAULT_MAX_INFLATED_BYTES,
        2 * 1024 * 1024 * 1024,
      ),
    );

    if (!extract && !repack) {
      return fail('hech nima qilinmadi: extract yoki repack true bo‘lishi kerak.');
    }

    const data = await readBinarySource(input, 'ZIP faylni ochish');
    if (data.length === 0) return fail('ZIP fayl bo‘sh.');

    let archive;
    try {
      archive = readZip(data);
    } catch (error) {
      return fail(`ZIP o‘qilmadi: ${(error as Error).message}`);
    }

    // Resolve the destination and prove it is inside the output root *before* any write, so a
    // traversal is refused rather than cleaned up afterwards.
    let destination = outputRoot();
    if (outDir) {
      destination = path.resolve(outDir);
      // The central containment check, rather than a hand-written comparison here. Two reasons, both
      // measured: this block compared `path.relative` without resolving symlinks, so a linked
      // directory inside the root still wrote through it; and it never asked whether writing is
      // permitted at all, so under `PRO_FETCH_READ_ONLY=true` this tool extracted to disk and answered
      // `isError: false`.
      assertWritablePath(destination, 'out_dir', 'arXivni ochish');
    } else if (extract) {
      // The default destination asked nothing, because the check lived in the `out_dir` branch above
      // and this branch only runs when `out_dir` is absent. Measured: `pro_zip_extract` with
      // `{ extract: true }` and no `out_dir` under `PRO_FETCH_READ_ONLY=true` wrote into the output
      // root and reported success. The default path is a path, not an exemption from the policy.
      assertWritable('arXivni ochish');
    }
    if (extract) await mkdir(destination, { recursive: true });

    const written: Array<{ path: string; bytes: number }> = [];
    const contained: Array<{ name: string; safe_path: string }> = [];
    const skipped: Array<{ name: string; reason: string }> = [];
    // The inflated bytes are kept, not re-read for the repack: calling `readEntry` a second time
    // decompressed every entry twice and doubled the work and the memory for no reason.
    const matched: Array<{ entry: ZipEntry; safe: string; content: Buffer }> = [];
    let totalInflated = 0;

    // ---- Phase one: validate and inflate. Nothing is written here. ------------------------------
    //
    // Two defects came from writing inside this loop, and both are fixed by separating the phases.
    //
    // The total-size limit trusted the archive's own arithmetic. `totalInflated + entry.uncompressed_size`
    // is read from the central directory, which is attacker-controlled, while `totalInflated` was
    // incremented with the real inflated length and never re-compared against the limit. Measured
    // with an in-memory archive of two entries whose headers both declared `uncompressed_size = 1`
    // and whose real content was 20 bytes each: the limit check saw 2 bytes, the tool wrote 40, and
    // answered success. A limit that can be declared rather than measured is not a limit.
    //
    // A failure part-way through left earlier entries on disk. Entry 5's CRC error returned "arXivni
    // ochmading" while entries 1-4 stayed in the output directory. The result said nothing was
    // extracted; the filesystem disagreed.
    for (const entry of archive.entries) {
      if (include && !entry.name.includes(include)) {
        skipped.push({ name: entry.name, reason: 'include filtriga mos kelmadi' });
        continue;
      }
      const safe = entryPath(entry.name);
      if (safe.contained) contained.push({ name: entry.name, safe_path: safe.path });
      if (safe.path === '') {
        skipped.push({ name: entry.name, reason: 'tozalangandan keyin nom qolmadi' });
        continue;
      }
      // Kept as a cheap early rejection, because it costs nothing and refuses an archive that
      // declares itself too large. It is not the check that enforces the limit - the one below is.
      if (totalInflated + entry.uncompressed_size > inflatedLimit) {
        return fail(
          `${entry.name}: e'lon qilingan umumiy ochilgan hajm ${totalInflated + entry.uncompressed_size} bayt ` +
            `chegaradan (${inflatedLimit}) oshadi. Arxivni ochmading.`,
        );
      }

      let content: Buffer;
      try {
        content = readEntry(data, entry, inflatedLimit);
      } catch (error) {
        // `readEntry` already prefixes its message with the entry name, so adding it here produced
        // "hello.txt: hello.txt: CRC mos kelmadi" - measured, not assumed.
        return fail((error as Error).message);
      }
      totalInflated += content.length;
      // The limit is enforced on measured bytes, after the inflate. `maxOutputLength` inside
      // `readEntry` bounds a single entry; this bounds the sum, which is the quantity the caller
      // actually asked to be limited and the quantity the memory use follows.
      if (totalInflated > inflatedLimit) {
        return fail(
          `${entry.name}: haqiqiy ochilgan hajm ${totalInflated} bayt chegaradan (${inflatedLimit}) oshdi ` +
            `(shu yozuv o'zidan oldin ${totalInflated - content.length} bayt edi). Arxivni ochmading.`,
        );
      }
      matched.push({ entry, safe: safe.path, content });
    }

    if (matched.length === 0) {
      return fail('include filtriga mos keladigan yozuv topilmadi.');
    }

    // ---- Phase two: resolve every target, then write. --------------------------------------------
    //
    // Every path is checked before the first byte is written, so a refusal on the last entry cannot
    // leave the earlier ones behind. Measured before this change: an archive whose fifth entry named
    // a directory that was a symlink out of the destination wrote entries 1-4 and then reported that
    // nothing was extracted.
    if (extract) {
      const resolvedDestination = realResolve(destination);
      const targets: Array<{ name: string; safe: string; target: string; content: Buffer }> = [];
      for (const { entry, safe, content } of matched) {
        const target = path.resolve(destination, safe);
        // Per-entry containment, against the *resolved* destination.
        //
        // `safe` has no `..` and is relative, which is enough while the destination is a fresh
        // directory - and a fresh directory was the only case the earlier test covered. Measured:
        // with a symlink already inside the destination pointing elsewhere, an archive containing
        // `portal/stolen.txt` wrote `stolen.txt` outside the destination, answered `isError: false`,
        // and reported one entry extracted successfully.
        //
        // `realResolve` follows the link on the deepest ancestor that exists, so this compares
        // against where the file would actually land rather than where the path spells out.
        if (!isInside(resolvedDestination, target)) {
          return fail(
            entry.name +
              ': yoziladigan joy ' +
              realResolve(target) +
              ' chiqish papkasi ' +
              resolvedDestination +
              ' dan tashqarida - hech narsa yozilmadi. Sabab: chiqish papkasining ichida boshqa joyga ko‘rsatuvchi symlink bor.',
          );
        }
        targets.push({ name: entry.name, safe, target, content });
      }
      for (const { target, content } of targets) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
        written.push({ path: target, bytes: content.length });
      }
    }

    const result: Record<string, unknown> = {
      archive_entries: archive.entries.length,
      processed: matched.length,
      inflated_bytes: totalInflated,
      extracted: written.length,
      destination: extract ? destination : undefined,
      contained_paths_fixed: contained.length,
      // Named separately from `skipped` because a renamed entry is still written - a caller that only
      // looked at the skip list would assume the original name was used.
      renamed: contained.length > 0 ? contained.slice(0, 20) : undefined,
      skipped: skipped.length > 0 ? skipped.slice(0, 20) : undefined,
      files: written.slice(0, 50).map((entry) => ({ path: entry.path, bytes: entry.bytes })),
    };

    if (repack) {
      const repacked = writeZip(
        matched.map(({ entry, safe, content }) => ({
          name: safe,
          data: content,
          dos_date: entry.dos_date,
          dos_time: entry.dos_time,
        })),
      );
      result.repacked_bytes = repacked.length;
      result.repacked_base64 = repacked.toString('base64');
    }

    return jsonBlock('ZIP ochildi', result);
  },
});
