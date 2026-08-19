import { describe, expect, it } from 'vitest';
import { earliestTimestamp, formatTeamStatsFreshness } from './teamStatsFreshness';

describe('formatTeamStatsFreshness', () => {
  it('identifies every source a right-side signal can use without calling it live', () => {
    expect(
      formatTeamStatsFreshness({
        roundRefreshMinutes: 5,
        statsCacheAsOf: '2026-08-18T16:00:00.000Z',
        statsCacheStale: true,
        standingAsOf: '2026-08-18T02:20:46.000Z',
        oldestSignalInsightAsOf: '2026-08-17T19:00:00.000Z',
      }),
    ).toBe(
      'Round results refresh within 5 min · stats cache as of 2026-08-18 16:00 UTC (refresh pending) · rank snapshot as of 2026-08-18 02:20 UTC · oldest signal insight: 2026-08-17 19:00 UTC',
    );
  });

  it('does not invent an as-of time when a supplemental source is unavailable', () => {
    expect(
      formatTeamStatsFreshness({
        roundRefreshMinutes: 5,
        statsCacheAsOf: null,
        statsCacheStale: false,
        standingAsOf: null,
        oldestSignalInsightAsOf: null,
      }),
    ).toBe('Round results refresh within 5 min');
  });
});

describe('earliestTimestamp', () => {
  it('uses the oldest contributing snapshot so freshness never hides a stale signal source', () => {
    expect(
      earliestTimestamp([
        '2026-08-18T16:00:00.000Z',
        null,
        '2026-08-17T19:00:00.000Z',
        'invalid',
      ]),
    ).toBe('2026-08-17T19:00:00.000Z');
  });
});
