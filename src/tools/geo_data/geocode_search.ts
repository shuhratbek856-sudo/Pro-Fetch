import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, str, strOrEmpty, view } from '../../core/input.js';
import { getJson, latitude, coordinate } from './_osm.js';

/**
 * Nominatim search.
 *
 * Structured search is a set of `key=value` pairs sent as **separate query parameters**, not a single
 * `structured=` string. Measured: `/search?structured=Toshkent, Uzbekistan` answers
 * `400 {"error":{"message":"Nothing to search for."}}`, while `/search?street=Registon&city=Toshkent`
 * answers 200. The first shape is the one most people expect and it does not work, so it is not offered.
 */
export default defineTool({
  name: 'pro_geo_geocode_search',
  description:
    'Manzil yoki joy nomini koordinataga aylantirish (Nominatim / OpenStreetMap). Natija: joy nomi, ' +
    'lat/lon, chegaraviy to‘g‘ri kvadrat va turlar. Structured qidiruv uchun "structured" argumenti ' +
    'qo‘llanadi (masalan "Toshkent, O‘zbekiston").',
  category: 'geo_data',
  inputSchema: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Qidiruv so‘rovi (masalan "Registon, Toshkent")' },
      structured: {
        type: 'object',
        description: 'Strukturaviy qidiruv: {street, city, county, state, country, postalcode}',
        properties: {
          street: { type: 'string' },
          city: { type: 'string' },
          county: { type: 'string' },
          state: { type: 'string' },
          country: { type: 'string' },
          postalcode: { type: 'string' },
        },
      },
      limit: { type: 'number', description: 'Qancha natija (standart 5, ko‘pi 25)' },
      countrycodes: { type: 'string', description: 'Davlat kodlari, vergulli (masalan "uz")' },
      language: { type: 'string', description: 'Til (standart "uz")' },
      addressdetails: { type: 'boolean', description: 'To‘liq manzil tarkibi' },
      viewbox: { type: 'string', description: 'Chegara "<lon1>,<lat1>,<lon2>,<lat2>"' },
      bounded: { type: 'boolean', description: 'Natijalarni viewbox ichida ushlash' },
    },
    anyOf: [{ required: ['q'] }, { required: ['structured'] }],
  },
  async handler(input) {
    const p = view(input);
    const q = (str(p, 'q', '') ?? '').trim();
    const structured = asStructured(p.structured);
    if (!q && Object.keys(structured).length === 0) {
      return fail('q yoki structured argumenti kerak (masalan {city: "Toshkent"}).');
    }

    const limit = num(p, 'limit', 5, 1, 25);
    const viewbox = strOrEmpty(p, 'viewbox');
    if (viewbox && viewbox.split(',').length !== 4) {
      return fail(`viewbox "lon1,lat1,lon2,lat2" ko‘rinishida bo‘lishi kerak (berilgan: ${viewbox}).`);
    }

    const params = new URLSearchParams({
      format: 'jsonv2',
      limit: String(limit),
      addressdetails: String(p.addressdetails === true || strOrEmpty(p, 'addressdetails') === 'true'),
    });
    if (q) params.set('q', q);
    // Each structured key becomes its own parameter, which is the shape Nominatim actually accepts.
    for (const [key, value] of Object.entries(structured)) params.set(key, value);
    const language = strOrEmpty(p, 'language') || 'uz';
    params.set('language', language);
    const countrycodes = strOrEmpty(p, 'countrycodes');
    if (countrycodes) params.set('countrycodes', countrycodes);
    if (viewbox) params.set('viewbox', viewbox);
    if (p.bounded === true || strOrEmpty(p, 'bounded') === 'true') params.set('bounded', '1');

    const outcome = await getJson(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      'Nominatim qidiruv',
    );
    if (!outcome.ok) return fail(outcome.message);

    const rows = (outcome.value ?? []) as Array<Record<string, unknown>>;
    if (!Array.isArray(rows)) return fail('Nominatim kutilganidan boshqa formatda javob berdi.');

    const results = rows.map((row) => {
      const box = String(row.boundingbox ?? '')
        .split(',')
        .map((part) => Number(part));
      return {
        place_id: row.place_id ?? null,
        display_name: row.display_name ?? null,
        name: row.name ?? null,
        category: row.category ?? null,
        type: row.type ?? null,
        importance: row.importance ?? null,
        latitude: row.lat ?? null,
        longitude: row.lon ?? null,
        // Nominatim returns a bounding box, not a centre. Splitting it into south/north and west/east
        // makes it usable, and `centre` gives the point to pass to a radius search.
        bounding_box:
          box.length === 4 && box.every((value) => Number.isFinite(value))
            ? { south: box[0], north: box[1], west: box[2], east: box[3] }
            : null,
        centre:
          Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))
            ? { lat: Number(row.lat), lon: Number(row.lon) }
            : null,
        address: (row.address as Record<string, unknown> | undefined) ?? null,
      };
    });

    return jsonBlock('Geokodlash', {
      query: q || structured,
      language,
      count: results.length,
      truncated: results.length === limit,
      // An empty result set is a legitimate answer for a place that does not exist, and it must not
      // look like a failure or like a location that was found and has no coordinates.
      empty: results.length === 0,
      results,
    });
  },
});

/** Nominatim's accepted structured keys, in the order its documentation lists them. */
const STRUCTURED_KEYS = ['street', 'city', 'county', 'state', 'country', 'postalcode'] as const;

/**
 * Normalise the `structured` object, dropping blanks.
 *
 * An empty value would be sent as `street=`, which Nominatim counts as a search term and answers 400
 * for - the same "Nothing to search for" a missing query gives.
 */
function asStructured(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of STRUCTURED_KEYS) {
    const entry = source[key];
    if (typeof entry === 'string' && entry.trim()) out[key] = entry.trim();
  }
  return out;
}

export { coordinate, latitude };
