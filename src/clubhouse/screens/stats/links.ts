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

/**
 * Where a player's page goes back to when it was opened from another section (`from`): "Roster" for a player opened from the
 * roster (coach audit 13 Nov 2026, §8 #7: the link said "Team stats"). Null: the page's own, Team stats.
 */
export function statsBackLink(from: string | null): { label: string; href: string } | null {
  return from === 'roster' ? { label: 'Roster', href: '/golf/dashboard/roster' } : null;
}

