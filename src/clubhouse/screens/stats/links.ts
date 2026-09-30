import type { ChWindow } from '../../data/stats-common';

/** A player's profile from Team stats, keeping the window the coach is looking at. */
export function teamPlayerHref(id: string, window: ChWindow): string {
  return `/golf/dashboard/stats?player=${id}${window === 'last10' ? '' : `&window=${window}`}`;
}
