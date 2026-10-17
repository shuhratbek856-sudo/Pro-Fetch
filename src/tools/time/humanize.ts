import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';
import { describeSpan, parseTime } from './_time.js';

/** Grammatical agreement in Uzbek: "1 oy" but "5 oy", "1 kun" but "9 kun". */
function plural(amount: number, one: string, many: string): string {
  const rounded = Math.abs(amount);
  return `${amount} ${rounded === 1 ? one : many}`;
}

function phrase(years: number, months: number, days: number, hours: number, minutes: number, seconds: number): string {
  const chunks: string[] = [];
  if (years !== 0) chunks.push(plural(years, 'yil', 'yil'));
  if (months !== 0) chunks.push(plural(months, 'oy', 'oy'));
  if (days !== 0) chunks.push(plural(days, 'kun', 'kun'));
  if (hours !== 0) chunks.push(plural(hours, 'soat', 'soat'));
  if (minutes !== 0) chunks.push(plural(minutes, 'daqiqa', 'daqiqa'));
  // Seconds only when nothing coarser survived, so "3 soniya" does not read as "0 yil 0 oy 0 kun 0 soat
  // 0 daqiqa 3 soniya".
  if (seconds !== 0 && chunks.length === 0) chunks.push(plural(seconds, 'soniya', 'soniya'));
  return chunks.length > 0 ? chunks.join(' ') : '0 soniya';
}

export default defineTool({
  name: 'pro_time_humanize',
  description:
    'Vaqt oralig‘ini inson o‘qiyadigan shaklda aytish: "3 yil 2 oy 7 kun oldin" yoki "2 soatdan keyin". ' +
    'Turli o‘lchovlarda taqqoslash ham beriladi.',
  category: 'time',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Boshlang‘ich vaqt (default: hozir)' },
      to: { type: 'string', description: 'Tugatuvchi vaqt (default: hozir)' },
      units: {
        type: 'string',
        enum: ['auto', 'seconds', 'minutes', 'hours', 'days', 'months', 'years'],
        description: 'Asosiy o‘lchov (standart: auto - eng yirik to‘liq birlik)',
      },
    },
  },
  async handler(input) {
    const p = view(input);
    const fromText = strOrEmpty(p, 'from');
    const toText = strOrEmpty(p, 'to');
    const unitChoice = strOrEmpty(p, 'units').toLowerCase() || 'auto';

    let from;
    let to;
    try {
      from = parseTime(fromText || new Date().toISOString());
      to = parseTime(toText || new Date().toISOString());
    } catch (error) {
      return fail(`vaqtni tushunib bo‘lmadi: ${(error as Error).message}`);
    }

    const span = describeSpan(from.epoch_ms, to.epoch_ms);
    const direction = span.future ? 'keyin' : 'oldin';
    const full = phrase(span.years, span.months, span.days, span.hours, span.minutes, span.seconds);

    const approx: Record<string, number> = {
      seconds: Math.round(span.total_ms / 1000),
      minutes: span.total_ms / 60_000,
      hours: span.total_ms / 3_600_000,
      days: span.total_ms / 86_400_000,
      months: span.total_ms / (30.4375 * 86_400_000),
      years: span.total_ms / (365.25 * 86_400_000),
    };

    const rounded = (value: number): number =>
      Math.abs(value) >= 100 ? Math.round(value / 10) * 10 : Math.round(value * 100) / 100;

    // Uzbek has one plural for every count above one, so the unit noun never changes. The earlier
    // version had a `${condition ? '' : ''}` here that could only ever append the empty string - a
    // ternary that reads as if it selects something and does not.
    const inUnits = (value: number, unit: string): string => `${rounded(value)} ${unit}`;

    let headline: string;
    switch (unitChoice) {
      case 'seconds':
        headline = `${inUnits(approx.seconds, 'soniya')} ${direction}`;
        break;
      case 'minutes':
        headline = `${inUnits(approx.minutes, 'daqiqa')} ${direction}`;
        break;
      case 'hours':
        headline = `${inUnits(approx.hours, 'soat')} ${direction}`;
        break;
      case 'days':
        headline = `${inUnits(approx.days, 'kun')} ${direction}`;
        break;
      case 'months':
        headline = `${inUnits(approx.months, 'oy')} ${direction}`;
        break;
      case 'years':
        headline = `${inUnits(approx.years, 'yil')} ${direction}`;
        break;
      default:
        headline = `${full} ${direction}`;
    }

    return jsonBlock(`${from.iso} -> ${to.iso}`, {
      text: `${headline} (${from.iso} -> ${to.iso})`,
      direction: span.future ? 'kelajak' : 'o‘tgan',
      headline,
      exact_phrase: `${full} ${direction}`,
      broken_down: {
        years: span.years,
        months: span.months,
        days: span.days,
        hours: span.hours,
        minutes: span.minutes,
        seconds: span.seconds,
      },
      approximate: {
        seconds: rounded(approx.seconds),
        minutes: rounded(approx.minutes),
        hours: rounded(approx.hours),
        days: rounded(approx.days),
        months: rounded(approx.months),
        years: rounded(approx.years),
      },
      approximate_note: 'oy 30.4375, yil 365.25 kunga teng deb hisoblangan; aniq kalendar maydoni yuqorida.',
    });
  },
});
