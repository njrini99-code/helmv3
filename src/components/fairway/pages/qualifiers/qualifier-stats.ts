/**
 * ============================================================================
 * Fairway · pages/qualifiers · field stats (pure)
 * ----------------------------------------------------------------------------
 * What the "The field" card reads. Two sources, kept apart on purpose:
 *
 *   • The live feed's totals (the board's standings): the field average per
 *     round, the spread from first to last, the shots across the travel cut.
 *     These exist for every scored qualifier, including one whose scores were
 *     keyed onto the entries as totals.
 *   • The linked round cards (golf_rounds for this qualifier, from the route
 *     page): the low round and who shot it, each round's scores, the
 *     round-over-round change, the distribution of rounds to par, and who
 *     moved after the latest round. These cover only the cards that exist;
 *     the card says how many scorecards they leave out.
 *
 * Scores compare on to-par whenever every round involved has it (courses can
 * differ by round); otherwise on strokes. Positions use the same golf ties
 * as the board (`deriveStandings`).
 * ========================================================================== */

import { deriveStandings, type Standing } from './qualifier-display';

/** A linked round card with a score. */
export interface LinkedRound {
  playerId: string;
  playerName: string;
  roundNumber: number;
  score: number;
  toPar: number | null;
}

/* ── From the feed totals ─────────────────────────────────────────────────── */

export interface FieldTotals {
  /** Scored players. */
  players: number;
  /** Completed rounds on the board. */
  cards: number;
  /** Strokes per round across the field. */
  averageScore: number | null;
  /** To par per round across the field. */
  averageToPar: number | null;
  /** First and last to-par on the board, and the shots between them. */
  spread: { best: number; worst: number; shots: number } | null;
  /** The last to-par inside the travel cut, the first outside, the gap. */
  travelCut: { lastIn: number; firstOut: number; shots: number } | null;
}

export function fieldTotals(standings: ReadonlyArray<Standing>, travelLine: number): FieldTotals {
  const scored = standings.filter((s) => s.hasScore);
  const withScore = scored.filter((s) => s.totalScore !== null);
  const withToPar = scored.filter((s) => s.totalToPar !== null);
  const rounds = (list: Standing[]) => list.reduce((n, s) => n + s.roundsCompleted, 0);
  const sum = (list: Standing[], pick: (s: Standing) => number | null) => list.reduce((n, s) => n + (pick(s) ?? 0), 0);

  const scoreRounds = rounds(withScore);
  const toParRounds = rounds(withToPar);
  const first = scored[0]?.totalToPar ?? null;
  const last = scored[scored.length - 1]?.totalToPar ?? null;
  const lastIn = travelLine > 0 ? (scored[travelLine - 1]?.totalToPar ?? null) : null;
  const firstOut = travelLine > 0 ? (scored[travelLine]?.totalToPar ?? null) : null;

  return {
    players: scored.length,
    cards: rounds(scored),
    averageScore: scoreRounds > 0 ? sum(withScore, (s) => s.totalScore) / scoreRounds : null,
    averageToPar: toParRounds > 0 ? sum(withToPar, (s) => s.totalToPar) / toParRounds : null,
    spread: scored.length >= 2 && first !== null && last !== null ? { best: first, worst: last, shots: last - first } : null,
    travelCut:
      lastIn !== null && firstOut !== null ? { lastIn, firstOut, shots: firstOut - lastIn } : null,
  };
}

/* ── From the linked round cards ──────────────────────────────────────────── */

const everyToPar = (rounds: ReadonlyArray<LinkedRound>): rounds is ReadonlyArray<LinkedRound & { toPar: number }> =>
  rounds.every((r) => typeof r.toPar === 'number');

/** The lowest round (on to-par when every card has it) and everyone who shot it. */
export function lowRound(rounds: ReadonlyArray<LinkedRound>): { score: number; toPar: number | null; holders: LinkedRound[] } | null {
  if (rounds.length === 0) return null;
  const onToPar = everyToPar(rounds);
  const key = (r: LinkedRound) => (onToPar ? (r.toPar as number) : r.score);
  const low = Math.min(...rounds.map(key));
  const holders = rounds
    .filter((r) => key(r) === low)
    .sort((a, b) => a.roundNumber - b.roundNumber || a.playerName.localeCompare(b.playerName));
  const first = holders[0] as LinkedRound;
  return { score: first.score, toPar: first.toPar, holders };
}

export interface RoundSummary {
  roundNumber: number;
  cards: number;
  averageScore: number | null;
  averageToPar: number | null;
  /** Each card's to-par, or null when a card lacks it. */
  toPars: Array<number | null>;
}

/** One summary per qualifier round, 1..numRounds (a round with no cards reads 0). */
export function roundSummaries(rounds: ReadonlyArray<LinkedRound>, numRounds: number): RoundSummary[] {
  const last = Math.max(numRounds, ...rounds.map((r) => r.roundNumber), 1);
  return Array.from({ length: last }, (_, i) => {
    const n = i + 1;
    const cards = rounds.filter((r) => r.roundNumber === n);
    const toPars = cards.map((r) => r.toPar);
    const known = toPars.filter((t): t is number => typeof t === 'number');
    return {
      roundNumber: n,
      cards: cards.length,
      averageScore: cards.length > 0 ? cards.reduce((s, r) => s + r.score, 0) / cards.length : null,
      averageToPar: known.length === cards.length && cards.length > 0 ? known.reduce((s, t) => s + t, 0) / known.length : null,
      toPars,
    };
  });
}

/**
 * The latest round against round 1, over the players who played both:
 * `delta` < 0 means the latest round ran lower (better).
 */
export function roundOverRound(
  rounds: ReadonlyArray<LinkedRound>,
): { from: number; to: number; players: number; delta: number } | null {
  const latest = Math.max(0, ...rounds.map((r) => r.roundNumber));
  if (latest < 2) return null;
  const firstBy = new Map(rounds.filter((r) => r.roundNumber === 1).map((r) => [r.playerId, r]));
  const pairs = rounds
    .filter((r) => r.roundNumber === latest)
    .flatMap((r) => {
      const first = firstBy.get(r.playerId);
      return first ? [[first, r] as const] : [];
    });
  if (pairs.length === 0) return null;
  const onToPar = pairs.every(([a, b]) => typeof a.toPar === 'number' && typeof b.toPar === 'number');
  const delta =
    pairs.reduce((s, [a, b]) => s + (onToPar ? (b.toPar as number) - (a.toPar as number) : b.score - a.score), 0) /
    pairs.length;
  return { from: 1, to: latest, players: pairs.length, delta };
}

export const DISTRIBUTION_BUCKETS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: 'Under par', min: -Infinity, max: -1 },
  { label: 'Even', min: 0, max: 0 },
  { label: '+1 to +2', min: 1, max: 2 },
  { label: '+3 to +4', min: 3, max: 4 },
  { label: '+5 to +7', min: 5, max: 7 },
  { label: '+8 or more', min: 8, max: Infinity },
];

/** Rounds by to-par bucket; null unless every card has a to-par. */
export function distribution(rounds: ReadonlyArray<LinkedRound>): Array<{ label: string; count: number }> | null {
  if (rounds.length === 0 || !everyToPar(rounds)) return null;
  return DISTRIBUTION_BUCKETS.map((b) => ({
    label: b.label,
    count: rounds.filter((r) => (r.toPar as number) >= b.min && (r.toPar as number) <= b.max).length,
  }));
}

export interface Mover {
  playerId: string;
  playerName: string;
  before: Pick<Standing, 'position' | 'tied'>;
  after: Pick<Standing, 'position' | 'tied'>;
  /** Places gained (positive) or lost (negative). */
  change: number;
  /** Their card in the latest round. */
  round: LinkedRound;
}

/**
 * Who moved after the latest round: golf positions through the round before
 * against positions through the latest round, over the players with a card in
 * every round up to it. Biggest moves first.
 */
export function movers(rounds: ReadonlyArray<LinkedRound>): { round: number; moves: Mover[] } | null {
  const latest = Math.max(0, ...rounds.map((r) => r.roundNumber));
  if (latest < 2) return null;

  const byPlayer = new Map<string, LinkedRound[]>();
  for (const r of rounds) byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);
  const through = [...byPlayer.values()].filter((list) =>
    Array.from({ length: latest }, (_, i) => i + 1).every((n) => list.some((r) => r.roundNumber === n)),
  );
  if (through.length < 2) return null;

  const standingsThrough = (n: number) =>
    deriveStandings(
      through.map((list) => {
        const upTo = list.filter((r) => r.roundNumber <= n);
        const toPars = upTo.map((r) => r.toPar);
        return {
          player_id: list[0]?.playerId ?? '',
          player_name: list[0]?.playerName ?? '',
          rounds_completed: upTo.length,
          total_score: upTo.reduce((s, r) => s + r.score, 0),
          total_to_par: toPars.every((t) => typeof t === 'number') ? (toPars as number[]).reduce((s, t) => s + t, 0) : null,
        };
      }),
    );
  const before = new Map(standingsThrough(latest - 1).map((s) => [s.playerId, s]));
  const after = standingsThrough(latest);

  const moves = after.flatMap((s) => {
    const was = before.get(s.playerId);
    const round = byPlayer.get(s.playerId)?.find((r) => r.roundNumber === latest);
    if (!was || was.position === null || s.position === null || !round) return [];
    const change = was.position - s.position;
    return change === 0
      ? []
      : [{ playerId: s.playerId, playerName: s.playerName, before: was, after: s, change, round }];
  });
  moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || (a.after.position ?? 0) - (b.after.position ?? 0));
  return { round: latest, moves };
}
