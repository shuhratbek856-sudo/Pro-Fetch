import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, str, strOrEmpty, view } from '../../core/input.js';
import { overpassQuery, latitude, coordinate } from './_osm.js';

export default defineTool({
  name: 'pro_geo_overpass_query',
  description:
    'OpenStreetMap Overpass QL so‘rovi: bino, yo‘l, bog‘, suv, landi va boshqa obyektlar. ' +
    'So‘rov "query" yoki "q" argumentida. So‘rov yoki barcha ko‘zguchalar ishlamasa, sabab va ' +
    'sinangan ko‘zguchalar ro‘yxati qaytariladi.',
  category: 'geo_data',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Overpass QL so‘rovi — majburiy (masalan "[out:json];node(around:100,41.30,69.24)[\"amenity\"=\"cafe\"];out;")',
      },
      q: { type: 'string', description: 'Overpass QL so‘rovi (boshqa yozuv)' },
      bbox: { type: 'string', description: 'Chegara "south,west,north,east" — so‘rovga avtomatik qo‘shiladi' },
      timeout: { type: 'number', description: 'Kutish vaqti, soniya (standart 60)' },
      limit: { type: 'number', description: 'Natijalarni cheklash (standart 200)' },
    },
    anyOf: [{ required: ['query'] }, { required: ['q'] }],
  },
  async handler(input) {
    const p = view(input);
    const raw = ((str(p, 'query', '') ?? '') || (str(p, 'q', '') ?? '')).trim();
    if (!raw) return fail('query (Overpass QL) argumenti kerak.');

    const timeoutSeconds = Math.round(num(p, 'timeout', 60, 1, 300));
    let ql = raw;
    const bbox = strOrEmpty(p, 'bbox');
    if (bbox) {
      const parts = bbox.split(',').map((part) => Number(part.trim()));
      if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
        return fail(`bbox "south,west,north,east" ko'rinishida to'rtta son bo'lishi kerak (berilgan: ${bbox}).`);
      }
      try {
        latitude(parts[0]);
        coordinate(parts[1], 'bbox west');
        latitude(parts[2]);
        coordinate(parts[3], 'bbox east');
      } catch (error) {
        return fail(error instanceof Error ? error.message : String(error));
      }
      // Injected as a query setting, not appended to the statement. Appending a bbox to a finished
      // query changes nothing at all, and the caller would receive a whole-world result while believing
      // it had been filtered - the bbox they asked for and the data they got would silently disagree.
      if (!/\[bbox:/.test(ql)) {
        ql = `[bbox:${parts.join(',')}];${ql}`;
      }
    }

    const limit = num(p, 'limit', 200, 1, 10_000);
    const outcome = await overpassQuery(ql, timeoutSeconds * 1000);
    if (!outcome.ok) return fail(`${outcome.message}\nSinagan ko‘zguchalar: ${outcome.tried.join(', ')}`);

    const body = outcome.value as { elements?: Array<Record<string, unknown>>; remark?: string };
    const elements = Array.isArray(body?.elements) ? body.elements : [];

    const byType: Record<string, number> = {};
    for (const element of elements) {
      const key = String(element.type ?? 'noma lum');
      byType[key] = (byType[key] ?? 0) + 1;
    }

    return jsonBlock('Overpass javobi', {
      endpoint: new URL(outcome.endpoint).host,
      mirrors_tried: outcome.tried,
      element_count: elements.length,
      truncated: elements.length >= limit,
      limit,
      by_type: byType,
      // Overpass reports its own complaints in `remark` - quota, timeout, memory - while returning
      // HTTP 200 with a partial result set. Passing those elements off as complete is exactly the
      // silent-wrong-answer shape, so the remark is surfaced rather than dropped.
      remark: body?.remark ?? null,
      elements: elements.slice(0, limit),
    });
  },
});
