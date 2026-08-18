/**
 * `calculateEventTop` / `calculateEventHeight` place every event block in the
 * Day and Week grids, and had NO test of any kind.
 *
 * Audited 2026-08-18 and found CORRECT — this file locks the contract rather
 * than fixing a defect. It is written because the contract is subtle enough
 * that a reasonable refactor breaks it silently, which is exactly how `isToday`
 * in this same module ended up one day out.
 *
 * THE CONTRACT, which is easy to misread as a bug:
 *
 * Both functions derive the hour from `new Date(...).getHours()` — the
 * VIEWER's local zone — with no timezone parameter. That looks wrong next to
 * the rest of the calendar, which works in the TEAM's zone. It is not, because
 * the grid is built the same way:
 *
 *   - `getHoursRange` (DayView) picks the row range with
 *     `getMinutesFromMidnight`, which is also `d.getHours()`;
 *   - `layoutOverlappingEvents` sorts with the same function;
 *   - `formatHourInTz(localHour, teamTz)` then LABELS each local row with its
 *     team-time equivalent.
 *
 * So rows are local hours and labels are converted, which means an event
 * positioned by its local hour lands on the row whose label is its true team
 * time. Range, ordering, position and label all share one basis. Change any
 * one of them to a team-zone hour without the others and every event silently
 * shifts by the viewer's offset.
 *
 * `start_date` is the raw timestamptz for timed events and a zone-less
 * `YYYY-MM-DDT00:00:00` for all-day ones (useCalendarEvents.ts:102), so both
 * shapes are pinned below.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { calculateEventTop, calculateEventHeight } from '../event-styles';

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

/** One hour of grid = 64px. */
const HOUR_PX = 64;

describe('calculateEventTop', () => {
  it('places an event on the row for its LOCAL hour, offset from the grid start', () => {
    process.env.TZ = 'UTC';
    // 14:00 local, grid starts at 06:00 -> 8 rows down.
    expect(calculateEventTop('2026-08-18T14:00:00+00:00', 6)).toBe(8 * HOUR_PX);
  });

  it('adds the minute fraction within the row', () => {
    process.env.TZ = 'UTC';
    expect(calculateEventTop('2026-08-18T14:30:00+00:00', 6)).toBe(8 * HOUR_PX + 32);
  });

  it('honours a grid that starts earlier than the default', () => {
    process.env.TZ = 'UTC';
    // getHoursRange extends the grid to cover early events, so an event before
    // 6am arrives with a smaller startHour rather than being clamped away.
    expect(calculateEventTop('2026-08-18T05:00:00+00:00', 5)).toBe(0);
    expect(calculateEventTop('2026-08-18T06:00:00+00:00', 5)).toBe(HOUR_PX);
  });

  it('never returns a negative offset', () => {
    process.env.TZ = 'UTC';
    // Defensive: if an event ever precedes the grid start it pins to the top
    // rather than rendering above the container.
    expect(calculateEventTop('2026-08-18T03:00:00+00:00', 6)).toBe(0);
  });

  it('reads a zone-less all-day string as midnight, not as UTC', () => {
    // useCalendarEvents normalizes all-day events to `YYYY-MM-DDT00:00:00`.
    // A zone-less datetime is parsed as LOCAL by spec, so this is 0 in every
    // zone — which is what keeps all-day events off the timed grid.
    for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      expect(calculateEventTop('2026-08-18T00:00:00', 6)).toBe(0);
    }
  });

  it('treats a bare date as the top of the grid', () => {
    process.env.TZ = 'UTC';
    expect(calculateEventTop('2026-08-18', 6)).toBe(0);
  });

  it('parses a time-only string without constructing a Date at all', () => {
    // Legacy shape. No Date means no zone involvement.
    for (const tz of ['UTC', 'Pacific/Midway']) {
      process.env.TZ = tz;
      expect(calculateEventTop('14:30:00', 6)).toBe(8 * HOUR_PX + 32);
      expect(calculateEventTop('14:30', 6)).toBe(8 * HOUR_PX + 32);
    }
  });

  it('returns 0 for empty or unparseable input rather than NaN', () => {
    process.env.TZ = 'UTC';
    expect(calculateEventTop('', 6)).toBe(0);
    expect(calculateEventTop('not a date', 6)).toBe(0);
  });
});

describe('calculateEventHeight', () => {
  it('is 64px per hour of duration', () => {
    process.env.TZ = 'UTC';
    expect(calculateEventHeight('2026-08-18T14:00:00+00:00', '2026-08-18T16:00:00+00:00')).toBe(
      2 * HOUR_PX,
    );
  });

  it('measures duration as elapsed time, so the viewer zone cannot change it', () => {
    // Both bounds are instants; the difference is zone-independent. This is
    // what keeps a 2-hour practice 2 hours tall for a coach who is travelling.
    for (const tz of ['UTC', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Midway']) {
      process.env.TZ = tz;
      expect(
        calculateEventHeight('2026-08-18T14:00:00+00:00', '2026-08-18T16:00:00+00:00'),
      ).toBe(2 * HOUR_PX);
    }
  });

  it('spans a DST boundary by elapsed time, not by clock hours', () => {
    process.env.TZ = 'America/New_York';
    // 2026-11-01 01:00 EDT -> 01:00 EST is two real hours across the fall-back.
    expect(
      calculateEventHeight('2026-11-01T05:00:00+00:00', '2026-11-01T07:00:00+00:00'),
    ).toBe(2 * HOUR_PX);
  });

  it('defaults to one hour when there is no end', () => {
    process.env.TZ = 'UTC';
    expect(calculateEventHeight('2026-08-18T14:00:00+00:00', null)).toBe(HOUR_PX);
  });

  it('never renders shorter than 48px, so a short event stays readable', () => {
    process.env.TZ = 'UTC';
    // 15 minutes would be 16px.
    expect(calculateEventHeight('2026-08-18T14:00:00+00:00', '2026-08-18T14:15:00+00:00')).toBe(48);
  });

  it('handles a time-only pair without a Date', () => {
    process.env.TZ = 'Pacific/Midway';
    expect(calculateEventHeight('14:00:00', '16:00:00')).toBe(2 * HOUR_PX);
  });
});
