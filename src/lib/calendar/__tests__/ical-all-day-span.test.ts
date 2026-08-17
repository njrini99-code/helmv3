/**
 * The coach calendar subscription drops the last day of every multi-day
 * all-day event, and emits single-day all-day events as a zero-length span.
 *
 * `DTEND` for a DATE value is EXCLUSIVE in RFC 5545 §3.8.2.2 — it is the first
 * day NOT in the event, and it "MUST be later in time than the value of the
 * DTSTART property". `golf_events` stores the opposite convention: the create
 * action writes `end_time: `${endDate}T00:00:00+00:00`` from the user's End
 * Date field (golf.ts:2302), and `SpanSummary` renders that back to the coach
 * as "Sep 3 → Sep 6" — inclusive, the last day of the tournament.
 *
 * `ical.ts` passed the stored date through unchanged, so the two conventions
 * were off by exactly one day in the direction that loses information.
 *
 * Measured in production (2026-08-17): 44 all-day events, 14 of them
 * multi-day, and 4 active feeds in `golf_calendar_feeds` with a sync stamped
 * the same morning. Every one of the 14 is a tournament:
 *
 *   Transylvania Invite    2026-09-03 → 09-06   subscriber saw 09-03 → 09-05
 *   Canadian Collegiate    2026-09-13 → 09-15   subscriber saw 09-13 → 09-14
 *   Qubein Cup             2026-10-19 → 10-20   subscriber saw 10-19 alone
 *   NCAA Championship      2026-05-08 → 05-16   subscriber saw 05-08 → 05-15
 *
 * The missing day is the final round.
 *
 * SECOND DEFECT, same file: both date helpers read AMBIENT-ZONE calendar
 * fields and emit them into UTC-typed iCal properties.
 *
 *   formatDate     format(date, 'yyyyMMdd')                  -> local fields
 *   formatDateTime format(new Date(date.toISOString()), …'Z') -> local fields
 *
 * `new Date(date.toISOString())` is a round-trip that returns the same instant
 * — it reads like "convert to UTC" and does nothing at all, which is what let
 * the local read survive review. Vercel runs UTC, so production is correct
 * today; anywhere else every timed event in every subscribed calendar shifts
 * by the runtime offset. The zone assertions below are written to hold in any
 * zone, so the mandated Pacific/Kiritimati (+14) and Pacific/Midway (-11) runs
 * exercise them.
 */
import { describe, it, expect } from 'vitest';
import { generateCoachCalendar, convertToICalEvent } from '../ical';

/** A `golf_events` row exactly as `api/calendar/coach/[token]/route.ts` maps it. */
function eventRow(over: {
  id?: string;
  title?: string;
  start_date: string;
  end_date?: string | null;
  all_day?: boolean;
}) {
  return {
    id: over.id ?? 'evt-1',
    title: over.title ?? 'Event',
    description: null,
    location: null,
    course_name: null,
    start_date: over.start_date,
    end_date: over.end_date ?? null,
    // The route hardcodes both of these to null; the branch they guard is a
    // documented landmine (ical.ts:274). Keep them null so this test drives
    // the path production actually takes.
    start_time: null,
    end_time: null,
    all_day: over.all_day ?? false,
    recurrence_rule: null,
    created_at: null,
    updated_at: null,
  };
}

/** Pull one property's value out of the generated feed. */
function prop(ics: string, name: string): string | undefined {
  const line = ics.split('\r\n').find((l) => l.startsWith(name));
  return line?.slice(line.indexOf(':') + 1);
}

function feedFor(row: ReturnType<typeof eventRow>): string {
  return generateCoachCalendar('Nick Rini', [convertToICalEvent(row)], 'America/New_York');
}

describe('iCal all-day events — DTEND is exclusive (RFC 5545 §3.8.2.2)', () => {
  it('publishes the day AFTER the last day of a multi-day tournament', () => {
    // Transylvania Invite, as stored in production.
    const ics = feedFor(
      eventRow({
        title: 'Transylvania Invite',
        start_date: '2026-09-03T00:00:00+00:00',
        end_date: '2026-09-06T00:00:00+00:00',
        all_day: true,
      }),
    );

    expect(prop(ics, 'DTSTART;VALUE=DATE')).toBe('20260903');
    // 20260906 would end the event after Sep 5 — the final round vanishes.
    expect(prop(ics, 'DTEND;VALUE=DATE')).toBe('20260907');
  });

  it('gives a single-day all-day event a span a calendar can render', () => {
    const ics = feedFor(
      eventRow({
        title: 'Team Photo Day',
        start_date: '2026-08-14T00:00:00+00:00',
        end_date: '2026-08-14T00:00:00+00:00',
        all_day: true,
      }),
    );

    expect(prop(ics, 'DTSTART;VALUE=DATE')).toBe('20260814');
    expect(prop(ics, 'DTEND;VALUE=DATE')).toBe('20260815');
  });

  it('never emits a DTEND that is not strictly later than DTSTART', () => {
    // The RFC's own words: DTEND "MUST be later in time than the value of the
    // DTSTART property". A zero-length DATE span is malformed, and clients
    // disagree about how to recover from it.
    for (const [start, end] of [
      ['2026-08-14T00:00:00+00:00', '2026-08-14T00:00:00+00:00'],
      ['2026-10-19T00:00:00+00:00', '2026-10-20T00:00:00+00:00'],
      ['2026-05-08T00:00:00+00:00', '2026-05-16T00:00:00+00:00'],
    ]) {
      const ics = feedFor(
        eventRow({ start_date: start as string, end_date: end as string, all_day: true }),
      );
      const dtstart = prop(ics, 'DTSTART;VALUE=DATE');
      const dtend = prop(ics, 'DTEND;VALUE=DATE');
      expect(dtstart, `${start}..${end}`).toBeDefined();
      expect(dtend, `${start}..${end}`).toBeDefined();
      expect(Number(dtend), `${start}..${end}`).toBeGreaterThan(Number(dtstart));
    }
  });

  it('does not turn a spanless all-day event into an open-ended one', () => {
    // end_time is NOT NULL for all 44 all-day rows in production today, but a
    // row without one must still publish a single day rather than no DTEND —
    // an all-day VEVENT with no DTEND defaults to one day in most clients,
    // which is right, but leaving it implicit is not something to rely on.
    const ics = feedFor(
      eventRow({ start_date: '2026-08-14T00:00:00+00:00', end_date: null, all_day: true }),
    );
    expect(prop(ics, 'DTSTART;VALUE=DATE')).toBe('20260814');
    expect(prop(ics, 'DTEND;VALUE=DATE')).toBe('20260815');
  });
});

describe('iCal date helpers read UTC, not the runtime zone', () => {
  it('publishes the all-day date as written in UTC, in any runtime zone', () => {
    // The repo's settled doctrine for all-day events (`eventCalendarDay`, and
    // the Guilford one-day-early report it was written for): an all-day event
    // is persisted at UTC midnight and the date AS WRITTEN IN UTC is the
    // intended calendar date. Reading local fields off that instant moves it
    // a day west of Greenwich.
    const ics = feedFor(
      eventRow({ start_date: '2026-09-03T00:00:00+00:00', end_date: '2026-09-03T00:00:00+00:00', all_day: true }),
    );
    expect(prop(ics, 'DTSTART;VALUE=DATE')).toBe('20260903');
  });

  it('publishes a timed event at the instant it was stored, in any runtime zone', () => {
    // 14:00Z is 10:00 Eastern and 03:00 the next day in Kiritimati. The 'Z'
    // suffix means the digits before it MUST be UTC.
    const ics = feedFor(
      eventRow({
        title: 'Team Practice',
        start_date: '2026-09-03T14:00:00+00:00',
        end_date: '2026-09-03T16:30:00+00:00',
        all_day: false,
      }),
    );
    expect(prop(ics, 'DTSTART')).toBe('20260903T140000Z');
    expect(prop(ics, 'DTEND')).toBe('20260903T163000Z');
  });

  it('stamps DTSTAMP in UTC', () => {
    const ics = feedFor(
      eventRow({ start_date: '2026-09-03T14:00:00+00:00', end_date: null, all_day: false }),
    );
    const stamp = prop(ics, 'DTSTAMP');
    expect(stamp).toMatch(/^\d{8}T\d{6}Z$/);

    // Compare against a UTC rendering of "now" rather than a fixed value:
    // the two must agree to the minute in every zone.
    const now = new Date();
    const expectedPrefix =
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}` +
      `T${String(now.getUTCHours()).padStart(2, '0')}`;
    expect(stamp?.slice(0, expectedPrefix.length)).toBe(expectedPrefix);
  });
});
