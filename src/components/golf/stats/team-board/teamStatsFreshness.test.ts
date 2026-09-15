import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { earliestTimestamp, formatTeamStatsFreshness, formatTeamStatsFreshnessHeadline } from './teamStatsFreshness';

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

describe('formatTeamStatsFreshnessHeadline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-18T18:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads as ONE relative line from the most recent "as of" source, never raw UTC', () => {
    expect(
      formatTeamStatsFreshnessHeadline({
        roundRefreshMinutes: 5,
        statsCacheAsOf: '2026-08-18T16:00:00.000Z',
        statsCacheStale: false,
        standingAsOf: '2026-08-18T02:20:46.000Z',
        oldestSignalInsightAsOf: '2026-08-17T19:00:00.000Z',
      }),
    ).toBe('Updated 2h ago');
  });

  it('ignores the oldest-signal-insight source (deliberately the OLDEST snapshot, not the freshest)', () => {
    expect(
      formatTeamStatsFreshnessHeadline({
        roundRefreshMinutes: 5,
        statsCacheAsOf: null,
        statsCacheStale: false,
        standingAsOf: null,
        oldestSignalInsightAsOf: '2026-08-18T17:59:00.000Z',
      }),
    ).toBe('Refreshes within 5 min');
  });

  it('falls back to the refresh cadence when no as-of source is available', () => {
    expect(
      formatTeamStatsFreshnessHeadline({
        roundRefreshMinutes: 5,
        statsCacheAsOf: null,
        statsCacheStale: false,
        standingAsOf: null,
        oldestSignalInsightAsOf: null,
      }),
    ).toBe('Refreshes within 5 min');
  });
});
