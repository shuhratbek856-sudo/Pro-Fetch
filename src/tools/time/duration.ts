import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { parseDuration, ZERO_DURATION, type Duration } from './_time.js';

const FIELDS = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'] as const;

/**
 * Render a duration as a canonical string and as an approximate millisecond count.
 *
 * The millisecond figure is an *approximation* and says so, because a month has no fixed length. A
 * previous habit of reporting a single exact `total_ms` for "1 month" invites a caller to compare it
 * against another tool's answer and conclude one of them is broken.
 */
function render(duration: Duration): Record<string, unknown> {
  const parts = FIELDS.filter((field) => duration[field] !== 0).map((field) => {
    const value = duration[field];
    return `${value}${field.slice(0, 2)}`;
  });
  // 1 year as 365 days, 1 month as 30.4375 days - the mean Gregorian values. Labelled as an estimate.
  const approxMs =
    duration.years * 365 * 86_400_000 +
    duration.months * 30.4375 * 86_400_000 +
    duration.days * 86_400_000 +
    duration.hours * 3_600_000 +
    duration.minutes * 60_000 +
    duration.seconds * 1000;
  return {
    duration: Object.fromEntries(FIELDS.map((field) => [field, duration[field]])),
    text: parts.length > 0 ? parts.join(' ') : '0',
    approx_ms: Math.round(approxMs),
    approx_note: 'oy 30.4375 kunga teng deb hisoblangan taxmin; aniq oy uzunligi boshlang‘ich sanaga bog‘liq.',
  };
}

export default defineTool({
  name: 'pro_time_duration',
  description:
    'Davr satrini tahlil qilish va tekshirish: "1y 2mo 3d 4h 5m 6s" -> maydonlar, qisqa matn va ' +
    'taxminiy millisekund. Noma’lum birlik xato qaytariladi.',
  category: 'time',
  inputSchema: {
    type: 'object',
    properties: {
      duration: { type: 'string', description: 'Davr satri, masalan "90d" yoki "2h 30m"' },
      sum: {
        type: 'array',
        items: { type: 'string' },
        description: 'Bir nechta davrni qo‘shish: ["1y", "2mo", "3d"]',
      },
      show_units: { type: 'boolean', description: 'Qabul qilinadigan birliklarni ro‘yxat qilish' },
    },
    anyOf: [{ required: ['duration'] }, { required: ['sum'] }, { required: ['show_units'] }],
  },
  async handler(input) {
    const p = view(input);
    if (p.show_units === true || String(p.show_units ?? '') === 'true') {
      return jsonBlock('Davr birliklari', {
        units: {
          years: 'y, yr, year, years',
          months: 'mo, mon, month, months',
          days: 'd, day, days (va w, week, weeks = 7 kun)',
          hours: 'h, hr, hour, hours',
          minutes: 'm, min, minute, minutes',
          seconds: 's, sec, second, seconds',
        },
        example: '1y 2mo 3d 4h 5m 6s',
      });
    }

    const durationText = strOrEmpty(p, 'duration');
    const list = Array.isArray(p.sum) ? (p.sum as unknown[]) : [];

    if (!durationText && list.length === 0) {
      return fail('duration satri yoki sum ro‘yxati kerak.');
    }

    const total: Duration = { ...ZERO_DURATION };
    const parts: string[] = [];
    const collect = (text: string, label: string): string | undefined => {
      try {
        const parsed = parseDuration(text);
        for (const field of FIELDS) total[field] += parsed[field];
        parts.push(`${label} = ${text}`);
        return undefined;
      } catch (error) {
        return `${label}: ${(error as Error).message}`;
      }
    };

    let problem: string | undefined;
    if (durationText) problem = collect(durationText, 'duration');
    for (const entry of list) {
      if (problem) break;
      problem = collect(String(entry), `sum[${parts.length}]`);
    }
    if (problem) return fail(problem);

    return jsonBlock(`Davr: ${durationText || list.join(' + ')}`, {
      inputs: parts,
      ...render(total),
    });
  },
});
