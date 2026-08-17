/**
 * `src/lib/golf/date-only.ts` had NO direct test — no test file imported it at
 * all — while being the canonical answer to a bug class that keeps recurring in
 * this codebase:
 *
 *   - its own docblock cites #916, where two Fairway rounds surfaces disagreed
 *     about the same `round_date` because one formatter pinned UTC and the
 *     other did not;
 *   - `CommandOpening.tsx` printed "last round Aug 1" for a stored 2026-08-02
 *     (f774d9171);
 *   - `program-pulse.ts` carried a `T12:00:00Z` noon anchor that survives the
 *     Americas but returns the wrong day at +14 (same commit).
 *
 * Every one of those was fixed by routing through this module, so if it is
 * wrong, so is each of those fixes. That is worth a test of its own.
 *
 * The module's entire value proposition is that the answer does not depend on
 * the runtime zone, so the expectations below are exact strings rather than
 * anything derived from `new Date()`. The suite is run under TZ=UTC,
 * Pacific/Kiritimati (+14) and Pacific/Midway (-11); a formatter that leaked the
 * ambient zone would fail in at least one of them.
 */
import { describe, it, expect } from 'vitest';
import {
  parseDateOnly,
  dateOnlyToUtcDate,
  formatDateOnly,
  formatDateOnlyShort,
  formatDateOnlyFull,
  formatDateOnlyWeekdayShort,
  formatDateOnlyWeekdayLong,
} from '@/lib/golf/date-only';

/** A real production value: Demo University Golf's most recent round_date. */
const ROUND_DATE = '2026-08-02'; // a Sunday

describe('parseDateOnly', () => {
  it('pulls the calendar parts out of a bare YYYY-MM-DD', () => {
    expect(parseDateOnly(ROUND_DATE)).toEqual({ year: 2026, month: 8, day: 2 });
  });

  it('reads the date half of a full timestamp and ignores the rest', () => {
    // PostgREST hands back both shapes depending on the column type.
    expect(parseDateOnly('2026-08-02T23:30:00.000Z')).toEqual({ year: 2026, month: 8, day: 2 });
    expect(parseDateOnly('2026-08-02T00:15:00-05:00')).toEqual({ year: 2026, month: 8, day: 2 });
  });

  it('returns the CALENDAR month, not the 0-indexed JS one', () => {
    // The single likeliest way to misuse this: month 8 is August, not September.
    expect(parseDateOnly('2026-01-31')?.month).toBe(1);
    expect(parseDateOnly('2026-12-01')?.month).toBe(12);
  });

  it('returns null for values it cannot trust', () => {
    for (const bad of ['', 'not-a-date', '26-08-02', 'Aug 2 2026', null, undefined]) {
      expect(parseDateOnly(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('rejects an out-of-range month or day rather than rolling over', () => {
    // `new Date('2026-13-01')` would silently become 2027; this must not.
    expect(parseDateOnly('2026-13-01')).toBeNull();
    expect(parseDateOnly('2026-00-10')).toBeNull();
    expect(parseDateOnly('2026-08-32')).toBeNull();
    expect(parseDateOnly('2026-08-00')).toBeNull();
  });
});

describe('dateOnlyToUtcDate', () => {
  it('anchors at UTC midnight, whatever the runtime zone', () => {
    const d = dateOnlyToUtcDate({ year: 2026, month: 8, day: 2 });
    expect(d.toISOString()).toBe('2026-08-02T00:00:00.000Z');
  });

  it('round-trips through parseDateOnly', () => {
    expect(dateOnlyToUtcDate(parseDateOnly(ROUND_DATE)!).toISOString()).toBe(
      '2026-08-02T00:00:00.000Z',
    );
  });
});

describe('formatters are zone-invariant', () => {
  /**
   * THE #916 CASE. `new Date('2026-08-02').toLocaleDateString()` prints "Aug 1"
   * anywhere west of Greenwich, because the string parses as UTC midnight and
   * is then read back in the local zone. These must print Aug 2 everywhere.
   */
  it('never shifts the day backwards west of UTC', () => {
    expect(formatDateOnlyShort(ROUND_DATE)).toBe('Aug 2');
    expect(formatDateOnlyFull(ROUND_DATE)).toBe('August 2, 2026');
  });

  it('never shifts the day forwards east of UTC either', () => {
    // The inverse failure, which a `T12:00:00Z` noon anchor still gets wrong
    // at +13/+14.
    expect(formatDateOnlyShort('2026-01-01')).toBe('Jan 1');
    expect(formatDateOnlyFull('2026-12-31')).toBe('December 31, 2026');
  });

  it('names the correct weekday', () => {
    // 2026-08-02 is a Sunday. A one-day drift would show Saturday or Monday,
    // which is the most visible form of this bug on a schedule.
    expect(formatDateOnlyWeekdayShort(ROUND_DATE)).toBe('Sun');
    expect(formatDateOnlyWeekdayLong(ROUND_DATE)).toBe('Sunday');
  });

  it('honours arbitrary Intl options while staying pinned to UTC', () => {
    expect(formatDateOnly(ROUND_DATE, { month: 'long' })).toBe('August');
    expect(formatDateOnly(ROUND_DATE, { year: 'numeric' })).toBe('2026');
  });

  it('holds across a DST boundary', () => {
    // US DST ends 2026-11-01. A formatter reading the ambient zone can slip a
    // day either side of the transition.
    expect(formatDateOnlyShort('2026-11-01')).toBe('Nov 1');
    expect(formatDateOnlyShort('2026-03-08')).toBe('Mar 8');
  });
});

describe('formatters degrade rather than throw', () => {
  it('returns the em-dash placeholder for unparseable input', () => {
    for (const bad of ['', 'not-a-date', null, undefined]) {
      expect(formatDateOnlyShort(bad), JSON.stringify(bad)).toBe('—');
      expect(formatDateOnlyFull(bad), JSON.stringify(bad)).toBe('—');
      expect(formatDateOnlyWeekdayShort(bad), JSON.stringify(bad)).toBe('—');
      expect(formatDateOnlyWeekdayLong(bad), JSON.stringify(bad)).toBe('—');
    }
  });

  it('lets a caller choose its own fallback', () => {
    expect(formatDateOnlyShort(null, 'No date')).toBe('No date');
    expect(formatDateOnly(null, { month: 'short' }, 'TBD')).toBe('TBD');
  });
});
