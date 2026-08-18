/**
 * FairwayCalendar — `countEventsInWindow` must exclude class meetings.
 *
 * Observed in production 2026-08-18, coach Ben Potter / Guilford College Men's
 * Golf. The calendar hero read:
 *
 *     23 upcoming · 875 in view
 *
 * Both numbers describe the same team on the same screen, and they are built
 * from different populations:
 *
 *   `liveUpcomingCount` filters `isClassEvent(e)` OUT, deliberately. Its own
 *   comment says why — "counting every lecture put the two numbers ~150x apart
 *   on the same screen for the same team. A player seeing '187 upcoming' on
 *   their calendar is being told their week is full of the team's business when
 *   most of it is their own timetable."
 *
 *   `windowCount` never got that filter.
 *
 * Measured against production for the agenda's focusDate ±3-month window:
 * 891 events in window, 864 of them class meetings — 97%. Only 27 are team
 * commitments. So the hero pairs "23 team commitments" with "875 mostly-
 * lectures" in one sentence, which is exactly the failure the sibling count
 * was fixed to avoid.
 *
 * This pins the two numbers to the same population.
 */
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { countEventsInWindow } from '../FairwayCalendar';
import { CLASS_EVENT_TYPE } from '@/lib/calendar/class-events';
import { zonedMidnight } from '@/lib/calendar/timezone';

function makeEvent(
  overrides: Partial<CalendarEvent> & { id: string; start_time: string },
): CalendarEvent {
  return {
    team_id: 'team-1',
    title: 'Event',
    event_type: 'practice',
    start_date: overrides.start_time,
    end_date: overrides.start_time,
    end_time: overrides.start_time,
    location: null,
    description: null,
    ...overrides,
  } as CalendarEvent;
}

/** A class meeting, tagged the way `isClassEvent` recognises them. */
function makeClassEvent(id: string, start: string): CalendarEvent {
  return makeEvent({
    id,
    start_time: start,
    event_type: CLASS_EVENT_TYPE as CalendarEvent['event_type'],
    title: `[class:c-${id}] Organic Chemistry`,
  });
}

const focusDate = new Date('2026-08-18T12:00:00Z');
const visibleWindow = {
  start: new Date('2026-08-01T00:00:00Z'),
  end: new Date('2026-08-31T00:00:00Z'),
};
const opts = { view: 'agenda' as const, focusDate, visibleWindow, teamTimezone: null };

describe('countEventsInWindow — class meetings are not team commitments', () => {
  it('counts only team events, not the individual class timetable', () => {
    const events: CalendarEvent[] = [
      makeEvent({ id: 'team-1', start_time: '2026-08-12T14:00:00Z' }),
      makeEvent({ id: 'team-2', start_time: '2026-08-20T14:00:00Z' }),
      makeClassEvent('c1', '2026-08-12T09:00:00Z'),
      makeClassEvent('c2', '2026-08-13T09:00:00Z'),
      makeClassEvent('c3', '2026-08-14T09:00:00Z'),
      makeClassEvent('c4', '2026-08-17T09:00:00Z'),
    ];

    // 6 events sit inside the window; only 2 are team commitments.
    expect(countEventsInWindow(events, opts)).toBe(2);
  });

  it('matches the population `liveUpcomingCount` uses, so the hero cannot pair two denominators', () => {
    // The production shape: team commitments are a tiny minority.
    const events: CalendarEvent[] = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeEvent({ id: `team-${i}`, start_time: '2026-08-10T15:00:00Z' }),
      ),
      ...Array.from({ length: 97 }, (_, i) => makeClassEvent(`c${i}`, '2026-08-10T09:00:00Z')),
    ];

    expect(countEventsInWindow(events, opts)).toBe(3);
  });

  it('still excludes classes in the day lens', () => {
    // The day branch buckets by `eventDaySpan(e, teamTimezone)` and compares
    // against `focusDate`. Production builds that focus as
    // `zonedMidnight(serverNow, teamTimezone)` (see `initialFocus`), so the
    // fixture has to as well — handing it a bare UTC instant makes the
    // comparison runtime-zone dependent and the test fails under TZ=+14 for a
    // reason that has nothing to do with class filtering.
    const dayFocus = zonedMidnight(new Date('2026-08-18T12:00:00Z'), null);
    const events: CalendarEvent[] = [
      makeEvent({ id: 'team-1', start_time: '2026-08-18T14:00:00Z' }),
      makeClassEvent('c1', '2026-08-18T09:00:00Z'),
    ];

    expect(
      countEventsInWindow(events, { ...opts, view: 'day' as const, focusDate: dayFocus }),
    ).toBe(1);
  });

  it('counts a team event with no class events present', () => {
    const events: CalendarEvent[] = [
      makeEvent({ id: 'team-1', start_time: '2026-08-12T14:00:00Z' }),
      makeEvent({ id: 'team-2', start_time: '2026-08-20T14:00:00Z' }),
    ];
    expect(countEventsInWindow(events, opts)).toBe(2);
  });

  it('excludes events outside the window', () => {
    const events: CalendarEvent[] = [
      makeEvent({ id: 'in', start_time: '2026-08-12T14:00:00Z' }),
      makeEvent({ id: 'before', start_time: '2026-07-12T14:00:00Z' }),
      makeEvent({ id: 'after', start_time: '2026-09-12T14:00:00Z' }),
    ];
    expect(countEventsInWindow(events, opts)).toBe(1);
  });
});
