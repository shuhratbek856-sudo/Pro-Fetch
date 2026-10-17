// Calendar arithmetic that is easy to get quietly wrong, checked against values worked out by hand.
//
// The assertions are on computed numbers, not on "it did not throw". Every defect these cover returned
// a plausible-looking answer: a date that did not exist, a weekday three days out, an "unambiguous"
// result that was ambiguous.

import { describe, it, expect } from 'vitest';
import {
  addDuration,
  daysBetween,
  daysInMonth,
  describeDate,
  describeSpan,
  isLeapYear,
  isoWeek,
  isoWeekday,
  parseDuration,
  parseTime,
} from '../src/tools/time/_time.js';

const DAY = 86_400_000;
const at = (iso: string): number => Date.parse(iso);

describe('leap years and month lengths', () => {
  it('follows the Gregorian rule, including the century cases', () => {
    // 1900 is divisible by 4 and by 100 but not by 400, so it is not a leap year; 2000 is.
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
  });

  it('gives February its length for the year in question', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
  });

  it('rejects a month outside 1..12 rather than returning undefined', () => {
    expect(() => daysInMonth(2026, 0)).toThrow();
    expect(() => daysInMonth(2026, 13)).toThrow();
  });
});

describe('weekday and ISO week', () => {
  it('numbers weekdays ISO-style, Monday = 1', () => {
    expect(isoWeekday({ year: 2026, month: 10, day: 19 })).toBe(1);
    expect(isoWeekday({ year: 2026, month: 10, day: 18 })).toBe(7);
  });

  it('puts a Friday 1 January in the previous year’s week 53', () => {
    // The case that separates a real ISO-week implementation from `getWeek()`. 2027-01-01 is a
    // Friday, so its week runs Mon 2026-12-28 to Sun 2027-01-03 and belongs to week-year 2026.
    //
    // My first attempt at this test used 2026-01-01 and expected 2025-W53. That was wrong: 2026-01-01
    // is a Thursday, and the Thursday rule puts it in 2026-W01 - so the test was asserting the bug it
    // was meant to catch.
    const week = isoWeek({ year: 2027, month: 1, day: 1 });
    expect(week.year).toBe(2026);
    expect(week.week).toBe(53);
  });

  it('puts a Thursday 1 January in its own week 1', () => {
    const week = isoWeek({ year: 2026, month: 1, day: 1 });
    expect(week.year).toBe(2026);
    expect(week.week).toBe(1);
  });

  it('agrees with a mid-year date', () => {
    const week = isoWeek({ year: 2026, month: 6, day: 15 });
    expect(week.year).toBe(2026);
    expect(week.week).toBe(25);
  });
});

describe('parsing', () => {
  it('treats a bare date as unambiguous only under the UTC assumption', () => {
    // Under UTC a bare date names exactly one instant. Under local it names two - local midnight and
    // UTC midnight - so the first version of this module claiming otherwise was wrong.
    expect(parseTime('2026-10-16', 'utc').unambiguous).toBe(true);
    expect(parseTime('2026-10-16', 'local').unambiguous).toBe(false);
  });

  it('treats a zoned timestamp as unambiguous', () => {
    expect(parseTime('2026-10-16T10:30:00Z', 'local').unambiguous).toBe(true);
    expect(parseTime('2026-10-16T10:30:00+05:00', 'utc').unambiguous).toBe(true);
  });

  it('treats a bare date-time as ambiguous', () => {
    expect(parseTime('2026-10-16T10:30', 'utc').unambiguous).toBe(false);
  });

  it('resolves the same instant to the same ISO string from either spelling', () => {
    expect(parseTime('2026-10-16T10:30:00Z').iso).toBe('2026-10-16T10:30:00.000Z');
    expect(parseTime('2026-10-16T15:30:00+05:00').iso).toBe('2026-10-16T10:30:00.000Z');
  });

  it('reads a bare integer as seconds below 1e11 and milliseconds above', () => {
    // 1750000000 is a plausible seconds timestamp; read as milliseconds it is January 1970.
    expect(parseTime('1750000000').epoch_ms).toBe(1_750_000_000_000);
    expect(parseTime('1750000000000').epoch_ms).toBe(1_750_000_000_000);
  });

  it('rejects what it cannot read', () => {
    expect(() => parseTime('')).toThrow();
    expect(() => parseTime('kechga kechiring')).toThrow();
  });
});

describe('duration parsing', () => {
  it('reads every unit, including the two that start with the same letter', () => {
    // `mo` and `m` both begin with "m". A naive prefix check reads every month as a minute.
    const parsed = parseDuration('1y 2mo 3d 4h 5m 6s');
    expect(parsed).toEqual({ years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 });
  });

  it('expands weeks into days', () => {
    expect(parseDuration('2w').days).toBe(14);
  });

  it('refuses an unknown unit instead of ignoring it', () => {
    // Silently dropping "3 fortnights" would return a duration of zero and report success.
    expect(() => parseDuration('3 fortnights')).toThrow();
    expect(() => parseDuration('')).toThrow();
  });
});

describe('adding a duration to a calendar date', () => {
  it('clamps the day to the length of the month it lands in', () => {
    // 2026-01-31 + 1 month = 2026-02-28. `setMonth` would give 2026-03-03.
    expect(addDuration({ year: 2026, month: 1, day: 31 }, parseDuration('1mo'))).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('carries the overflow into the next month instead of returning day 30 of February', () => {
    // The defect this module shipped with: it clamped once and then added days on top, so
    // 2026-01-31 + 1mo + 2d came out as 2026-02-30, a date that does not exist.
    expect(addDuration({ year: 2026, month: 1, day: 31 }, parseDuration('1mo 2d'))).toEqual({
      year: 2026,
      month: 3,
      day: 2,
    });
  });

  it('rolls the year over in both directions', () => {
    expect(addDuration({ year: 2026, month: 11, day: 15 }, parseDuration('3mo'))).toEqual({
      year: 2027,
      month: 2,
      day: 15,
    });
    expect(addDuration({ year: 2026, month: 2, day: 15 }, parseDuration('-3mo'))).toEqual({
      year: 2025,
      month: 11,
      day: 15,
    });
  });

  it('handles a negative day count without producing day zero', () => {
    expect(addDuration({ year: 2026, month: 3, day: 1 }, parseDuration('-1d'))).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
  });

  it('adds nothing when the duration is empty', () => {
    expect(addDuration({ year: 2026, month: 6, day: 15 }, parseDuration('0d'))).toEqual({
      year: 2026,
      month: 6,
      day: 15,
    });
  });
});

describe('difference between two dates', () => {
  it('counts days across a month boundary', () => {
    expect(daysBetween({ year: 2026, month: 2, day: 28 }, { year: 2026, month: 3, day: 1 })).toBe(1);
  });

  it('is signed', () => {
    expect(daysBetween({ year: 2026, month: 3, day: 1 }, { year: 2026, month: 2, day: 28 })).toBe(-1);
  });

  it('ignores the time of day', () => {
    expect(daysBetween({ year: 2026, month: 1, day: 1 }, { year: 2026, month: 1, day: 2 })).toBe(1);
  });
});

describe('breaking an elapsed span into calendar fields', () => {
  it('takes the month from the calendar, not from 30 days', () => {
    const span = describeSpan(at('2026-01-15T00:00:00Z'), at('2026-02-15T00:00:00Z'));
    expect(span.months).toBe(1);
    expect(span.days).toBe(0);
  });

  it('breaks a span that borrows a month correctly', () => {
    // 2026-01-31 -> 2026-03-01 is one month and one day, not 29 days.
    const span = describeSpan(at('2026-01-31T00:00:00Z'), at('2026-03-01T00:00:00Z'));
    expect(span.months).toBe(1);
    expect(span.days).toBe(1);
  });

  it('is symmetric about direction', () => {
    const forwards = describeSpan(at('2026-01-01T00:00:00Z'), at('2027-03-15T06:30:00Z'));
    const backwards = describeSpan(at('2027-03-15T06:30:00Z'), at('2026-01-01T00:00:00Z'));
    expect(backwards.years).toBe(forwards.years);
    expect(backwards.months).toBe(forwards.months);
    expect(backwards.days).toBe(forwards.days);
    expect(backwards.future).toBe(false);
    expect(forwards.future).toBe(true);
  });

  it('keeps the sub-day remainder exact', () => {
    const span = describeSpan(at('2026-01-01T00:00:00Z'), at('2026-01-02T03:04:05Z'));
    expect(span.days).toBe(1);
    expect(span.hours).toBe(3);
    expect(span.minutes).toBe(4);
    expect(span.seconds).toBe(5);
    expect(span.total_ms).toBe(DAY + 3 * 3_600_000 + 4 * 60_000 + 5000);
  });

  it('leaves no leftover time on an exact calendar anniversary', () => {
    // 2024 is a leap year, so a year is 366 days of epoch time here.
    const span = describeSpan(at('2024-03-01T00:00:00Z'), at('2025-03-01T00:00:00Z'));
    expect(span.years).toBe(1);
    expect(span.months).toBe(0);
    expect(span.days).toBe(0);
    expect(span.hours).toBe(0);
    expect(span.minutes).toBe(0);
    expect(span.seconds).toBe(0);
  });

  it('returns zero for an identical pair of instants', () => {
    const span = describeSpan(at('2026-06-01T12:00:00Z'), at('2026-06-01T12:00:00Z'));
    expect(span.total_ms).toBe(0);
    expect(span.years + span.months + span.days + span.hours).toBe(0);
  });
});

describe('describing a calendar date', () => {
  it('reports the fields a caller would otherwise recompute', () => {
    const described = describeDate({ year: 2026, month: 10, day: 16 }) as Record<string, unknown>;
    expect(described.iso).toBe('2026-10-16');
    expect(described.weekday).toBe(5);
    expect(described.weekday_name).toBe('juma');
    expect(described.days_in_month).toBe(31);
    expect(described.is_leap_year).toBe(false);
    // 2026 is not a leap year, so 16 October is the 289th day.
    expect(described.day_of_year).toBe(289);
  });

  it('names Sunday correctly rather than leaving it undefined', () => {
    // ISO weekday 7 must not index past the end of the name table.
    const described = describeDate({ year: 2026, month: 10, day: 18 }) as Record<string, unknown>;
    expect(described.weekday).toBe(7);
    expect(described.weekday_name).toBe('yakshanba');
  });
});
