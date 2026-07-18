import { describe, it, expect } from 'vitest';
import { honestRoundsDelta } from '../page';

/**
 * ============================================================================
 * honestRoundsDelta (bug #949 #6 — "Rounds this week" stray arrow, no sparkline)
 * ----------------------------------------------------------------------------
 * The KpiTile's `delta` used to be unconditional (`roundsThisWeek -
 * roundsLastWeek`), decoupled from the `trendData` sparkline's own 2-point
 * floor. A team with <2 weeks of `roundsByWeek` history rendered the
 * TrendChip arrow with no sparkline beneath it. This locks the fix: the
 * delta is only ever honest (a real number) when the trend series that will
 * accompany it actually has enough points to draw.
 * ========================================================================== */
describe('honestRoundsDelta', () => {
  it('is undefined with fewer than 2 weeks of history (no arrow without its sparkline)', () => {
    expect(honestRoundsDelta([], 5, 0)).toBeUndefined();
    expect(honestRoundsDelta([{ week: '2026-07-13', count: 5 }], 5, 0)).toBeUndefined();
  });

  it('is the real week-over-week delta once 2+ weeks of history exist', () => {
    const roundsByWeek = [
      { week: '2026-07-06', count: 3 },
      { week: '2026-07-13', count: 5 },
    ];
    expect(honestRoundsDelta(roundsByWeek, 5, 3)).toBe(2);
  });

  it('a real zero-round last week still yields a real (not fabricated) delta once history exists', () => {
    const roundsByWeek = [
      { week: '2026-07-06', count: 0 },
      { week: '2026-07-13', count: 4 },
    ];
    expect(honestRoundsDelta(roundsByWeek, 4, 0)).toBe(4);
  });
});
