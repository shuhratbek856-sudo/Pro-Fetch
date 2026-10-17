/**
 * Time and calendar arithmetic, done here rather than through a dependency.
 *
 * Three things every date library does that are easy to get subtly wrong, and which this module does
 * explicitly rather than inheriting:
 *
 * **A timestamp has no zone.** `Date` parses `"2026-10-16"` as UTC midnight, but `"2026-10-16 10:00"`
 * as *local* time on most engines and as UTC on others. A string without a zone is therefore reported
 * as ambiguous instead of being silently resolved one way - a report of "when did this happen" that is
 * three hours wrong is worse than one that says it cannot tell.
 *
 * **Month arithmetic is not day arithmetic.** 2026-01-31 plus one month is 2026-02-28, not 2026-03-03.
 * `setMonth` does the wrong thing and every project discovers this again.
 *
 * **A duration is not a point in time.** "1 month" depends on which month it starts from, so durations
 * are kept as explicit fields rather than collapsed into milliseconds at the first opportunity.
 */

export type Zone = 'utc' | 'local';

export interface ParsedTime {
  iso: string;
  epoch_ms: number;
  zone: Zone;
  /** False when the input carried no offset and could not be pinned to one. */
  unambiguous: boolean;
  source: string;
}

/** A calendar date with no time of day, kept as parts so no zone can be implied. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const MS_PER_DAY = 86_400_000;
const MONTH_NAMES = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const DAY_NAMES = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

/** True when `year` is a leap year in the proleptic Gregorian calendar. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) throw new Error(`oy 1..12 orasida bo'lishi kerak: ${month}`);
  const lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return lengths[month - 1];
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
export function isoWeekday(date: CalendarDate): number {
  const js = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = js.getUTCDay();
  return day === 0 ? 7 : day;
}

/** ISO-8601 week number and its week-based year, which differ from the calendar year near New Year. */
export function isoWeek(date: CalendarDate): { week: number; year: number } {
  // The algorithm shifts the date to the Thursday of its week; the week number is then the count of
  // Thursdays, which is what makes 2026-01-01 belong to 2025's week 53 rather than week 1.
  const js = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = (js.getUTCDay() + 6) % 7;
  js.setUTCDate(js.getUTCDate() - day + 3);
  const isoYear = js.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((js.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
  return { week, year: isoYear };
}

const ZONE_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

/**
 * Parse a timestamp, reporting ambiguity rather than resolving it silently.
 *
 * A bare `YYYY-MM-DD` read as UTC midnight lands on exactly one instant, so it is unambiguous. Read as
 * *local* midnight it does not: the same string names two instants, and pretending otherwise would be
 * the exact silent-wrong-answer this module exists to avoid. The earlier version marked every bare date
 * as unambiguous regardless of the assumption, which was wrong for `assume: 'local'`.
 */
export function parseTime(input: unknown, assume: Zone = 'utc'): ParsedTime {
  const raw = typeof input === 'string' ? input.trim() : String(input);
  if (!raw) throw new Error('vaqt bo‘sh.');

  if (/^-?\d+$/.test(raw)) {
    // A bare integer is ambiguous by digit count, not by value: seconds and milliseconds differ by
    // three orders of magnitude and a value like 1750000000 is seconds in 2025 but milliseconds in
    // 1970. Anything below 1e11 is seconds; that boundary is 5138 AD in seconds and 1973 in
    // milliseconds, so it cannot be wrong for a plausible timestamp.
    const digits = Number(raw.replace('-', ''));
    const ms = digits < 1e11 ? Number(raw) * 1000 : Number(raw);
    const date = new Date(ms);
    if (!Number.isFinite(date.getTime())) throw new Error(`vaqtni tushunib bo‘lmadi: ${raw}`);
    return { iso: date.toISOString(), epoch_ms: date.getTime(), zone: 'utc', unambiguous: true, source: raw };
  }

  const hasExplicitZone = ZONE_SUFFIX.test(raw);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  let ms: number;
  if (!hasExplicitZone && assume === 'local') {
    const local = new Date(raw.replace(' ', 'T'));
    ms = local.getTime();
  } else {
    ms = new Date(hasExplicitZone ? raw : `${raw.replace(' ', 'T')}Z`).getTime();
  }
  if (!Number.isFinite(ms)) throw new Error(`vaqtni tushunib bo‘lmadi: ${raw}`);

  return {
    iso: new Date(ms).toISOString(),
    epoch_ms: ms,
    zone: hasExplicitZone ? 'utc' : assume,
    unambiguous: hasExplicitZone || (dateOnly && assume === 'utc'),
    source: raw,
  };
}

export interface Duration {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const ZERO_DURATION: Duration = {
  years: 0,
  months: 0,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
};

/**
 * Shift a calendar date by a duration, clamping the day to the length of the month it lands in.
 *
 * The clamping has to happen **twice**, and the first version only did it once: `2026-01-31` plus one
 * month is `2026-02-28`, but adding two more days to that gives `2026-03-02` only if the overflow is
 * carried. It returned `2026-02-30`, a date that does not exist, which then formatted as garbage.
 */
export function addDuration(date: CalendarDate, duration: Duration): CalendarDate {
  const totalMonths = date.year * 12 + (date.month - 1) + duration.years * 12 + duration.months;
  let year = Math.floor(totalMonths / 12);
  let month = (totalMonths % 12) + 1;
  let day = Math.min(date.day, daysInMonth(year, month));

  // Overflow upwards. Recomputes the month length each time, so a jump of several months lands on the
  // right day rather than on the length of whichever month the loop started from.
  day += duration.days;
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  // And downwards, so a negative duration cannot produce day 0 or a negative day.
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(year, month);
  }

  return { year, month, day };
}

/** Signed day count from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / MS_PER_DAY);
}

/**
 * Break an elapsed span into years, months, days and the rest.
 *
 * Years and months are taken from the calendar first and the leftover time afterwards, so
 * "one month later" means the same calendar day rather than 30 or 31 days. The remainder in hours,
 * minutes and seconds is exact because the epoch is.
 *
 * The month count comes from an **anniversary**, not from subtracting the two day-of-month fields.
 * Subtracting them and borrowing once was wrong whenever the start day is longer than the month being
 * borrowed from: 2026-01-31 to 2026-03-01 is one month and one day, but `1 - 31 = -30` plus February's
 * 28 left a day count of `-2`, so the borrow needed repeating and the answer came back as 29 days.
 * Building the anniversary with the same clamping rule as `addDuration`, and stepping back one month
 * only when it overshoots, cannot produce a negative day.
 */
export function describeSpan(
  fromMs: number,
  toMs: number,
): Duration & {
  total_days: number;
  total_ms: number;
  future: boolean;
} {
  const future = toMs >= fromMs;
  const start = future ? new Date(fromMs) : new Date(toMs);
  const end = future ? new Date(toMs) : new Date(fromMs);
  const totalMs = Math.abs(toMs - fromMs);

  const startDate: CalendarDate = {
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    day: start.getUTCDate(),
  };
  const endDate: CalendarDate = {
    year: end.getUTCFullYear(),
    month: end.getUTCMonth() + 1,
    day: end.getUTCDate(),
  };

  // The month shift is applied to the **instant**, keeping its time of day. Shifting the calendar date
  // instead produced a midnight anniversary, so a start at 12:00 measured a negative month offset and
  // the same instant compared with itself reported twelve leftover hours. The day is still clamped, so
  // 2026-01-31 12:00 plus one month is 2026-02-28 12:00 and not 2026-03-03.
  const shiftInstant = (months: number): number => {
    const shifted = addDuration(startDate, { ...ZERO_DURATION, months });
    return Date.UTC(
      shifted.year,
      shifted.month - 1,
      shifted.day,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    );
  };

  let totalMonths = (endDate.year - startDate.year) * 12 + (endDate.month - startDate.month);
  let anniversaryMs = shiftInstant(totalMonths);
  if (anniversaryMs > end.getTime()) {
    totalMonths -= 1;
    anniversaryMs = shiftInstant(totalMonths);
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const remaining = Math.max(0, totalMs - (anniversaryMs - start.getTime()));
  const days = Math.floor(remaining / MS_PER_DAY);
  const leftover = remaining - days * MS_PER_DAY;

  return {
    years,
    months,
    days,
    hours: Math.floor(leftover / 3_600_000),
    minutes: Math.floor((leftover % 3_600_000) / 60_000),
    seconds: Math.floor((leftover % 60_000) / 1000),
    total_days: Math.floor(totalMs / MS_PER_DAY),
    total_ms: totalMs,
    future,
  };
}

export function describeDate(date: CalendarDate): Record<string, unknown> {
  const week = isoWeek(date);
  return {
    iso: `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`,
    year: date.year,
    month: date.month,
    day: date.day,
    month_name: MONTH_NAMES[date.month - 1],
    weekday: isoWeekday(date),
    weekday_name: DAY_NAMES[isoWeekday(date) % 7],
    is_leap_year: isLeapYear(date.year),
    days_in_month: daysInMonth(date.year, date.month),
    day_of_year: daysBetween({ year: date.year, month: 1, day: 1 }, date) + 1,
    iso_week: week.week,
    iso_week_year: week.year,
  };
}

/** Parse a duration written as `1y 2mo 3d 4h 5m 6s`, or as a single unit. */
export function parseDuration(input: string): Duration {
  const raw = input.trim().toLowerCase();
  if (!raw) throw new Error('davr bo‘sh.');
  const units: Record<string, number> = {
    y: 1,
    yr: 1,
    year: 1,
    years: 1,
    mo: 1,
    mon: 1,
    month: 1,
    months: 1,
    w: 7,
    week: 7,
    weeks: 7,
    d: 1,
    day: 1,
    days: 1,
    h: 1,
    hr: 1,
    hour: 1,
    hours: 1,
    m: 1,
    min: 1,
    minute: 1,
    minutes: 1,
    s: 1,
    sec: 1,
    second: 1,
    seconds: 1,
  };
  const out = { ...ZERO_DURATION };
  // The sign is part of the token. The original pattern started at the first digit, so `-2h` matched
  // `2h` and the minus was discarded: "two hours ago" came back as "two hours from now", with no error
  // and a confident-looking date. A silent sign flip is the worst kind of bug in a duration parser.
  const pattern = /(-?\d+(?:\.\d+)?)\s*([a-z]+)/g;
  let matched = false;
  for (const match of raw.matchAll(pattern)) {
    const amount = Number(match[1]);
    const unit = units[match[2]];
    if (!Number.isFinite(amount)) throw new Error(`davrdagi son noto‘g‘ri: ${match[1]}`);
    if (unit === undefined) throw new Error(`davrdagi birlikni tushunmadim: ${match[2]}`);
    matched = true;
    // Month is checked before minute: `mo` and `m` are both in the table above, and a naive
    // `startsWith('m')` would read every month as a minute.
    if (match[2].startsWith('y')) out.years += amount;
    else if (match[2].startsWith('mo')) out.months += amount;
    else if (match[2].startsWith('w')) out.days += amount * unit;
    else if (match[2].startsWith('d')) out.days += amount;
    else if (match[2].startsWith('h')) out.hours += amount;
    else if (match[2].startsWith('m')) out.minutes += amount;
    else out.seconds += amount;
  }
  if (!matched) {
    throw new Error(`davrni tushunib bo‘lmadi: "${input}". Shakl: "1y 2mo 3d 4h 5m 6s".`);
  }
  return out;
}
