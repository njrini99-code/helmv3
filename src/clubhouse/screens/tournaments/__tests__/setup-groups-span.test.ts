import { describe, expect, it } from 'vitest';
import { calendarEntryOf, setupGroups } from '../setup-groups';
import { setUpLine } from '../TournamentsHome';

/*
 * F-0025 (audit 2026-11-13): "Set up from calendar" dated each calendar entry by its start only, so a three-day tournament entered as
 * one entry read "Tri-State Invitational · Aug 27 · 1 calendar entry" for 27 to 29 August. An entry now carries its own last day, read
 * as the calendar reads it (lib/calendar/timezone eventDaySpan), and the row shows the span.
 */

const TZ = 'America/New_York';

describe('F-0025 a calendar entry carries its last day', () => {
  it('Tri-State: one timed entry, 27 Aug 07:30 to 29 Aug 17:00 Eastern, reads Aug 27 – 29', () => {
    const e = calendarEntryOf({ id: 't', title: 'Tri-State Invitational', start_time: '2026-08-27T11:30:00+00:00', end_time: '2026-08-29T21:00:00+00:00', all_day: false }, TZ);
    expect(e).toEqual({ id: 't', title: 'Tri-State Invitational', date: '2026-08-27', end: '2026-08-29' });
    const [g] = setupGroups([e]);
    expect(g).toEqual({ eventIds: ['t'], title: 'Tri-State Invitational', first: '2026-08-27', last: '2026-08-29' });
    expect(setUpLine(g!)).toBe('Aug 27 – 29 · 1 calendar entry');
  });

  it("Fall Invitational: all day on the team's own day edges (04:00Z to 03:59Z) is 2 and 3 Oct, not a third day", () => {
    const e = calendarEntryOf({ id: 'f', title: 'Fall Invitational', start_time: '2026-10-02T04:00:00+00:00', end_time: '2026-10-04T03:59:00+00:00', all_day: true }, TZ);
    expect([e.date, e.end]).toEqual(['2026-10-02', '2026-10-03']);
    expect(setUpLine(setupGroups([e])[0]!)).toBe('Oct 2 – 3 · 1 calendar entry');
  });

  it("the app's own all-day rows (UTC midnight, inclusive end) keep their dates", () => {
    const e = calendarEntryOf({ id: 'a', title: 'Labor Day Classic', start_time: '2026-09-03T00:00:00+00:00', end_time: '2026-09-06T00:00:00+00:00', all_day: true }, TZ);
    expect([e.date, e.end]).toEqual(['2026-09-03', '2026-09-06']);
  });

  it('one day, or no end at all, is one day', () => {
    expect(calendarEntryOf({ id: 'o', title: 'Wolfpack Classic', start_time: '2026-11-01T13:00:00+00:00', end_time: '2026-11-01T22:00:00+00:00', all_day: false }, TZ)).toEqual({ id: 'o', title: 'Wolfpack Classic', date: '2026-11-01', end: '2026-11-01' });
    expect(calendarEntryOf({ id: 'n', title: 'Wolfpack Classic', start_time: '2026-11-01T13:00:00+00:00', end_time: null, all_day: false }, TZ).end).toBe('2026-11-01');
  });

  it('a round a day still groups, and the group ends on its latest day', () => {
    const g = setupGroups([
      { id: 'a', title: 'Fall Classic · R1', date: '2026-10-02', end: '2026-10-02' },
      { id: 'b', title: 'Fall Classic · R2', date: '2026-10-03', end: '2026-10-04' },
    ]);
    expect(g).toEqual([{ eventIds: ['a', 'b'], title: 'Fall Classic', first: '2026-10-02', last: '2026-10-04' }]);
  });
});
