import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

type MissCells = Pick<GolfStats, 'approachMissShortPct' | 'approachMissShortLeftPct' | 'approachMissShortRightPct' | 'approachMissLongPct' | 'approachMissLongLeftPct' | 'approachMissLongRightPct'>;

/**
 * Missed short and long, as shares of missed greens. The calculator's `approachMissShortPct` and `approachMissLongPct` already
 * include their corners, so with `corrected` (clubhouse_stats_redesign_v1) each is read alone; without it, the corners are
 * added again, as main does, so the flag-off app is unchanged (03-DATA-CHECKS problem 1).
 */
export function missSplit(s: MissCells, corrected: boolean): { short: number; long: number } {
  if (corrected) return { short: s.approachMissShortPct ?? 0, long: s.approachMissLongPct ?? 0 };
  return {
    short: (s.approachMissShortPct ?? 0) + (s.approachMissShortLeftPct ?? 0) + (s.approachMissShortRightPct ?? 0),
    long: (s.approachMissLongPct ?? 0) + (s.approachMissLongLeftPct ?? 0) + (s.approachMissLongRightPct ?? 0),
  };
}
