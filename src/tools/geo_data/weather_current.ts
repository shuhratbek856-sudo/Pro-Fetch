import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { getJson, latitude, coordinate } from './_osm.js';

/**
 * Open-Meteo weather.
 *
 * Credential-free by design: no API key, no account, no quota email. That is why it is here rather than
 * one of the usual providers, all of which require registration before they answer.
 */
export default defineTool({
  name: 'pro_geo_weather_current',
  description:
    'Koordinataga ko‘ra haqiqiy vaqt ob-havosi (Open-Meteo, kalitsiz): harorat, hissiy harorat, ' +
    'namlik, yomg‘ir, qor, shamol, bosim, bulut va quyosh holati. Bir nechta koordinat ham berilishi ' +
    'mumkin — ular parallel so‘raladi.',
  category: 'geo_data',
  inputSchema: {
    type: 'object',
    properties: {
      lat: { type: 'number', description: 'Kenglik (birinchi koordinata)' },
      lon: { type: 'number', description: 'Uzunlik (birinchi koordinata)' },
      lat2: { type: 'number', description: 'Ikkinchi koordinataning kengligi' },
      lon2: { type: 'number', description: 'Ikkinchi koordinataning uzunligi' },
      timezone: { type: 'string', description: 'Vaqt zonası (standart auto — koordinataga yaqin)' },
      units: { type: 'string', enum: ['metric', 'imperial'], description: 'O‘lchov birligi (standart metric)' },
      temperature_unit: { type: 'string', description: 'Harorat birligi (celsius/fahrenheit)' },
      wind_speed_unit: { type: 'string', description: 'Shamol tezligi birligi (kmh/ms/mph)' },
    },
    required: ['lat', 'lon'],
  },
  async handler(input) {
    const p = view(input);
    const points: Array<{ lat: string; lon: string }> = [];
    try {
      points.push({ lat: latitude(p.lat), lon: coordinate(p.lon, 'lon') });
      // Several points in one request is both faster and fairer to the upstream: the API is built for
      // comma-separated coordinates, and N separate calls would be N separate rate-limit hits.
      if (p.lat2 !== undefined || p.lon2 !== undefined) {
        points.push({ lat: latitude(p.lat2), lon: coordinate(p.lon2, 'lon2') });
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const params = new URLSearchParams({
      latitude: points.map((point) => point.lat).join(','),
      longitude: points.map((point) => point.lon).join(','),
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m',
    });
    params.set('timezone', strOrEmpty(p, 'timezone') || 'auto');
    params.set('units', strOrEmpty(p, 'units') || 'metric');
    const temperatureUnit = strOrEmpty(p, 'temperature_unit');
    if (temperatureUnit) params.set('temperature_unit', temperatureUnit);
    const windSpeedUnit = strOrEmpty(p, 'wind_speed_unit');
    if (windSpeedUnit) params.set('wind_speed_unit', windSpeedUnit);

    const outcome = await getJson(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, 'Open-Meteo');
    if (!outcome.ok) return fail(outcome.message);

    const raw = outcome.value;
    const readings = Array.isArray(raw) ? raw : [raw];
    if (!Array.isArray(readings)) return fail('Open-Meteo kutilganidan boshqa formatda javob berdi.');

    const readingsOut = readings.map((entry, index) => {
      const record = entry as Record<string, unknown>;
      const current = (record.current as Record<string, unknown> | undefined) ?? {};
      const point = points[index] ?? { lat: String(record.latitude ?? ''), lon: String(record.longitude ?? '') };
      return {
        requested: point,
        resolved: { lat: record.latitude ?? null, lon: record.longitude ?? null },
        elevation_m: record.elevation ?? null,
        timezone: record.timezone ?? null,
        // Units are echoed back rather than assumed: "wind_speed_10m" is 20 in km/h and 5.6 in m/s, and
        // a bare number with no unit is not usable.
        units: (record.current_units as Record<string, string> | undefined) ?? null,
        observed_at: current.time ?? null,
        temperature: current.temperature_2m ?? null,
        apparent_temperature: current.apparent_temperature ?? null,
        humidity_percent: current.relative_humidity_2m ?? null,
        precipitation: current.precipitation ?? null,
        rain: current.rain ?? null,
        snowfall: current.snowfall ?? null,
        cloud_cover_percent: current.cloud_cover ?? null,
        pressure_hpa: current.pressure_msl ?? null,
        wind_speed: current.wind_speed_10m ?? null,
        wind_direction_degrees: current.wind_direction_10m ?? null,
        weather_code: current.weather_code ?? null,
        weather_text: weatherText(current.weather_code),
      };
    });

    return jsonBlock('Havo', { count: readingsOut.length, readings: readingsOut });
  },
});

/** WMO weather interpretation codes, the subset that is worth naming. */
function weatherText(code: unknown): string | null {
  const value = Number(code);
  if (!Number.isFinite(value)) return null;
  if (value === 0) return 'ochiq';
  if (value <= 2) return 'qisman bulutli';
  if (value === 3) return 'bulutli';
  if (value <= 48) return 'tuman';
  if (value <= 55) return 'mayin yoki yengil yomg‘ir';
  if (value <= 57) return 'qalin yomg‘ir';
  if (value <= 65) return 'yomg‘ir';
  if (value <= 67) return 'muz yoki yong‘oq yomg‘ir';
  if (value <= 77) return 'qor';
  if (value <= 82) return 'yomg‘ir kuraklari';
  if (value <= 86) return 'qor kuraklari';
  return 'bo‘ron yoki kuchli hodisa';
}
