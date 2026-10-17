import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { bool, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { readEntry, readZip, type ZipEntry } from './_zip.js';

export default defineTool({
  name: 'pro_zip_verify',
  description:
    'ZIP butunligini tekshirish: har bir yozuv ochilib CRC hisoblanadi va markaziy katalogdagi ' +
    'qiymat bilan solishtiriladi. Markaziy katalog o‘zi ham tekshiriladi - u ataylab o‘zgartirilgan ' +
    'bo‘lishi mumkin.',
  category: 'zip',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ZIP fayl URL i' },
      base64: { type: 'string', description: 'ZIP fayl base64' },
      data_base64: { type: 'string', description: 'ZIP fayl base64 (boshqa yozuv)' },
      deep: { type: 'boolean', description: 'Haqiqatan ham ochib, har bir baytni CRC qilish' },
      max_bytes: { type: 'number', description: 'Yuklab olish hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const deep = bool(p, 'deep', false);

    const data = await readBinarySource(input, 'ZIP faylni tekshirish');
    if (data.length === 0) return fail('ZIP fayl bo‘sh.');

    let archive;
    try {
      archive = readZip(data);
    } catch (error) {
      return fail(`ZIP o‘qilmadi: ${(error as Error).message}`);
    }

    // Header-level checks come first and are cheap: a name that escapes the destination is a defect
    // whether or not the bytes behind it are intact, and the caller needs to hear about it even when
    // `deep` is off.
    const suspicious: Array<{ name: string; problem: string }> = [];
    for (const entry of archive.entries) {
      if (entry.name.includes('..') || entry.name.startsWith('/') || /^[A-Za-z]:/.test(entry.name)) {
        suspicious.push({ name: entry.name, problem: 'nom ichki yo‘lni tashqariga chiqishga urinilgan' });
      }
      if (entry.uncompressed_size > entry.compressed_size * 1000 && entry.uncompressed_size > 50 * 1024 * 1024) {
        suspicious.push({
          name: entry.name,
          problem: `siqish nisbati ${Math.round(entry.uncompressed_size / Math.max(1, entry.compressed_size))}:1 - bomba imkonati`,
        });
      }
    }

    const bad: Array<{ name: string; problem: string }> = [];
    const checked: Array<{ name: string; bytes: number }> = [];
    let verifiedBytes = 0;

    for (const entry of archive.entries as ZipEntry[]) {
      if (entry.is_directory) continue;
      if (!deep) continue;
      try {
        const content = readEntry(data, entry);
        verifiedBytes += content.length;
        // `readEntry` already refuses a CRC mismatch, so recomputing it here would test the same
        // thing twice against the same number. What it cannot check is the *size*: a header can
        // declare an uncompressed length the data does not have, and only reading the bytes proves it.
        if (content.length !== entry.uncompressed_size) {
          bad.push({
            name: entry.name,
            problem: `o‘lchangan ${content.length} bayt, katalogda ${entry.uncompressed_size} deb yozilgan`,
          });
          continue;
        }
        checked.push({ name: entry.name, bytes: content.length });
      } catch (error) {
        bad.push({ name: entry.name, problem: (error as Error).message });
      }
    }

    const verdict =
      bad.length === 0 && suspicious.length === 0 ? 'butun' : bad.length > 0 ? 'buzilgan' : 'ogohlantirish bilan';

    return jsonBlock(`ZIP: ${verdict}`, {
      verdict,
      entries: archive.entries.length,
      deep,
      verified_entries: checked.length,
      verified_bytes: verifiedBytes,
      bad_entries: bad.length > 0 ? bad.slice(0, 20) : undefined,
      suspicious_entries: suspicious.length > 0 ? suspicious.slice(0, 20) : undefined,
      note: deep
        ? undefined
        : 'deep=false: faqat sarlavhalar tekshirildi, baytlar ochilmadi. CRC ni ishonchli tekshirish uchun deep=true.',
    });
  },
});
