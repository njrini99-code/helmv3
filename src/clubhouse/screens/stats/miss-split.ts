import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

type MissCells = Pick<GolfStats, 'approachMissShortPct' | 'approachMissLongPct'>;

/**
 * Missed short and long, as shares of missed greens. The calculator's `approachMissShortPct` and `approachMissLongPct` already
 * include their corners, so each is read alone (adding the corners again counted them twice; 03-DATA-CHECKS problem 1).
 */
export function missSplit(s: MissCells): { short: number; long: number } {
  return { short: s.approachMissShortPct ?? 0, long: s.approachMissLongPct ?? 0 };
}
