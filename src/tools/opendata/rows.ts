import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { emptyResult, parseReference, resolveDataset, soqlIdentifier, sodaRows } from './_opendata.js';

export default defineTool({
  name: 'pro_opendata_rows',
  description:
    'Ochiq datasetdan qatorlar o‘qish (SoQL): $limit, $offset, $select, $order va $where. ' +
    'Filtr xatosi provider’ning o‘z xaberi bilan qaytariladi - u noto‘g‘ri ustun nomini aniq ko‘rsatadi.',
  category: 'opendata',
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'Dataset id, permalink yoki SODA manzili' },
      limit: { type: 'number', description: 'Necha qator (standart 10, ko‘pi bilan 1000)' },
      offset: { type: 'number', description: 'Qayerdan boshlash' },
      select: { type: 'string', description: 'Faqat shu ustunlar: "license_type,vehicle_license_number"' },
      where: { type: 'string', description: 'SoQL shart: "license_type=\'Taxi\'"' },
      order: { type: 'string', description: 'Saralash: "license_type ASC" yoki "id DESC"' },
      group: { type: 'string', description: 'Guruhlash ustuni (count(*) bilan birga)' },
    },
    required: ['dataset'],
  },
  async handler(input) {
    const p = view(input);
    const reference = parseReference(strOrEmpty(p, 'dataset'));
    if ('error' in reference) return jsonBlock('Qatorlar', { error: reference.error });

    const resolved = await resolveDataset(reference.id, reference.domain);
    if (!resolved.ok) return jsonBlock('Qatorlar', { id: reference.id, error: resolved.message });

    const limit = Math.max(1, Math.min(num(p, 'limit', 10) || 10, 1000));
    const offset = Math.max(0, num(p, 'offset', 0));
    const select = strOrEmpty(p, 'select');
    const where = strOrEmpty(p, 'where');
    const order = strOrEmpty(p, 'order');
    const group = strOrEmpty(p, 'group');

    const params: Record<string, string> = { $limit: String(limit) };
    if (offset > 0) params.$offset = String(offset);
    if (select) params.$select = select;
    if (where) params.$where = where;
    if (order) params.$order = order;
    if (group) params.$group = soqlIdentifier(group);

    const rows = await sodaRows(resolved.domain, reference.id, params);
    if (!rows.ok) {
      return jsonBlock('Qatorlar', {
        id: reference.id,
        domain: resolved.domain,
        error: rows.message,
        // Named separately: "the portal has no data API" and "your query is wrong" need different
        // next steps, and a single error string loses that.
        portal_without_data_api: rows.html,
      });
    }

    if (rows.rows.length === 0) {
      return emptyResult({
        id: reference.id,
        domain: resolved.domain,
        asked: { limit, offset, select: select || undefined, where: where || undefined, order: order || undefined },
        note: 'Shartga mos qator topilmadi. Ustun nomlari dataset.ts orqali tekshirilishi mumkin.',
      });
    }

    return jsonBlock(`Qatorlar: ${reference.id}`, {
      id: reference.id,
      domain: resolved.domain,
      count: rows.rows.length,
      limit,
      offset,
      fields: Object.keys(rows.rows[0] ?? {}),
      rows: rows.rows,
    });
  },
});
