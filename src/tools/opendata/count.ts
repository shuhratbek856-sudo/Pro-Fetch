import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { parseReference, resolveDataset, soqlIdentifier, sodaRows } from './_opendata.js';

export default defineTool({
  name: 'pro_opendata_count',
  description:
    'Datasetda qancha qator bor va ular qanday taqsimlangan: count(*), bir ustun bo‘yicha ' +
    'guruhlash, minimal/maksimal/o‘rtacha. Metama’lumot qatorlar sonini bermaydi - faqat shu yo‘l.',
  category: 'opendata',
  inputSchema: {
    type: 'object',
    properties: {
      dataset: { type: 'string', description: 'Dataset id, permalink yoki SODA manzili' },
      group_by: { type: 'string', description: 'Guruhlash ustuni - har bir qiymat nechta qator' },
      min: { type: 'string', description: 'MIN() bilan hisoblanadigan ustun' },
      max: { type: 'string', description: 'MAX() bilan hisoblanadigan ustun' },
      avg: { type: 'string', description: 'AVG() bilan hisoblanadigan ustun' },
      sum: { type: 'string', description: 'SUM() bilan hisoblanadigan ustun' },
      limit: { type: 'number', description: 'Guruhlash natijalarining chegarasi (standart 20)' },
      where: { type: 'string', description: 'SoQL shart (masalan "active=\'YES\'")' },
    },
    required: ['dataset'],
  },
  async handler(input) {
    const p = view(input);
    const reference = parseReference(strOrEmpty(p, 'dataset'));
    if ('error' in reference) return jsonBlock('Hisob', { error: reference.error });

    const resolved = await resolveDataset(reference.id, reference.domain);
    if (!resolved.ok) return jsonBlock('Hisob', { id: reference.id, error: resolved.message });

    const groupBy = strOrEmpty(p, 'group_by');
    const min = strOrEmpty(p, 'min');
    const max = strOrEmpty(p, 'max');
    const avg = strOrEmpty(p, 'avg');
    const sum = strOrEmpty(p, 'sum');
    const where = strOrEmpty(p, 'where');
    const limit = Math.max(1, Math.min(num(p, 'limit', 20) || 20, 500));

    // Built from the named fields rather than passed straight through, so `count(*)` cannot be
    // smuggled in as an arbitrary SoQL fragment and so the projections are always well formed.
    const projections: string[] = [];
    if (groupBy) projections.push(soqlIdentifier(groupBy));
    projections.push('count(*)');
    if (min) projections.push(`min(${soqlIdentifier(min)})`);
    if (max) projections.push(`max(${soqlIdentifier(max)})`);
    if (avg) projections.push(`avg(${soqlIdentifier(avg)})`);
    if (sum) projections.push(`sum(${soqlIdentifier(sum)})`);

    const params: Record<string, string> = { $select: projections.join(','), $limit: String(limit) };
    if (groupBy) params.$group = soqlIdentifier(groupBy);
    if (where) params.$where = where;

    const result = await sodaRows(resolved.domain, reference.id, params);
    if (!result.ok) {
      return jsonBlock('Hisob', {
        id: reference.id,
        domain: resolved.domain,
        error: result.message,
        portal_without_data_api: result.html,
      });
    }

    // Socrata returns every aggregate as a string, including `count`. Parsing here means the caller
    // gets a number; `Number('104900')` is exact for anything under 2^53, which no row count is.
    const rows = result.rows.map((row) => {
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        const numeric = Number(value);
        parsed[key] = typeof value === 'string' && value.trim() !== '' && Number.isFinite(numeric) ? numeric : value;
      }
      return parsed;
    });

    return jsonBlock(`Hisob: ${reference.id}`, {
      id: reference.id,
      domain: resolved.domain,
      grouped_by: groupBy || undefined,
      computed: {
        count: true,
        min: min || undefined,
        max: max || undefined,
        avg: avg || undefined,
        sum: sum || undefined,
      },
      total: rows.length === 1 ? (rows[0].count as number | undefined) : undefined,
      rows,
      // Measured, not guessed: SoQL flattens `min(vehicle_license_number)` into the column
      // `min_vehicle_license_number`. A caller who expects the expression back as written looks at the
      // output for a key that is not there and concludes the aggregate did not run.
      column_naming: 'Funksiyalar maydon nomiga yopishtiriladi: min(ustun) -> min_ustun, count(*) -> count.',
    });
  },
});
