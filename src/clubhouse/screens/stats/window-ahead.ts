import { hasRange, rangeOf, withScope, type ChFilter, type ChRange } from '../../data/stats-filter';

/** The window switch's choices in its order (WindowSwitch): Last 5, 10 and 20, then the season and qualifier rounds. */
const RANGES: readonly ChRange[] = ['last5', 'last10', 'last20', 'season', 'qualifiers'];

/**
 * The filters a window switch from `f` would land on next door: the choice before and after the one shown, with the
 * same kinds, lengths, courses and picks (`withScope`, as the switch builds them). None under a custom date range, where
 * the switch shows "Custom" and has no neighbour.
 */
export function windowsAhead(f: ChFilter): ChFilter[] {
  if (hasRange(f)) return [];
  const at = RANGES.indexOf(rangeOf(f));
  return [RANGES[at - 1], RANGES[at + 1]].filter((r): r is ChRange => r !== undefined).map((r) => withScope(f, r));
}
