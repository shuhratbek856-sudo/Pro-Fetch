import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { arr, asRecord, bool, strOrEmpty, view } from '../../core/input.js';
import { outputFileName } from '../../core/output-dir.js';
import type { OutputKind } from '../../core/output-dir.js';
import { readZip, summarise, toDosDateTime, writeZip } from './_zip.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Hard ceiling on a single entry, independent of what the caller asks for. */
const MAX_ENTRY_BYTES = 256 * 1024 * 1024;

export default defineTool({
  name: 'pro_zip_create',
  description:
    'Fayllardan ZIP arxiv yaratish: har biriga nom va matn yoki base64. Siqish haqiqiy taqqoslashdan ' +
    'keyin tanlanadi, shuning uchun qisqa yoki allaqachon siqilgan ma’lumot yig‘ilib qolmaydi.',
  category: 'zip',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'Fayllar ro‘yxati: [{ "name": "a.txt", "text": "..." }] yoki { "name", "base64" }',
        items: { type: 'object' },
      },
      comment: { type: 'string', description: 'Arxiv izohi' },
      date: { type: 'string', description: 'Fayllarga qo‘yiladigan sana (ISO), standart: hozir' },
      store: { type: 'boolean', description: 'Siqmasdan saqlash (tez, lekin kattaroq)' },
      save: { type: 'boolean', description: 'Arxivni fayl sifatida ham saqlash' },
    },
    required: ['files'],
  },
  async handler(input) {
    const p = view(input);
    const entries = arr(p, 'files');
    if (entries.length === 0) return fail('files bo‘sh: kamida bitta fayl kerak.');
    if (entries.length > 5000) return fail(`5000 dan ortiq fayl berildi (${entries.length}).`);

    const comment = strOrEmpty(p, 'comment');
    const store = bool(p, 'store', false);
    const save = bool(p, 'save', false);
    const dateText = strOrEmpty(p, 'date');

    let stamp = toDosDateTime(new Date());
    if (dateText) {
      const parsed = Date.parse(dateText);
      // A date that does not parse would otherwise become `NaN`, which the bit-packing below turns
      // into year 0 - and every reader would show 1980 without a word.
      if (!Number.isFinite(parsed)) return fail(`sana tushunilmadi: "${dateText}".`);
      stamp = toDosDateTime(new Date(parsed));
    }

    const prepared: Array<{ name: string; data: Buffer }> = [];
    for (const [index, raw] of entries.entries()) {
      const record = asRecord(raw);
      if (!record) return fail(`files[${index}] obyekt emas.`);
      const name = String(record.name ?? '').trim();
      if (!name) return fail(`files[${index}].name bo‘sh.`);

      let data: Buffer;
      const text = record.text;
      const base64 = typeof record.base64 === 'string' ? record.base64 : '';
      if (typeof text === 'string') {
        data = Buffer.from(text, 'utf8');
      } else if (base64) {
        const normalised = base64.replace(/\s+/g, '');
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalised)) {
          return fail(`files[${index}].base64 noto‘g‘ri.`);
        }
        data = Buffer.from(normalised, 'base64');
      } else {
        return fail(`files[${index}] da ham text ham base64 kerak.`);
      }
      if (data.length > MAX_ENTRY_BYTES) {
        return fail(`files[${index}] hajmi ${data.length} bayt, bitta fayl chegarasidan (${MAX_ENTRY_BYTES}) ko‘p.`);
      }
      prepared.push({ name, data });
    }

    const archive = writeZip(
      prepared.map((entry) => ({
        name: entry.name,
        data: entry.data,
        method: store ? 0 : 8,
        dos_date: stamp.date,
        dos_time: stamp.time,
      })),
      comment,
    );

    // Read back what was actually written, rather than trusting the inputs: this reports the method and
    // the CRC the archive really contains, and catches a writer that disagrees with itself.
    const written = readZip(archive);
    const summary = summarise(written);

    const result: Record<string, unknown> = {
      files: summary.files,
      directories: summary.directories,
      uncompressed_bytes: summary.uncompressed_bytes,
      archive_bytes: archive.length,
      compression_ratio: summary.compression_ratio,
      methods: summary.methods,
      comment: comment || undefined,
      stored_uncompressed: store ? 'siqish yo‘q (store)' : undefined,
      entries: written.entries.map((entry) => ({
        name: entry.name,
        method: entry.method === 0 ? 'store' : 'deflate',
        compressed_bytes: entry.compressed_size,
        uncompressed_bytes: entry.uncompressed_size,
      })),
      base64: archive.toString('base64'),
    };

    if (save) {
      const target = outputFileName('zip-out' as OutputKind, 'zip');
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, archive);
      result.path = target;
    }

    return jsonBlock('ZIP yaratildi', result);
  },
});
