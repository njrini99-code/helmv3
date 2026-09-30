import { statsHref, type ChFilter } from '../../data/stats-filter';

/** A player's profile from Team stats, keeping the window and filter the coach is looking at. */
export function teamPlayerHref(id: string, filter: ChFilter): string {
  return statsHref('/golf/dashboard/stats', filter, { player: id });
}
