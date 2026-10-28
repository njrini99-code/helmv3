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
 * The Clubhouse board puts one rule before this order (`boardOrder` below,
 * owner decision 10): a card a round short ranks below every full card.
 * Clubhouse's Manage selections and Confirm squad rank with it too (owner
 * decision A: "Match the board"); Fairway's leaderboard and workspace keep
 * the plain order.
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

/**
 * The order the Clubhouse qualifier board ranks by (owner decision 10, B13.3): a card with fewer rounds in than the most
 * anyone on the board has is "short" and goes below every full card, so a player who skipped a round never stands over
 * one who played it; inside each group, `compareStandings`. Two players are level (share a position, or tie at the cut)
 * only inside one group.
 *
 * Built over the ranked set (every player with a scored round): "short" is measured against the most rounds in that
 * set. The board (src/clubhouse/screens/qualifiers/model.ts) and Clubhouse's Manage selections and Confirm squad
 * (loader.ts with `order: 'board'`) all rank with this one function, so the squad confirmed is the squad the board
 * showed above the line.
 */
export interface BoardOrder {
  /** Fewer rounds in than the most anyone in the set has. */
  short: (k: Pick<StandingKey, 'played'>) => boolean;
  /** Full cards first, then `compareStandings`. */
  compare: (a: StandingKey, b: StandingKey) => number;
  /** In the same group and level on to par and strokes. */
  level: (a: Pick<StandingKey, 'played' | 'toPar' | 'total'>, b: Pick<StandingKey, 'played' | 'toPar' | 'total'>) => boolean;
}

export function boardOrder(ranked: Iterable<Pick<StandingKey, 'played'>>): BoardOrder {
  let most = 0;
  for (const k of ranked) most = Math.max(most, k.played);
  const short = (k: Pick<StandingKey, 'played'>) => k.played < most;
  return {
    short,
    compare: (a, b) => Number(short(a)) - Number(short(b)) || compareStandings(a, b),
    level: (a, b) => short(a) === short(b) && sameStanding(a, b),
  };
}
