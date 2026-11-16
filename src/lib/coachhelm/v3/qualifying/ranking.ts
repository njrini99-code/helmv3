/**
 * The one qualifier standings order, decided here and nowhere else (owner, 2026-10-28: "the server decides qualifier
 * tie order once, and both Clubhouse and Fairway use it").
 *
 * The rule is the Clubhouse board's (`boardOrder` below; owner decision 10 and decision A, "Match the board"):
 *   1. a card a round short (fewer rounds in than the most anyone ranked has) goes below every full card;
 *   2. then total to par, then total strokes (`compareStandings`);
 *   3. then the qualifier's tie rule (launch readiness F-04, owner 2026-11-15): `last_round`, the default for a new
 *      qualifier, separates players level on to par and strokes by the lower last round, then the round before, and
 *      so on (the NCAA order for individuals); `coach`, every qualifier made before it, separates nobody;
 *   4. then more rounds played, then name. These two keys only fix the display order inside a tie: players still level
 *      share a position ("T3"), and a tie at the last place on score waits for the coach (Q-114), so name order never
 *      puts anyone in or out.
 *
 * `rankStandings` applies it once and hands back each player's explicit rank (physical order, what the cut lines
 * count), golf position (shared by level players) and tie flag. Every surface reads those instead of sorting itself:
 * the selection workspace and its confirm (loader.ts rankCandidates), the Clubhouse board
 * (src/clubhouse/screens/qualifiers/model.ts), Fairway's live leaderboard (qualifier-display.ts deriveStandings) and
 * Ask's get_qualifiers (chat/read-tools.ts). Callers no longer choose an order.
 *
 * Pure, with no imports, so server and client code can both use it.
 */

export interface StandingKey {
  toPar: number;
  total: number;
  played: number;
  name: string;
  /** Strokes by qualifier round, index 0 for round 1 (null: no score in that round). Read only by the `last_round` rule. */
  rounds?: ReadonlyArray<number | null>;
}

/**
 * How a qualifier separates players level on to par and strokes. `coach`: nobody is separated, and a tie at the cut
 * waits for the coach (Q-114). `last_round`: the lower score in the last round both played, then the round before.
 */
export type QualifierTieRule = 'coach' | 'last_round';
export const QUALIFIER_TIE_RULES: readonly QualifierTieRule[] = ['coach', 'last_round'];

/** The last round, then the one before: lower is better; 0 when every round both played is level (or there is none). */
export function countback(a: Pick<StandingKey, 'rounds'>, b: Pick<StandingKey, 'rounds'>): number {
  const ra = a.rounds ?? [];
  const rb = b.rounds ?? [];
  for (let i = Math.max(ra.length, rb.length) - 1; i >= 0; i -= 1) {
    const x = ra[i];
    const y = rb[i];
    if (x != null && y != null && x !== y) return x - y;
  }
  return 0;
}

const tieBreak = (rule: QualifierTieRule, a: StandingKey, b: StandingKey): number => (rule === 'last_round' ? countback(a, b) : 0);

export function compareStandings(a: StandingKey, b: StandingKey, rule: QualifierTieRule = 'coach'): number {
  return a.toPar - b.toPar || a.total - b.total || tieBreak(rule, a, b) || b.played - a.played || a.name.localeCompare(b.name, 'en');
}

/** Level on the scoring keys (to par and strokes): such players share a displayed position. */
export function sameStanding(a: Pick<StandingKey, 'toPar' | 'total'>, b: Pick<StandingKey, 'toPar' | 'total'>): boolean {
  return a.toPar === b.toPar && a.total === b.total;
}

/**
 * The board order (owner decision 10, B13.3): a card with fewer rounds in than the most anyone in the set has is
 * "short" and goes below every full card, so a player who skipped a round never stands over one who played it; inside
 * each group, `compareStandings`. Two players are level (share a position, or tie at the cut) only inside one group.
 *
 * Built over the ranked set (every player with a scored round): "short" is measured against the most rounds in that
 * set. Prefer `rankStandings`, which applies it and assigns rank and position.
 */
export interface BoardOrder {
  /** Fewer rounds in than the most anyone in the set has. */
  short: (k: Pick<StandingKey, 'played'>) => boolean;
  /** Full cards first, then `compareStandings`. */
  compare: (a: StandingKey, b: StandingKey) => number;
  /** In the same group, level on to par and strokes, and not separated by the tie rule. */
  level: (a: Pick<StandingKey, 'played' | 'toPar' | 'total' | 'rounds'>, b: Pick<StandingKey, 'played' | 'toPar' | 'total' | 'rounds'>) => boolean;
}

export function boardOrder(ranked: Iterable<Pick<StandingKey, 'played'>>, rule: QualifierTieRule = 'coach'): BoardOrder {
  let most = 0;
  for (const k of ranked) most = Math.max(most, k.played);
  const short = (k: Pick<StandingKey, 'played'>) => k.played < most;
  return {
    short,
    compare: (a, b) => Number(short(a)) - Number(short(b)) || compareStandings(a, b, rule),
    level: (a, b) => short(a) === short(b) && sameStanding(a, b) && (rule !== 'last_round' || countback(a, b) === 0),
  };
}

/** One scored player placed by the one order. */
export interface PlacedStanding<T> {
  item: T;
  /** 1-based physical order among the scored players: what the cut lines and "top N" count. */
  rank: number;
  /** Golf position: level players (same group, same to par and strokes) share it, and the next one skips (1, T2, T2, 4). */
  position: number;
  /** Shares its position with another player. */
  tied: boolean;
  /** A card a round short of the most anyone ranked has (owner decision 10). */
  short: boolean;
}

/**
 * Rank scored players once, in the one order. `scored` must hold only players with a counted round; the input is not
 * mutated and its order never matters. Every qualifier surface takes its order, rank and positions from here.
 */
export function rankStandings<T>(scored: ReadonlyArray<T>, keyOf: (item: T) => StandingKey, rule: QualifierTieRule = 'coach'): PlacedStanding<T>[] {
  const keyed = scored.map((item) => ({ item, key: keyOf(item) }));
  const order = boardOrder(
    keyed.map((k) => k.key),
    rule,
  );
  keyed.sort((a, b) => order.compare(a.key, b.key));
  const placed: PlacedStanding<T>[] = [];
  keyed.forEach(({ item, key }, i) => {
    const prev = placed[i - 1];
    const levelWithPrev = prev !== undefined && order.level(keyed[i - 1]!.key, key);
    if (levelWithPrev) prev.tied = true;
    placed.push({ item, rank: i + 1, position: levelWithPrev ? prev.position : i + 1, tied: levelWithPrev, short: order.short(key) });
  });
  return placed;
}
