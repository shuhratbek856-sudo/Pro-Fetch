import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';

export default defineTool({
  name: 'pro_binary_arrow_ipc_read',
  description:
    'Arrow IPC/Feather faylini o‘qish: sxema (ustunlar va tiplar), qatorlar soni va qatorlar. ' +
    'Arrow fayl o‘zida sxemasini saqlaydi. Stream va fayl formatlarining ikkalasi ham o‘qiladi.',
  category: 'binary',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Arrow fayl URL i' },
      base64: { type: 'string', description: 'Arrow fayl base64' },
      data_base64: { type: 'string', description: 'Arrow fayl base64 (boshqa yozuv)' },
      rows: { type: 'number', description: 'Qancha qator qaytarilsin (standart 20)' },
      columns: { type: 'array', items: { type: 'string' }, description: 'Faqat shu ustunlarni olish' },
      max_bytes: { type: 'number', description: 'Fayl hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const limit = num(p, 'rows', 20, 1, 100_000);
    const wanted = Array.isArray(p.columns)
      ? (p.columns as unknown[]).filter((c): c is string => typeof c === 'string')
      : undefined;

    try {
      const source = await readBinarySource(input, 'Arrow faylni o‘qish');
      const arrow = await import('apache-arrow');
      // `tableFromIPC` handles both the stream and file layouts; the file layout adds padding around
      // each buffer, and guessing wrong produces a decoder error rather than a readable message.
      let table = arrow.tableFromIPC(source) as {
        numRows: number;
        schema?: { fields?: Array<{ name: string; type: string }> };
        getChild?: (name: string) => { toArray(): unknown[] } | null;
        toArray?: () => unknown[];
      };

      const fields = table.schema?.fields ?? [];
      const missing = (wanted ?? []).filter((name) => !fields.some((f) => f.name === name));
      if (missing.length > 0) {
        return fail(
          `Ustun topilmadi: ${missing.join(', ')}. Mavjud: ${fields.map((f) => f.name).join(', ') || '(yo‘q)'}.`,
        );
      }
      if (wanted && wanted.length > 0) {
        table = (table as unknown as { select: (names: string[]) => typeof table }).select(wanted);
      }

      const selected = (table.schema?.fields ?? []).map((f) => f.name);
      const columnsData: Record<string, unknown[]> = {};
      for (const name of selected) {
        const child = typeof table.getChild === 'function' ? table.getChild(name) : null;
        if (child) columnsData[name] = child.toArray();
      }

      const rows: Array<Record<string, unknown>> = [];
      if (Object.keys(columnsData).length > 0) {
        const height = Math.max(...Object.values(columnsData).map((a) => a.length));
        for (let index = 0; index < Math.min(height, limit); index++) {
          const row: Record<string, unknown> = {};
          for (const name of selected) row[name] = columnsData[name]?.[index] ?? null;
          rows.push(row);
        }
      } else {
        const all = typeof table.toArray === 'function' ? table.toArray() : [];
        for (const value of all.slice(0, limit)) {
          rows.push(value && typeof value === 'object' ? (value as Record<string, unknown>) : { value });
        }
      }

      return jsonBlock('Arrow o‘qildi', {
        bytes: source.length,
        num_rows: table.numRows ?? rows.length,
        columns: (table.schema?.fields ?? []).map((f) => ({ name: f.name, type: f.type })),
        rows_returned: rows.length,
        truncated: (table.numRows ?? 0) > rows.length,
        rows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Arrow's decoder reports a bad prefix by announcing the length it expected to read, which
      // matches none of the obvious words - so the message is matched on that too.
      if (/magic|ARROW|not an Arrow|invalid|prefix|Expected to read/i.test(message)) {
        return fail(`Bu Arrow fayli emas yoki buzilgan: ${message.slice(0, 160)}`);
      }
      return fail(`Arrow o‘qib bo‘lmadi: ${message}`);
    }
  },
});
