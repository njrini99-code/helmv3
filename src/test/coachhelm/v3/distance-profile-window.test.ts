import { describe, expect, it } from 'vitest';
import {
  buildRollingDistanceProfileScope,
  describeDistanceProfileWindow,
} from '@/lib/coachhelm/v3/metrics/distance-profile-window';

describe('buildRollingDistanceProfileScope', () => {
  it('builds a closed [12-months-ago, now] window, scoped to the given player', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    const scope = buildRollingDistanceProfileScope('player-1', now);

    expect(scope.player_id).toBe('player-1');
    expect(scope.window_start).toBe('2025-09-23');
    expect(scope.window_end).toBe('2026-09-23');
    expect(scope.analysis_cutoff).toBe('2026-09-23T12:00:00.000Z');
  });

  it('handles a leap-year Feb 29 "now" without producing an invalid date', () => {
    // 2027 is not a leap year, so Feb 29 minus 12 months has no exact target
    // day. The deliberate, TZ-independent decision (computed via
    // `subtractMonthsUTC`, entirely on UTC calendar fields): CLAMP to the
    // target month's last day, Feb 28, 2027 — never roll into March.
    //
    // This used to assert '2027-03-01', pinning `date-fns`' `addMonths`
    // called directly on a UTC-midnight `now`. That assertion only passed
    // because `addMonths` reads LOCAL getters: in America/New_York (a
    // negative-offset zone), a UTC-midnight instant reads back as the
    // PREVIOUS local calendar day, so the local computation actually ran
    // on Feb 28 (no overflow at all), and its preserved local time-of-day
    // converted back to UTC as March 1 — a timezone artifact, not a
    // decision about the leap-year case. CI runs in UTC, where the same
    // `addMonths` call legitimately clamped to Feb 28 — the SAME answer
    // this test now pins directly, deliberately, and without depending on
    // the process's timezone at all.
    const now = new Date('2028-02-29T00:00:00.000Z');
    const scope = buildRollingDistanceProfileScope('player-1', now);
    expect(scope.window_start).toBe('2027-02-28');
    expect(scope.window_end).toBe('2028-02-29');
  });
});

describe('describeDistanceProfileWindow', () => {
  it('labels a real rolling window with both its dates, so a coach never mistakes it for a different screen\'s numbers', () => {
    const scope = buildRollingDistanceProfileScope('player-1', new Date('2026-09-23T12:00:00.000Z'));
    expect(describeDistanceProfileWindow(scope)).toBe('Last 12 months (September 23, 2025–September 23, 2026)');
  });

  it('falls back to a neutral label for a scope with no window (never fabricates one)', () => {
    expect(
      describeDistanceProfileWindow({
        player_id: 'player-1',
        window_start: null,
        window_end: null,
        analysis_cutoff: '2026-09-23T12:00:00.000Z',
      }),
    ).toBe('All recorded rounds');
  });
});
