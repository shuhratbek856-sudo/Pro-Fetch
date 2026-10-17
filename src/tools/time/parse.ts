import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { describeDate, parseTime, type Zone } from './_time.js';

export default defineTool({
  name: 'pro_time_parse',
  description:
    'Vaqt satrini tahlil qilish: ISO/raqamli kiritma -> epoch millis, UTC ISO, kalendar sanasi ' +
    '(haftaning kuni, ISO hafta, yil ichidagi kun). Zonasiz satr "aniq emas" deb belgilanadi.',
  category: 'time',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'Vaqt: "2026-10-16", "2026-10-16T10:30:00Z", "1750000000"' },
      assume: {
        type: 'string',
        enum: ['utc', 'local'],
        description: 'Zonasiz satr qanday o‘qiladi (standart: utc)',
      },
    },
    required: ['value'],
  },
  async handler(input) {
    const p = view(input);
    const raw = strOrEmpty(p, 'value');
    const assumeRaw = strOrEmpty(p, 'assume').toLowerCase();
    if (assumeRaw && assumeRaw !== 'utc' && assumeRaw !== 'local') {
      return fail(`assume faqat "utc" yoki "local" bo‘lishi kerak, "${assumeRaw}" keldi.`);
    }
    const assume = (assumeRaw || 'utc') as Zone;

    let parsed;
    try {
      parsed = parseTime(raw, assume);
    } catch (error) {
      return fail(`vaqtni tushunib bo‘lmadi: ${(error as Error).message}`);
    }

    const calendar = {
      year: Number(parsed.iso.slice(0, 4)),
      month: Number(parsed.iso.slice(5, 7)),
      day: Number(parsed.iso.slice(8, 10)),
    };
    // Read the local wall-clock parts straight off a Date. The first version rebuilt them by hand as
    // `epoch + getTimezoneOffset()`, which has the sign backwards: the offset is (UTC - local), so
    // adding it moves the answer *away* from the local date. Every caller would have been off by the
    // offset - five hours, a day, or a day and an hour at a daylight-saving boundary - and the output
    // would still have looked like a plausible date.
    const localDate = new Date(parsed.epoch_ms);
    const local = {
      year: localDate.getFullYear(),
      month: localDate.getMonth() + 1,
      day: localDate.getDate(),
    };

    return jsonBlock(`Vaqt tahlili: ${raw}`, {
      source: parsed.source,
      epoch_ms: parsed.epoch_ms,
      epoch_seconds: Math.floor(parsed.epoch_ms / 1000),
      iso_utc: parsed.iso,
      zone_assumed: parsed.zone,
      unambiguous: parsed.unambiguous,
      note: parsed.unambiguous
        ? 'Kirish aniq belgilangan.'
        : 'Zona yozilmagan: natija farqli zona bilan boshqacha bo‘lishi mumkin. ' +
          'Aniq bo‘lishi uchun "Z" yoki "+05:00" qo‘shing.',
      utc: describeDate(calendar),
      local: describeDate(local),
    });
  },
});
