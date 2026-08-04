import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { eventCalendarDay, zonedMidnight } from '../timezone';

/**
 * All-day events landed one day early on the month grid.
 *
 * Reported 2026-08-04 by a Guilford coach: "Events are showing up on the wrong
 * days on the month view of the calendar. Shows up under correct days in the
 * agenda though."
 *
 * An all-day event has no time of day and is persisted at UTC midnight — the
 * date as written in UTC IS the intended calendar date. Bucketing it with
 * `zonedMidnight` re-read it as an instant and converted it to the viewer's
 * zone, so "August 14" became 8 PM on August 13 in America/New_York and
 * rendered in the wrong cell for every user west of UTC.
 *
 * The rows below are that coach's real August events, verbatim from
 * `golf_events`, which is why the expectations are stated as bare dates: they
 * are what the coach expects to see on the grid.
 */

const ET = 'America/New_York';

const GUILFORD_AUGUST = [
  { title: 'Freshman Move-In',                    allDay: true,  iso: '2026-08-14T00:00:00Z', expect: '2026-08-14' },
  { title: 'Tee times at the Cardinal',           allDay: true,  iso: '2026-08-15T00:00:00Z', expect: '2026-08-15' },
  { title: 'Returner Check in',                   allDay: true,  iso: '2026-08-17T00:00:00Z', expect: '2026-08-17' },
  { title: 'Convocation-MANDATORY (2:00 PM ET)',  allDay: false, iso: '2026-08-18T18:00:00Z', expect: '2026-08-18' },
  { title: 'First Day of Class',                  allDay: true,  iso: '2026-08-19T00:00:00Z', expect: '2026-08-19' },
  { title: 'Under the Stars (9:00 PM ET)',        allDay: false, iso: '2026-08-19T01:00:00Z', expect: '2026-08-18' },
  { title: 'Opening Team Meeting (3:30 PM ET)',   allDay: false, iso: '2026-08-19T19:30:00Z', expect: '2026-08-19' },
  { title: 'Practice @ Cardinal (4:45 PM ET)',    allDay: false, iso: '2026-08-19T20:45:00Z', expect: '2026-08-19' },
  { title: 'Practice @ BP',                       allDay: true,  iso: '2026-08-20T00:00:00Z', expect: '2026-08-20' },
];

const dayKey = (iso: string, allDay: boolean | null | undefined, tz: string | null) =>
  format(eventCalendarDay(iso, allDay, tz), 'yyyy-MM-dd');

describe('eventCalendarDay', () => {
  it.each(GUILFORD_AUGUST)('places "$title" on $expect', ({ iso, allDay, expect: want }) => {
    expect(dayKey(iso, allDay, ET)).toBe(want);
  });

  it('is what fixes the bug: zonedMidnight put every all-day event a day early', () => {
    const allDayEvents = GUILFORD_AUGUST.filter((e) => e.allDay);
    expect(allDayEvents).toHaveLength(5);

    for (const e of allDayEvents) {
      // The old behaviour, still reachable directly — one day early, every time.
      expect(format(zonedMidnight(e.iso, ET), 'yyyy-MM-dd')).not.toBe(e.expect);
      expect(dayKey(e.iso, e.allDay, ET)).toBe(e.expect);
    }
  });

  it('leaves timed events exactly as they were', () => {
    // Timed events were never wrong, and must not become wrong: a 9 PM ET
    // event is already "tomorrow" in UTC and still belongs on today's cell.
    for (const e of GUILFORD_AUGUST.filter((x) => !x.allDay)) {
      expect(dayKey(e.iso, e.allDay, ET)).toBe(format(zonedMidnight(e.iso, ET), 'yyyy-MM-dd'));
    }
  });

  it('holds an all-day event steady across viewer timezones', () => {
    // The whole point of an all-day event: "August 14" is August 14 whether the
    // coach is in Hawaii, Greensboro or Tokyo.
    for (const tz of ['Pacific/Honolulu', ET, 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
      expect(dayKey('2026-08-14T00:00:00Z', true, tz)).toBe('2026-08-14');
    }
  });

  it('gives the same day for BOTH shapes the app hands it', () => {
    // The same event arrives as two different strings depending on the surface:
    //   start_time  -> "2026-08-14T00:00:00+00:00"  (raw, UTC midnight)
    //   start_date  -> "2026-08-14T00:00:00"        (normalized, LOCAL midnight)
    // A first attempt at this fix read the UTC fields, which is right for the
    // raw string and wrong for the normalized one east of UTC — it would have
    // fixed the month grid and broken the agenda for anyone in, say, Tokyo.
    const SHAPES = [
      '2026-08-14T00:00:00+00:00',
      '2026-08-14T00:00:00Z',
      '2026-08-14T00:00:00',
      '2026-08-14',
    ];
    for (const tz of ['Pacific/Honolulu', ET, 'UTC', 'Asia/Tokyo']) {
      for (const iso of SHAPES) {
        expect(dayKey(iso, true, tz)).toBe('2026-08-14');
      }
    }
  });

  it('treats a missing/unknown all_day flag as timed', () => {
    // `all_day` is nullable. Absent means "not marked all-day", and a timed
    // event must keep the zone conversion.
    const iso = '2026-08-19T01:00:00Z'; // 9 PM ET on the 18th
    expect(dayKey(iso, null, ET)).toBe('2026-08-18');
    expect(dayKey(iso, undefined, ET)).toBe('2026-08-18');
  });

  it('yields an Invalid Date rather than throwing on an unparseable timestamp', () => {
    // `zonedMidnight` raises RangeError here — Intl rejects an invalid instant
    // — which would turn ONE malformed row into a blank calendar for the whole
    // team. Returning Invalid Date keeps the blast radius at one chip.
    expect(() => zonedMidnight('not-a-date', ET)).toThrow();

    for (const allDay of [true, false, null] as const) {
      expect(() => eventCalendarDay('not-a-date', allDay, ET)).not.toThrow();
      expect(Number.isNaN(eventCalendarDay('not-a-date', allDay, ET).getTime())).toBe(true);
    }
  });
});
