import { describe, expect, it } from 'vitest';
import type { ChHomeEvent } from '../../../data/home';
import { eventHref, whenLabel } from '../event-links';

/**
 * F-0001 (audit 2026-11-13): a trip on Home says when it leaves, counting down to its departure, and "On the road" while the
 * team is away; it opens on Team Hub's Travel, where the trip lives, never Calendar (a trip has no event there).
 */
const trip = (over: Partial<ChHomeEvent> = {}, leaves: string | null = null): ChHomeEvent => ({
  id: 'trip-t1',
  title: 'Fall Invitational',
  type: 'travel',
  date: '2026-11-13',
  timezone: 'America/New_York',
  startIso: '2026-11-13T00:00:00Z',
  endIso: '2026-11-15T00:00:00Z',
  allDay: true,
  startLabel: 'All day',
  rangeLabel: 'Fri 13 – Sun 15 Nov',
  location: 'Pinehurst',
  invitees: null,
  going: null,
  conflict: false,
  trip: { id: 't1', leaves, back: '2026-11-15' },
  ...over,
});
// The team's clock: New York, so 5 PM UTC is noon there.
const at = (iso: string) => new Date(iso);

describe('a trip’s when-label', () => {
  it('F-0001 before it leaves: a countdown to the departure time on the day, the day and time before that', () => {
    const t = trip({ date: '2026-11-14' }, '2026-11-14T12:30:00.000Z');
    expect(whenLabel(t, at('2026-11-14T10:00:00Z')).text).toBe('Leaves in 2 h 30 min');
    expect(whenLabel(t, at('2026-11-14T12:00:00Z'))).toEqual({ text: 'Leaves in 30 min', soon: true });
    expect(whenLabel(t, at('2026-11-13T17:00:00Z')).text).toBe('Leaves tomorrow · 7:30 AM');
    expect(whenLabel(t, at('2026-11-11T17:00:00Z')).text).toBe('Leaves Sat · 7:30 AM');
  });

  it('F-0001 with no departure time: the day it leaves', () => {
    expect(whenLabel(trip({ date: '2026-11-14' }), at('2026-11-13T17:00:00Z')).text).toBe('Leaves tomorrow');
    expect(whenLabel(trip({ date: '2026-11-16' }), at('2026-11-13T17:00:00Z')).text).toBe('Leaves Mon');
  });

  it('F-0001 away: "On the road" and when the team is back, through the return day', () => {
    expect(whenLabel(trip(), at('2026-11-13T23:00:00Z'))).toEqual({ text: 'On the road · back Sun', soon: false });
    expect(whenLabel(trip(), at('2026-11-14T17:00:00Z')).text).toBe('On the road · back tomorrow');
    expect(whenLabel(trip(), at('2026-11-15T17:00:00Z')).text).toBe('On the road · back today');
    // Past its departure time on the day it leaves.
    expect(whenLabel(trip({}, '2026-11-13T12:30:00.000Z'), at('2026-11-13T13:00:00Z')).text).toBe('On the road · back Sun');
  });

  it('F-0001 opens the trip on Team Hub’s Travel', () => {
    expect(eventHref(trip())).toBe('/golf/dashboard/team-hub?tab=travel&trip=t1');
  });
});
