import type { ChPlayerPeek } from '../../ui/PlayerPeek';
import { statsHref, type ChFilter } from '../../data/stats-filter';

/** A player's profile from Team stats, keeping the window and filter the coach is looking at. */
export function teamPlayerHref(id: string, filter: ChFilter): string {
  return statsHref('/golf/dashboard/stats', filter, { player: id });
}

/** The player peek (P003-C1) from a team grid row: what the page already holds, no reads of its own. */
export function gridPeek(g: { id: string; name: string; rounds: number; avg: number | null }): ChPlayerPeek {
  return { id: g.id, name: g.name, sub: `${g.rounds} ${g.rounds === 1 ? 'round' : 'rounds'} in this window`, avg: g.avg };
}
