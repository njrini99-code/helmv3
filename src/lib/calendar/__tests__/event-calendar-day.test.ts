import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import { eventCalendarDay, eventDaySpan, zonedMidnight } from '../timezone';

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

/**
 * `eventDaySpan` — the shared contract behind every day-bucketing surface.
 *
 * Four surfaces each had their own start-only lookup and drifted apart
 * (#1494): FairwayMonthGrid's `byDay`, FairwayAgendaView day mode and range
 * mode, and FairwayCalendar's day-view hero count. They now all call this, so
 * the span rules are pinned once, here, rather than four times in four
 * component tests.
 *
 * The hero count in particular has no render test of its own — it is a
 * four-line predicate over this function's output, identical to the agenda's,
 * and this is what makes both correct.
 */
describe('eventDaySpan', () => {
  const TZ = 'America/New_York';

  it('spans an all-day event from its first day through its INCLUSIVE last', () => {
    // Transylvania Invite, as production stores it.
    const span = eventDaySpan(
      {
        start_time: '2026-09-03T00:00:00+00:00',
        end_time: '2026-09-06T00:00:00+00:00',
        all_day: true,
      },
      TZ,
    );
    expect(span).not.toBeNull();
    expect(format(span!.first, 'yyyy-MM-dd')).toBe('2026-09-03');
    expect(format(span!.last, 'yyyy-MM-dd')).toBe('2026-09-06');
  });

  it('collapses a single-day all-day event to one day', () => {
    const span = eventDaySpan(
      {
        start_time: '2026-08-14T00:00:00+00:00',
        end_time: '2026-08-14T00:00:00+00:00',
        all_day: true,
      },
      TZ,
    );
    expect(format(span!.first, 'yyyy-MM-dd')).toBe('2026-08-14');
    expect(format(span!.last, 'yyyy-MM-dd')).toBe('2026-08-14');
  });

  it('collapses an absent end to one day', () => {
    const span = eventDaySpan(
      { start_time: '2026-08-14T00:00:00+00:00', end_time: null, all_day: true },
      TZ,
    );
    expect(format(span!.last, 'yyyy-MM-dd')).toBe('2026-08-14');
  });

  it('collapses an INVERTED end to one day rather than an empty range', () => {
    // A corrupt row must cost its own span, never a loop that never runs — or
    // a caller iterating first..last silently drops the event entirely.
    const span = eventDaySpan(
      {
        start_time: '2026-09-03T00:00:00+00:00',
        end_time: '2026-08-20T00:00:00+00:00',
        all_day: true,
      },
      TZ,
    );
    expect(format(span!.first, 'yyyy-MM-dd')).toBe('2026-09-03');
    expect(format(span!.last, 'yyyy-MM-dd')).toBe('2026-09-03');
  });

  it('returns null when there is no start at all', () => {
    expect(eventDaySpan({ start_time: null, end_time: null }, TZ)).toBeNull();
    expect(eventDaySpan({ start_time: 'not-a-date', all_day: true }, TZ)).toBeNull();
  });

  it('reads a TIMED event in the team zone, not as a bare UTC date', () => {
    // 00:30Z on the 4th is 8:30pm ET on the 3rd. An all-day event at the same
    // instant would be the 4th (its UTC date is what it means); a timed one is
    // the 3rd. The branch matters and this pins both sides of it.
    const timed = eventDaySpan(
      { start_time: '2026-09-04T00:30:00+00:00', end_time: '2026-09-04T02:00:00+00:00', all_day: false },
      TZ,
    );
    expect(format(timed!.first, 'yyyy-MM-dd')).toBe('2026-09-03');

    const allDay = eventDaySpan(
      { start_time: '2026-09-04T00:30:00+00:00', end_time: null, all_day: true },
      TZ,
    );
    expect(format(allDay!.first, 'yyyy-MM-dd')).toBe('2026-09-04');
  });

  it('prefers start_time/end_time but accepts the start_date/end_date shape', () => {
    // The calendar page and useCalendarEvents normalize an all-day event into
    // `start_date` as a zone-less local-midnight string while `start_time`
    // stays the raw UTC-midnight one; both must land on the same day.
    const span = eventDaySpan(
      { start_date: '2026-09-03T00:00:00', end_date: '2026-09-06T00:00:00', all_day: true },
      TZ,
    );
    expect(format(span!.first, 'yyyy-MM-dd')).toBe('2026-09-03');
    expect(format(span!.last, 'yyyy-MM-dd')).toBe('2026-09-06');
  });
});
