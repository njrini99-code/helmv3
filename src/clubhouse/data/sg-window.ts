import type { ChSgWindow } from '../lib/sg-window-line';
import { lastTenRounds } from './figure-window';
import { holeRounds } from './round-scope';
import type { ChRound } from './season';

export type { ChSgWindow } from '../lib/sg-window-line';

/**
 * The rounds a player's strokes gained figure reads (F-0005): `playerStrokesGained`'s window, the last ten counted rounds, and of
 * those the ones with hole scores that carry a strokes gained total. Null when none does. Named where the figure is drawn
 * (lib/sg-window-line.ts), so "−6.1" under a season heading says it is "Last 8 · Jun–Jul".
 */
export function sgWindowOf(rounds: readonly ChRound[]): ChSgWindow | null {
  const dates = holeRounds(lastTenRounds(rounds))
    .filter((r) => r.strokes_gained_total != null)
    .map((r) => r.round_date.slice(0, 10))
    .sort();
  return dates.length ? { n: dates.length, from: dates[0]!, to: dates[dates.length - 1]! } : null;
}
