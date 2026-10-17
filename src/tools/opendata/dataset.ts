import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { bool, strOrEmpty, view } from '../../core/input.js';
import { datasetMeta, parseReference, resolveDataset } from './_opendata.js';

export default defineTool({
  name: 'pro_opendata_dataset',
  description:
    'Dataset haqida ma’lumot: nomi, tavsifi, qatorlar soni, yangilangan vaqti va barcha ustunlari ' +
    'tur bilan. Dataset id, permalink yoki SODA manzili bilan chaqiriladi.',
  category: 'opendata',
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'Dataset id, permalink yoki SODA manzili' },
      columns: { type: 'boolean', description: 'Ustunlarni batafsil ro‘yxat qilish' },
    },
    required: ['dataset'],
  },
  async handler(input) {
    const p = view(input);
    const reference = parseReference(strOrEmpty(p, 'dataset'));
    if ('error' in reference) return jsonBlock('Dataset', { error: reference.error });

    const resolved = await resolveDataset(reference.id, reference.domain);
    if (!resolved.ok) return jsonBlock('Dataset', { id: reference.id, error: resolved.message });

    const meta = await datasetMeta(resolved.domain, reference.id);
    if (!meta.ok) return jsonBlock('Dataset', { id: reference.id, domain: resolved.domain, error: meta.message });

    const value = meta.value;
    const columns = Array.isArray(value.columns) ? (value.columns as Array<Record<string, unknown>>) : [];
    const withColumns = p.columns === true || String(p.columns ?? '') === 'true';

    return jsonBlock(`Dataset: ${String(value.name ?? reference.id)}`, {
      id: reference.id,
      domain: resolved.domain,
      name: value.name,
      description: value.description ? String(value.description).replace(/\s+/g, ' ').trim() : undefined,
      attribution: value.attribution ?? undefined,
      permalink: resolved.permalink ?? `https://${resolved.domain}/d/${reference.id}`,
      // `rowsUpdatedAt` is a timestamp, not a count. The metadata endpoint does not report how many
      // rows a dataset holds, and the two are not interchangeable: the first version of this tool
      // printed `viewCount` under the key `row_count`, which reads as a row total and is a count of
      // page views instead. The honest answer is that it has to be asked for, and SoQL can answer it.
      rows_updated_at: value.rowsUpdatedAt ?? undefined,
      metadata_updated_at: value.metadataUpdatedAt ?? undefined,
      columns_total: columns.length,
      view_type: value.viewType ?? undefined,
      columns: withColumns
        ? columns.map((column) => ({
            name: column.name,
            field_name: column.fieldName,
            type: column.dataTypeName ?? column.dataType,
            description: column.description ? String(column.description).replace(/\s+/g, ' ').trim() : undefined,
          }))
        : undefined,
      row_count_hint: 'Qatorlar soni metama’lumotda yo‘q - pro_opendata_count yoki pro_opendata_rows bilan so‘rang.',
    });
  },
});
