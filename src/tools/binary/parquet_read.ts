import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { describeParquet, readParquetRows, toArrayBuffer } from './_parquet.js';

export default defineTool({
  name: 'pro_binary_parquet_read',
  description:
    'Parquet faylini o‘qish: sxema (ustun nomlari va tiplari), qatorlar soni, bloklar soni va ' +
    'qatorlar. Parquet o‘zida sxemasini saqlaydi — alohida sxema kerak emas. 64-bit ustunlar matn ' +
    'sifatida qaytariladi, aniqlik yo‘qotilmasligi uchun.',
  category: 'binary',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Parquet fayl URL i' },
      base64: { type: 'string', description: 'Parquet fayl base64' },
      data_base64: { type: 'string', description: 'Parquet fayl base64 (boshqa yozuv)' },
      rows: { type: 'number', description: 'Qancha qator qaytarilsin (standart 20)' },
      columns: { type: 'array', items: { type: 'string' }, description: 'Faqat shu ustunlarni olish' },
      schema_only: { type: 'boolean', description: 'Faqat sxema va hisoblar (qatorlarni o‘qimaydi)' },
      max_bytes: { type: 'number', description: 'Fayl hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const limit = num(p, 'rows', 20, 1, 100_000);
    const schemaOnly = p.schema_only === true || String(p.schema_only ?? '') === 'true';
    const columns = Array.isArray(p.columns)
      ? (p.columns as unknown[]).filter((c): c is string => typeof c === 'string')
      : undefined;

    try {
      const source = await readBinarySource(input, 'Parquet faylni o‘qish');
      const file = toArrayBuffer(source);
      const described = await describeParquet(file);

      // A file that parses but reports no rows *and* no columns is not an empty Parquet file; it is a
      // file the reader could not make sense of. Saying "0 rows" for it would be the silent zero this
      // tool exists to avoid.
      if (described.num_rows === 0 && described.schema.fields.length === 0) {
        return fail(
          `Parquet fayli ${source.length} bayt, lekin undan hech qanday ustun yoki qator o‘qilmadi. ` +
            'Fayl buzilgan yoki Parquet emas.',
        );
      }

      if (schemaOnly) {
        return jsonBlock('Parquet sxemasi', {
          bytes: source.length,
          ...described,
          rows_returned: 0,
        });
      }

      const fields = described.schema.fields;
      // A requested column that is not in the file would otherwise come back as an absent key in
      // every row, which reads as "no data" rather than "that column does not exist".
      const missing = (columns ?? []).filter((name) => !fields.some((f) => f.name === name));
      if (missing.length > 0) {
        return fail(
          `Ustun topilmadi: ${missing.join(', ')}. Mavjud ustunlar: ${fields.map((f) => f.name).join(', ') || '(yo‘q)'}.`,
        );
      }

      const rows = await readParquetRows(file, limit, columns);
      return jsonBlock('Parquet o‘qildi', {
        bytes: source.length,
        ...described,
        rows_returned: rows.length,
        truncated: described.num_rows > rows.length,
        rows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/PAR1|magic|invalid|not a parquet|unexpected end|checksum|end of file/i.test(message)) {
        return fail(`Bu Parquet fayli emas yoki buzilgan: ${message.slice(0, 160)}`);
      }
      return fail(`Parquet o‘qib bo‘lmadi: ${message}`);
    }
  },
});
