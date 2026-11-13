import type { GolfStats } from '@/lib/utils/golf-stats-calculator-shots';

/**
 * Make rate by break, from 3 to 10 feet. Tap-ins (0–3 ft) are left out: the shot form tags them "straight" by default,
 * so with them in, "Straight" read 100% on the strength of 1-foot putts (coach audit 13 Nov, Braeden's 128).
 */
export function breakMake(b: GolfStats['puttingByBreak']['straight']): { rate: number | null; putts: number } {
  const putts = b.count3_5 + b.count5_10;
  if (!putts) return { rate: null, putts: 0 };
  return { rate: ((b.makePct3_5 ?? 0) * b.count3_5 + (b.makePct5_10 ?? 0) * b.count5_10) / putts, putts };
}
