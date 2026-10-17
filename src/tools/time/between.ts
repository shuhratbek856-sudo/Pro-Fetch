import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { daysBetween, describeSpan, parseTime } from './_time.js';

export default defineTool({
  name: 'pro_time_between',
  description:
    'Ikki vaqt orasidagi farq: yil/oy/kun/soat/daqiqa/soniya, umumiy kun va millisekund, qaysi biri ' +
    'kelajakda. Kalendar farqi oy uzunligiga moslanadi, shuning uchun "1 oy" har doim 30 yoki 31 kun emas.',
  category: 'time',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Boshlang‘ich vaqt (default: hozir)' },
      to: { type: 'string', description: 'Tugatuvchi vaqt' },
      dates_only: { type: 'boolean', description: "Faqat kunlar hisoblanadi, soat/daqiqa e'tiborsiz" },
    },
    required: ['to'],
  },
  async handler(input) {
    const p = view(input);
    const fromText = strOrEmpty(p, 'from') || new Date().toISOString();
    const toText = strOrEmpty(p, 'to');
    const datesOnly = p.dates_only === true || String(p.dates_only ?? '') === 'true';

    let from;
    let to;
    try {
      from = parseTime(fromText);
      to = parseTime(toText);
    } catch (error) {
      return fail(`vaqtni tushunib bo‘lmadi: ${(error as Error).message}`);
    }

    const span = describeSpan(from.epoch_ms, to.epoch_ms);
    const startDate = {
      year: Number(from.iso.slice(0, 4)),
      month: Number(from.iso.slice(5, 7)),
      day: Number(from.iso.slice(8, 10)),
    };
    const endDate = {
      year: Number(to.iso.slice(0, 4)),
      month: Number(to.iso.slice(5, 7)),
      day: Number(to.iso.slice(8, 10)),
    };
    const calendarDays = daysBetween(startDate, endDate);

    return jsonBlock(`${from.iso} -> ${to.iso}`, {
      from: from.iso,
      to: to.iso,
      direction: span.future ? 'kelajakda' : 'o‘tgan',
      span: {
        years: span.years,
        months: span.months,
        days: span.days,
        hours: datesOnly ? 0 : span.hours,
        minutes: datesOnly ? 0 : span.minutes,
        seconds: datesOnly ? 0 : span.seconds,
      },
      calendar_days: calendarDays,
      total_days: span.total_days,
      total_ms: span.total_ms,
      note: datesOnly
        ? 'dates_only: soat, daqiqa va soniya nolga o‘zgartirildi, calendar_days va total_days o‘zgarmadi.'
        : undefined,
    });
  },
});
