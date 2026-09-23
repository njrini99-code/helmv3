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
    // day. Verified (not assumed): date-fns' addMonths rolls the overflow
    // into March 1 rather than clamping to Feb 28 — this pins that actual
    // behavior so a future date-fns upgrade that changes it is caught here,
    // not discovered silently in a rendered date range.
    const now = new Date('2028-02-29T00:00:00.000Z');
    const scope = buildRollingDistanceProfileScope('player-1', now);
    expect(scope.window_start).toBe('2027-03-01');
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
