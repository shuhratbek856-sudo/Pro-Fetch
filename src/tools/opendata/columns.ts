import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { datasetMeta, parseReference, resolveDataset, soqlIdentifier, sodaRows } from './_opendata.js';

export default defineTool({
  name: 'pro_opendata_columns',
  description:
    'Dataset ustunlarini tekshirish: nomi, turi, bo‘sh qiymatlar soni, turli qiymatlar soni va ' +
    'eng ko‘p uchraydigan qiymatlar. Har bir ustun alohida SoQL so‘rovi bilan - katta datasetda ' +
    'sekin bo‘lishi tabiiy.',
  category: 'opendata',
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'Dataset id, permalink yoki SODA manzili' },
      column: { type: 'string', description: 'Faqat shu ustunni tekshirish (bo‘sh bo‘lsa: barchasi)' },
      top: { type: 'number', description: 'Har bir ustun uchun eng ko‘p qiymatlar soni (standart 5)' },
      limit: { type: 'number', description: 'Nechta ustun tekshirilsin (standart 10)' },
      only_list: { type: 'boolean', description: 'Faqat ro‘yxat qilish, SoQL so‘rovi yubormaslik' },
    },
    required: ['dataset'],
  },
  async handler(input) {
    const p = view(input);
    const reference = parseReference(strOrEmpty(p, 'dataset'));
    if ('error' in reference) return jsonBlock('Ustunlar', { error: reference.error });

    const resolved = await resolveDataset(reference.id, reference.domain);
    if (!resolved.ok) return jsonBlock('Ustunlar', { id: reference.id, error: resolved.message });

    const meta = await datasetMeta(resolved.domain, reference.id);
    if (!meta.ok) {
      return jsonBlock('Ustunlar', { id: reference.id, domain: resolved.domain, error: meta.message });
    }
    const columns = Array.isArray(meta.value.columns) ? (meta.value.columns as Array<Record<string, unknown>>) : [];

    const wanted = strOrEmpty(p, 'column');
    const limit = Math.max(1, Math.min(num(p, 'limit', 10) || 10, 60));
    const top = Math.max(1, Math.min(num(p, 'top', 5) || 5, 50));
    const onlyList = p.only_list === true || String(p.only_list ?? '') === 'true';

    const selected = wanted
      ? columns.filter((column) =>
          [String(column.name ?? ''), String(column.fieldName ?? '')].some(
            (name) => name.toLowerCase() === wanted.toLowerCase(),
          ),
        )
      : columns;

    if (selected.length === 0) {
      const available = columns.map((column) => String(column.fieldName ?? column.name ?? ''));
      return jsonBlock('Ustunlar', {
        id: reference.id,
        error: wanted ? `"${wanted}" nomli ustun topilmadi.` : 'Metama’lumotda ustunlar yo‘q.',
        available,
      });
    }

    const listed = selected.slice(0, limit).map((column) => ({
      name: column.name,
      field_name: column.fieldName,
      type: column.dataTypeName ?? column.dataType,
      description: column.description ? String(column.description).replace(/\s+/g, ' ').trim() : undefined,
    }));

    if (onlyList) {
      return jsonBlock(`Ustunlar: ${reference.id}`, {
        id: reference.id,
        domain: resolved.domain,
        total: columns.length,
        shown: listed.length,
        columns: listed,
      });
    }

    const profiled: Array<Record<string, unknown>> = [];
    const failed: Array<{ field_name: string; reason: string }> = [];

    for (const column of listed) {
      // `listed` is the projected shape built above, so the fields are snake_case here. Reading
      // `column.fieldName` and `column.dataTypeName` - the names the raw metadata uses - compiled to a
      // `string | undefined` from nothing at best and to nothing at all at worst.
      const fieldName = String(column.field_name ?? '');
      if (!fieldName) {
        failed.push({ field_name: String(column.name ?? ''), reason: 'field_name yo‘q' });
        continue;
      }
      const identifier = soqlIdentifier(fieldName);
      const entry: Record<string, unknown> = {
        field_name: fieldName,
        name: column.name,
        type: column.type,
      };

      // Distinct count: a dataset that is too large for a full group-by answers with an error rather
      // than a wrong number, and that error is reported per column instead of failing the whole call.
      const distinct = await sodaRows(resolved.domain, reference.id, {
        $select: `${identifier},count(*)`,
        $group: identifier,
        $order: 'count DESC',
        $limit: String(top),
      });
      if (!distinct.ok) {
        failed.push({ field_name: fieldName, reason: distinct.message.slice(0, 160) });
        continue;
      }
      entry.top_values = distinct.rows.map((row) => ({
        value: row[fieldName] ?? Object.values(row)[0],
        count: Number(row.count ?? 0),
      }));
      profiled.push(entry);
    }

    return jsonBlock(`Ustunlar: ${reference.id}`, {
      id: reference.id,
      domain: resolved.domain,
      total: columns.length,
      profiled: profiled.length,
      skipped: selected.length - profiled.length,
      columns: profiled,
      failed: failed.length > 0 ? failed : undefined,
      note:
        failed.length > 0
          ? 'Ba’zi ustunlar SoQL bilan tekshirilmadi - sababi yuqorida. Juda katta datasetlarda guruhlash ' +
            'server tomonda rad etilishi normal.'
          : undefined,
    });
  },
});
