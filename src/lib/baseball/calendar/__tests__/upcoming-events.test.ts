// =============================================================================
// src/lib/baseball/calendar/__tests__/upcoming-events.test.ts
//
// Regression coverage for the Calendar "Today" timezone bug (visual-audit
// coach-team-ops.md, [BROKEN]): the event-summary strip used to derive
// "today" from the SERVER RUNTIME's own `new Date()` (UTC on Vercel), which
// in the evening Eastern hours silently promotes tomorrow (UTC) to "today"
// and drops the team's own-day events from the headline/badges. This test
// reproduces the exact repro instant from the audit — captured ~10:42pm
// Eastern, which is already past midnight UTC — and asserts an
// America/New_York event still counts as "upcoming" for its own team-local
// day.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { computeUpcomingEventsSummary } from '../upcoming-events';

describe('computeUpcomingEventsSummary', () => {
  it('counts a team-local evening event as upcoming even when the UTC instant has already rolled to the next calendar day', () => {
    // 2026-07-16T02:42:00.000Z = 2026-07-15T22:42:00 America/New_York (EDT,
    // UTC-4) — the exact evening-capture scenario from the audit: the
    // server's own UTC date is already "the 16th" while the team's real day
    // is still "the 15th."
    const now = new Date('2026-07-16T02:42:00.000Z');

    // A practice at 4pm Eastern on the 15th — well within "today" for the
    // team, but before the OLD buggy UTC-midnight boundary (2026-07-16T00:00:00Z),
    // so the old code excluded it entirely.
    const events = [
      { start_time: '2026-07-15T20:00:00.000Z', event_type: 'practice' },
    ];

    const result = computeUpcomingEventsSummary(events, 'America/New_York', now);

    expect(result.upcomingEvents).toBe(1);
    expect(result.eventTypeCounts).toEqual({ practice: 1 });
  });

  it('excludes an event from a genuinely earlier team-local day', () => {
    const now = new Date('2026-07-16T02:42:00.000Z'); // 2026-07-15 evening ET
    const events = [
      // 2026-07-14T20:00:00Z = 2026-07-14T16:00 ET — yesterday for the team.
      { start_time: '2026-07-14T20:00:00.000Z', event_type: 'practice' },
    ];

    const result = computeUpcomingEventsSummary(events, 'America/New_York', now);

    expect(result.upcomingEvents).toBe(0);
    expect(result.eventTypeCounts).toEqual({});
  });

  it('headline count and per-type badges always agree (single filtered list)', () => {
    const now = new Date('2026-07-16T02:42:00.000Z');
    const events = [
      { start_time: '2026-07-15T20:00:00.000Z', event_type: 'practice' },
      { start_time: '2026-07-15T22:00:00.000Z', event_type: 'game' },
      { start_time: '2026-07-14T20:00:00.000Z', event_type: 'meeting' }, // excluded (yesterday, team-local)
    ];

    const result = computeUpcomingEventsSummary(events, 'America/New_York', now);

    const badgeTotal = Object.values(result.eventTypeCounts).reduce((a, b) => a + b, 0);
    expect(result.upcomingEvents).toBe(badgeTotal);
    expect(result.upcomingEvents).toBe(2);
  });

  it('degrades honestly to the UTC boundary for an empty/invalid timezone (never throws)', () => {
    const now = new Date('2026-07-16T02:42:00.000Z');
    const events = [
      { start_time: '2026-07-16T01:00:00.000Z', event_type: 'practice' }, // "today" in UTC
      { start_time: '2026-07-15T20:00:00.000Z', event_type: 'game' }, // "yesterday" in UTC
    ];

    const result = computeUpcomingEventsSummary(events, '', now);

    expect(result.upcomingEvents).toBe(1);
    expect(result.eventTypeCounts).toEqual({ practice: 1 });
  });

  it('falls back to start_date when start_time is absent, and skips events with neither', () => {
    const now = new Date('2026-07-16T02:42:00.000Z');
    const events = [
      { start_date: '2026-07-15T20:00:00.000Z', event_type: 'practice' },
      { event_type: 'other' }, // no start_time/start_date at all
    ];

    const result = computeUpcomingEventsSummary(events, 'America/New_York', now);

    expect(result.upcomingEvents).toBe(1);
    expect(result.eventTypeCounts).toEqual({ practice: 1 });
  });
});
