import type { ChPlayerPeek } from '../../ui/PlayerPeek';
import { statsHref, type ChFilter } from '../../data/stats-filter';
import type { ChLeg } from '../../data/stats-team';
import { LEG_SECTION } from './legs';
import { plural } from '../../lib/plural';

/** A player's profile from Team stats, keeping the window and filter the coach is looking at. */
export function teamPlayerHref(id: string, filter: ChFilter): string {
  return statsHref('/golf/dashboard/stats', filter, { player: id });
}

/** A player's Game detail section for one leg, from a team grid cell (decisions Q12): their profile on the Game detail tab, scrolled to that leg. */
export function legDetailHref(id: string, filter: ChFilter, leg: ChLeg): string {
  return `${statsHref('/golf/dashboard/stats', filter, { player: id, tab: 'game' })}#gm-${LEG_SECTION[leg]}`;
}

/** The player peek (P003-C1) from a team grid row: what the page already holds, no reads of its own. */
export function gridPeek(g: { id: string; name: string; rounds: number; avg: number | null; last?: ChPlayerPeek['lastRound'] }): ChPlayerPeek {
  return { id: g.id, name: g.name, sub: `${plural(g.rounds, 'round')} in this window`, lastRound: g.last ?? null, avg: g.avg };
}
