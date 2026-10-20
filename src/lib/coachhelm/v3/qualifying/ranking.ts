/**
 * The one qualifier standings order. The Clubhouse leaderboard
 * (src/clubhouse/screens/qualifiers/model.ts buildBoard), the selection
 * workspace (loader.ts rankCandidates) and the confirmation that writes
 * the squad (service.ts confirmSelection) all sort with this, so the
 * players shown above the cut line are the players confirmed.
 *
 * Order: total to par, then total strokes, then more rounds played, then
 * name. The last two keys only decide display order and the cut between
 * players level on to par and strokes, and the name key is a stand-in
 * until the owner rules on ties at the cut (§11.3, F-03): it makes the
 * outcome deterministic, not fair.
 *
 * Pure, with no imports, so server and client code can both use it.
 */

export interface StandingKey {
  toPar: number;
  total: number;
  played: number;
  name: string;
}

export function compareStandings(a: StandingKey, b: StandingKey): number {
  return a.toPar - b.toPar || a.total - b.total || b.played - a.played || a.name.localeCompare(b.name, 'en');
}

/** Level on the scoring keys (to par and strokes): such players share a displayed position. */
export function sameStanding(a: Pick<StandingKey, 'toPar' | 'total'>, b: Pick<StandingKey, 'toPar' | 'total'>): boolean {
  return a.toPar === b.toPar && a.total === b.total;
}
