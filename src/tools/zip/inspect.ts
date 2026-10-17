import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { bool, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { readZip, summarise, type ZipEntry } from './_zip.js';

export default defineTool({
  name: 'pro_zip_inspect',
  description:
    'ZIP arxivni tekshirish: yozuvlar soni, siqilgan va ochilgan hajm, siqish usuli, eng katta ' +
    'fayllar, izoh. Hech narsa yozilmaydi va ochilmaydi - arxiv shikol emasligi tekshiriladi.',
  category: 'zip',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ZIP fayl URL i' },
      base64: { type: 'string', description: 'ZIP fayl base64' },
      data_base64: { type: 'string', description: 'ZIP fayl base64 (boshqa yozuv)' },
      list: { type: 'boolean', description: 'Barcha yozuvlarni ro‘yxat qilish (standart: 50 ta)' },
      limit: { type: 'number', description: 'Ro‘yxatda ko‘pi bilan shuncha yozuv (standart 50)' },
      max_bytes: { type: 'number', description: 'Yuklab olish hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const listAll = bool(p, 'list', false);
    const limitValue = Number(p.limit ?? 50);
    const limit = Math.max(1, Math.min(Number.isFinite(limitValue) ? Math.floor(limitValue) : 50, 5000));

    const data = await readBinarySource(input, 'ZIP faylni o‘qish');
    if (data.length === 0) return fail('ZIP fayl bo‘sh.');

    let archive;
    try {
      archive = readZip(data);
    } catch (error) {
      return fail(`ZIP o‘qilmadi: ${(error as Error).message}`);
    }
    if (archive.entries.length === 0) return fail('arxiv ichida hech qanday yozuv yo‘q.');

    const summary = summarise(archive);
    const shown: ZipEntry[] = listAll ? archive.entries : archive.entries.slice(0, limit);

    return jsonBlock('ZIP arxiv', {
      entries: summary.entries,
      files: summary.files,
      directories: summary.directories,
      compressed_bytes: summary.compressed_bytes,
      uncompressed_bytes: summary.uncompressed_bytes,
      compression_ratio: summary.compression_ratio,
      methods: summary.methods,
      largest: summary.largest,
      archive_bytes: data.length,
      comment: archive.comment || undefined,
      zip64: archive.zip64 ? 'markaziy katalog 32-bit chegarasini oshgan (ZIP64)' : undefined,
      warning:
        summary.total_entries_over_limit > 0
          ? 'Ochilgan hajm siqilgan hajmdan 1000 baravar katta. Bu normal siqish emas - arxiv ' +
            'diskni to‘ldirishga qaratilgan bo‘lishi mumkin. Ochishdan oldin o‘lchovni tekshiring.'
          : undefined,
      listed: shown.length,
      truncated:
        archive.entries.length > shown.length ? `yana ${archive.entries.length - shown.length} ta bor` : undefined,
      list: shown.map((entry) => ({
        name: entry.name,
        directory: entry.is_directory,
        method: entry.method === 0 ? 'store' : entry.method === 8 ? 'deflate' : `method_${entry.method}`,
        compressed_bytes: entry.compressed_size,
        uncompressed_bytes: entry.uncompressed_size,
        comment: entry.comment || undefined,
      })),
    });
  },
});
