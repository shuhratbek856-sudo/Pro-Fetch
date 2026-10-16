import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, str, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { decodeAvro, readContainerHeader } from './_avro.js';

export default defineTool({
  name: 'pro_binary_avro_read',
  description:
    'Avro faylini o‘qish: yozuvlar, sxema va kodek. Object Container fayl (boshida "Obj") ' +
    'o‘zida sxemasini saqlaydi — unda "schema" berish shart emas. Xom Avro qiymat (konteynersiz) ' +
    'uchun "schema" majburiy.',
  category: 'binary',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Avro fayl URL i' },
      base64: { type: 'string', description: 'Avro fayl base64' },
      data_base64: { type: 'string', description: 'Avro fayl base64 (boshqa yozuv)' },
      schema: {
        type: 'string',
        description: 'Avro sxemasi JSON — konteyner faylda shart emas, xom qiymatda majburiy',
      },
      records: { type: 'number', description: 'Qancha yozuv qaytarilsin (standart 20)' },
      max_bytes: { type: 'number', description: 'Fayl hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const rawSchema = (str(p, 'schema', '') ?? str(p, 'schema_json', '') ?? '').trim();
    const limit = num(p, 'records', 20, 1, 100_000);

    let schema: unknown = null;
    if (rawSchema) {
      try {
        schema = JSON.parse(rawSchema);
      } catch (error) {
        // The schema is hand-written, so a missing comma is the usual cause and the parser's position
        // is the useful part of the message.
        return fail(`Sxema JSON emas: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    try {
      const source = await readBinarySource(input, 'Avro faylni o‘qish');
      const header = readContainerHeader(source);
      if (header.layout === 'raw' && schema === null) {
        return fail(
          'Bu konteyner fayl emas (boshida "Obj" yo‘q) va sxema berilmagan. ' +
            'Xom Avro qiymatni o‘qish uchun "schema" argumenti zarur.',
        );
      }

      const decoded = await decodeAvro(source, schema, limit);
      const embedded = decoded.embedded_schema as { name?: string } | null;

      return jsonBlock('Avro o‘qildi', {
        bytes: source.length,
        layout: decoded.layout,
        codec: decoded.codec,
        block_count: decoded.block_count,
        schema_name: embedded?.name ?? null,
        // The file's own schema is reported when it has one, because that is the schema its bytes
        // encode. A caller's schema is only needed for a bare value.
        schema: decoded.embedded_schema ?? schema ?? null,
        records_returned: decoded.records.length,
        records: decoded.records,
        metadata_keys: Object.keys(decoded.metadata),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/schema|Avro|konteyner/i.test(message)) {
        return fail(`Avro o‘qib bo‘lmadi: ${message.slice(0, 200)}`);
      }
      return fail(`Avro o‘qib bo‘lmadi: ${message}`);
    }
  },
});
