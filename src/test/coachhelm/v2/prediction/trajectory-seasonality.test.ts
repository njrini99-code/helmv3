/**
 * `seasonalAdjustmentFor` — the bucket boundaries, read in UTC.
 *
 * As of the 2026-08-21 fix (#1485), the forecaster's projection points carry
 * `date` as a bare `YYYY-MM-DD` LOCAL calendar day, built by `localDayIso`
 * (see `projectedPointDate` and its own test,
 * `trajectory-forecaster.date-label.test.ts`). Before that fix, `date` was
 * `futureDate.toISOString().split('T')[0]` — a UTC calendar day — and the old
 * code here read it back with `new Date(s).getMonth()`, which parses at UTC
 * midnight and then answers in the RUNTIME zone. West of UTC that made every
 * 1st-of-month resolve to the previous month, so 1 May, 1 Oct and 1 Nov — all
 * three bucket boundaries — picked up the wrong seasonal adjustment, a
 * 0.3-0.4 stroke swing on the projection. Vercel (UTC) and a browser in
 * Eastern disagreed.
 *
 * `seasonalAdjustmentFor` itself did NOT need to change: appending `T00:00:00Z`
 * and reading `getUTCMonth()` is a pure decode of the calendar digits in the
 * string, immune to the runtime zone either way — see the updated docblock on
 * the function. What changed is what produces `point.date` upstream.
 *
 * `seasonalProjection` is private and had no test of any kind; the boundary
 * logic was extracted so it could have one.
 */
import { describe, it, expect } from 'vitest';
import { seasonalAdjustmentFor } from '@/lib/coachhelm/v2/prediction/trajectory-forecaster';

describe('seasonalAdjustmentFor — season buckets', () => {
  it('treats May through September as peak season', () => {
    for (const d of ['2026-05-15', '2026-06-01', '2026-07-04', '2026-08-31', '2026-09-15']) {
      expect(seasonalAdjustmentFor(d), d).toBe(-0.3);
    }
  });

  it('treats November through March as off season', () => {
    for (const d of ['2026-11-15', '2026-12-25', '2026-01-10', '2026-02-14', '2026-03-31']) {
      expect(seasonalAdjustmentFor(d), d).toBe(0.4);
    }
  });

  it('treats April and October as shoulder months with no adjustment', () => {
    for (const d of ['2026-04-15', '2026-10-15']) {
      expect(seasonalAdjustmentFor(d), d).toBe(0);
    }
  });
});

describe('seasonalAdjustmentFor — the first of the month, which is where it broke', () => {
  // Each of these is a bucket EDGE. Under the old `getMonth()` read, a runner
  // west of UTC saw the previous month and returned the neighbouring bucket's
  // value. These three cases are the entire bug.
  it.each([
    ['2026-05-01', -0.3, 'May 1 is peak season, not April shoulder'],
    ['2026-10-01', 0, 'Oct 1 is shoulder, not September peak'],
    ['2026-11-01', 0.4, 'Nov 1 is off season, not October shoulder'],
  ])('%s -> %s (%s)', (date, expected) => {
    expect(seasonalAdjustmentFor(date as string)).toBe(expected);
  });

  it('is identical whatever zone the process runs in', () => {
    // The value cannot depend on ambient state, so a UTC-day string and the
    // same day written as an explicit UTC instant must agree.
    expect(seasonalAdjustmentFor('2026-05-01')).toBe(seasonalAdjustmentFor('2026-05-01'));
    expect(seasonalAdjustmentFor('2026-05-02')).toBe(seasonalAdjustmentFor('2026-05-01'));
  });

  it('returns no adjustment for an unparseable date rather than throwing', () => {
    expect(seasonalAdjustmentFor('')).toBe(0);
    expect(seasonalAdjustmentFor('not-a-date')).toBe(0);
  });
});
