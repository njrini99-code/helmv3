/**
 * FairwayCalendar — `sortEventsStably` (findings #37/#166/#185/#83).
 *
 * `useCalendarRangeEvents` merges the server payload with client-fetched
 * pages into a `Map` whose iteration order depends on which request landed
 * first, not on the event data. Two events sharing an identical start_time
 * could therefore trade places from one render to the next — including
 * across an "identical" reload — because a plain stable sort just preserves
 * whatever order the merge handed it. `sortEventsStably` makes the final
 * order a pure function of (start_time, id), independent of fetch/merge
 * timing, so the SAME input data always renders in the SAME order no matter
 * what order it arrives in.
 */
import { describe, it, expect } from 'vitest';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { sortEventsStably } from '../FairwayCalendar';

function makeEvent(overrides: Partial<CalendarEvent> & { id: string; start_time: string }): CalendarEvent {
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

describe('sortEventsStably', () => {
  it('orders events with distinct start times chronologically regardless of input order', () => {
    const early = makeEvent({ id: 'z-early', start_time: '2026-07-01T10:00:00Z' });
    const late = makeEvent({ id: 'a-late', start_time: '2026-07-02T10:00:00Z' });

    expect(sortEventsStably([late, early]).map((e) => e.id)).toEqual(['z-early', 'a-late']);
    expect(sortEventsStably([early, late]).map((e) => e.id)).toEqual(['z-early', 'a-late']);
  });

  // The regression: two rows sharing an IDENTICAL start_time (the same
  // instant) — e.g. the residual data-layer race this package root-causes —
  // must resolve to the SAME order no matter which one the merge/fetch race
  // happened to place first in the input array.
  it('breaks identical-start-time ties by id, the SAME way regardless of input order', () => {
    const sameTime = '2026-07-01T10:00:00Z';
    const eventA = makeEvent({ id: 'evt-aaa', start_time: sameTime });
    const eventB = makeEvent({ id: 'evt-bbb', start_time: sameTime });

    const orderOne = sortEventsStably([eventA, eventB]).map((e) => e.id);
    const orderTwo = sortEventsStably([eventB, eventA]).map((e) => e.id);

    expect(orderOne).toEqual(['evt-aaa', 'evt-bbb']);
    expect(orderTwo).toEqual(orderOne);
  });

  it('produces an identical order across 10 independent calls ("10 reloads") with shuffled input', () => {
    const sameTime = '2026-07-01T10:00:00Z';
    const events = [
      makeEvent({ id: 'evt-1', start_time: sameTime }),
      makeEvent({ id: 'evt-2', start_time: sameTime }),
      makeEvent({ id: 'evt-3', start_time: '2026-07-01T09:00:00Z' }),
    ];

    const results: string[][] = [];
    for (let i = 0; i < 10; i++) {
      // Simulate a different fetch/merge landing order on each "reload".
      const shuffled = i % 2 === 0 ? [...events] : [...events].reverse();
      results.push(sortEventsStably(shuffled).map((e) => e.id));
    }

    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it('does not mutate the input array', () => {
    const events = [
      makeEvent({ id: 'b', start_time: '2026-07-02T10:00:00Z' }),
      makeEvent({ id: 'a', start_time: '2026-07-01T10:00:00Z' }),
    ];
    const originalOrder = events.map((e) => e.id);
    sortEventsStably(events);
    expect(events.map((e) => e.id)).toEqual(originalOrder);
  });
});
