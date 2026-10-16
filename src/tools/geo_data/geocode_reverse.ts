import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { getJson, latitude, coordinate } from './_osm.js';

export default defineTool({
  name: 'pro_geo_geocode_reverse',
  description:
    'Koordinatani manzilga aylantirish (Nominatim reverse geocoding). Natija: yaqin joy, to‘liq ' +
    'manzil, chegaraviy to‘g‘ri kvadrat va masofa (meters), masalan 30 m ichida.',
  category: 'geo_data',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: 'Kenglik — majburiy (-90..90)' },
      lon: { type: 'number', description: 'Uzunlik — majburiy (-180..180)' },
      zoom: { type: 'number', description: 'Masshtab 0-18 (oddiy manzil uchun 18)' },
      language: { type: 'string', description: 'Til (standart "uz")' },
      addressdetails: { type: 'boolean', description: 'To‘liq manzil tarkibi' },
    },
    required: ['lat', 'lon'],
  },
  async handler(input) {
    const p = view(input);
    let lat: string;
    let lon: string;
    try {
      lat = latitude(p.lat);
      lon = coordinate(p.lon, 'lon');
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const zoom = num(p, 'zoom', 18, 0, 18);
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat,
      lon,
      zoom: String(zoom),
      addressdetails: String(p.addressdetails === true || strOrEmpty(p, 'addressdetails') === 'true'),
    });
    params.set('language', strOrEmpty(p, 'language') || 'uz');

    const outcome = await getJson(
      `https://nominatim.openstreetmap.org/reverse?${params.toString()}`,
      'Nominatim reverse',
    );
    if (!outcome.ok) return fail(outcome.message);

    const row = outcome.value as Record<string, unknown>;
    if (!row || typeof row !== 'object') {
      return fail('Nominatim reverse kutilganidan boshqa formatda javob berdi.');
    }
    // Nominatim answers 200 with `{"error": "Unable to geocode"}` for open ocean and empty space. That
    // is not a place, and reporting it as an address would invent one.
    if (row.error || !row.display_name) {
      return fail(
        `Bu koordinatada manzil topilmadi${row.error ? ': ' + String(row.error) : ''}. ` +
          'Ochiq suv yoki bo‘sh hudud bo‘lishi mumkin.',
      );
    }

    const box = String(row.boundingbox ?? '')
      .split(',')
      .map((part) => Number(part));

    return jsonBlock('Reverse geokodlash', {
      lat: Number(lat),
      lon: Number(lon),
      zoom,
      display_name: row.display_name ?? null,
      name: row.name ?? null,
      category: row.category ?? null,
      type: row.type ?? null,
      place_id: row.place_id ?? null,
      lat_returned: row.lat ?? null,
      lon_returned: row.lon ?? null,
      bounding_box:
        box.length === 4 && box.every((value) => Number.isFinite(value))
          ? { south: box[0], north: box[1], west: box[2], east: box[3] }
          : null,
      address: (row.address as Record<string, unknown> | undefined) ?? null,
    });
  },
});
