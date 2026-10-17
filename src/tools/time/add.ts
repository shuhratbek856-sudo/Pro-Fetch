import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { float, strOrEmpty, view } from '../../core/input.js';
import {
  addDuration,
  describeDate,
  parseDuration,
  parseTime,
  ZERO_DURATION,
  type CalendarDate,
  type Duration,
} from './_time.js';

const DURATION_FIELDS = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'] as const;

export default defineTool({
  name: 'pro_time_add',
  description:
    'Sana yoki vaqtga davr qo‘shish/ayirish: "2026-01-31" + "1mo" = 2026-02-28, "2026-02-28" + "2d" = ' +
    '2026-03-02. Kun oy uzunligiga moslanadi. Davr satr yoki alohida raqamlar bilan berilishi mumkin.',
  category: 'time',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Boshlang‘ich sana yoki vaqt (default: hozir)' },
      duration: { type: 'string', description: 'Davr: "1y 2mo 3d", "90d", "-2h"' },
      years: { type: 'number', description: 'Yil (manfiy ham)' },
      months: { type: 'number', description: 'Oy (manfiy ham)' },
      days: { type: 'number', description: 'Kun (manfiy ham)' },
      hours: { type: 'number', description: 'Soat' },
      minutes: { type: 'number', description: 'Daqiqa' },
      seconds: { type: 'number', description: 'Soniya' },
    },
    anyOf: [
      { required: ['duration'] },
      { required: ['years'] },
      { required: ['months'] },
      { required: ['days'] },
      { required: ['hours'] },
      { required: ['minutes'] },
      { required: ['seconds'] },
    ],
  },
  async handler(input) {
    const p = view(input);
    const rawDate = strOrEmpty(p, 'date') || new Date().toISOString();
    const durationText = strOrEmpty(p, 'duration');

    const duration: Duration = { ...ZERO_DURATION };
    let named = false;
    if (durationText) {
      try {
        const parsed = parseDuration(durationText);
        for (const field of DURATION_FIELDS) duration[field] = parsed[field];
        named = true;
      } catch (error) {
        return fail(`davrni tushunib bo‘lmadi: ${(error as Error).message}`);
      }
    }
    // Each property is read by name in the handler, not through a loop over `DURATION_FIELDS`.
    //
    // The loop version was correct code and an invisible bug: the schema audit resolves a property
    // read from the handler body and does not follow a loop variable, so `hours`, `minutes` and
    // `seconds` were advertised by the schema and reported as never read. That is precisely the
    // mismatch the audit exists to catch, and the narrowing pass would eventually have deleted them
    // from the published schema - with `additionalProperties: false` under it, a caller sending `hours`
    // would then have been rejected with a validation error.
    const years = float(p, 'years', 0);
    const months = float(p, 'months', 0);
    const days = float(p, 'days', 0);
    const hours = float(p, 'hours', 0);
    const minutes = float(p, 'minutes', 0);
    const seconds = float(p, 'seconds', 0);

    duration.years += years;
    duration.months += months;
    duration.days += days;
    duration.hours += hours;
    duration.minutes += minutes;
    duration.seconds += seconds;
    if (years || months || days || hours || minutes || seconds) named = true;

    if (!named) return fail('davr kerak: duration satr yoki kamida bitta raqam (years/months/days/...).');

    let start: CalendarDate;
    let source: string;
    try {
      const parsed = parseTime(rawDate);
      source = parsed.source;
      start = {
        year: Number(parsed.iso.slice(0, 4)),
        month: Number(parsed.iso.slice(5, 7)),
        day: Number(parsed.iso.slice(8, 10)),
      };
    } catch (error) {
      return fail(`sana noto‘g‘ri: ${(error as Error).message}`);
    }

    const result = addDuration(start, duration);
    const applied = DURATION_FIELDS.filter((field) => duration[field] !== 0).map((field) => ({
      field,
      value: duration[field],
    }));

    return jsonBlock(`${source} + ${durationText || 'raqamlar'}`, {
      input: source,
      applied,
      result: describeDate(result),
      // Named explicitly because this is where the surprise lives: 2026-01-31 + 1mo is 2026-02-28,
      // not 2026-03-03. A caller who did not expect the clamp should see why the day changed.
      note:
        start.day !== result.day
          ? `Boshlang‘ich kun ${start.day} bo‘lgani uchun ${result.year}-${String(result.month).padStart(2, '0')} oyiga moslandi.`
          : undefined,
    });
  },
});
