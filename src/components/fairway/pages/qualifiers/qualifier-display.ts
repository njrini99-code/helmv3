/**
 * ============================================================================
 * Fairway · pages/qualifiers · display helpers (pure)
 * ----------------------------------------------------------------------------
 * The small shared rules every qualifier surface reads the same way:
 *
 *   • `qualifierDisplayName` — the title a person sees. "Fall Qualifier —
 *     Travel Team Selection" shows as "Fall Qualifier" (owner 2026-09-27). The
 *     DB name is unchanged, and the edit form always shows and saves the full
 *     name: this is display only.
 *   • `toParTone` — ONE colour rule for a score to par: under par in the
 *     contrasting green ink, even par quiet, over par plain ink. Over par is
 *     never amber: most rows in a college field are over par, and a board of
 *     amber reads as a board of warnings.
 *   • `deriveStandings` — golf standings off the live feed, placed by the
 *     one order (`rankStandings` in lib/coachhelm/v3/qualifying/ranking.ts,
 *     the function the server's workspace, confirm and the Clubhouse board
 *     use): a card a round short below every full card, then to par,
 *     strokes, more rounds, name. Players level on to par AND strokes in the
 *     same group share the position and every tied row reads "T"; the next
 *     position skips (1, T2, T2, 4). `rank` is the physical order among
 *     scored players, which is what the cut lines count. Nothing here sorts
 *     on its own rule. A player with no counted round (none completed, or no
 *     total) never gets a position, an "E", or a zero.
 *   • `fieldProgress` — how far through its rounds the field is, from the
 *     same feed: the round up next or in play, scorecards in, per-round fill.
 *
 * Local to this folder on purpose (the `qualifier-status.ts` convention).
 * ========================================================================== */

import { rankStandings, type StandingKey } from '@/lib/coachhelm/v3/qualifying/ranking';

/** Splits the title at a spaced em or en dash; "Pre-Season" keeps its hyphen. */
const TITLE_SUFFIX = /\s+[—–]\s+/;

export function qualifierDisplayName(name: string | null | undefined): string {
  const full = (name ?? '').trim();
  const head = full.split(TITLE_SUFFIX)[0]?.trim();
  return head ? head : full;
}

/** Text colour for a score to par. */
export function toParTone(toPar: number | null | undefined): string {
  if (toPar === null || toPar === undefined || !Number.isFinite(toPar)) return 'text-text-tertiary';
  if (toPar < 0) return 'text-accent-ink';
  if (toPar === 0) return 'text-text-secondary';
  return 'text-text-primary';
}

/** The live-feed fields the standings read (`useQualifierRealtime` rows). */
export interface StandingsFeedEntry {
  player_id: string;
  player_name: string;
  rounds_completed: number;
  total_score: number | null;
  total_to_par: number | null;
}

export interface Standing {
  playerId: string;
  playerName: string;
  roundsCompleted: number;
  /** Null until a completed round posts. */
  totalScore: number | null;
  totalToPar: number | null;
  /** Strokes per completed round; null until scored. */
  averageScore: number | null;
  hasScore: boolean;
  /** Golf position: tied players share it, the next one skips. */
  position: number | null;
  tied: boolean;
  /** Physical order among scored players (1-based), for the cut lines. */
  rank: number | null;
}

const byName = (a: StandingsFeedEntry, b: StandingsFeedEntry) => a.player_name.localeCompare(b.player_name);
const isFiniteNumber = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** Counted: a completed round with a total and a to par. */
const isScored = (e: StandingsFeedEntry) =>
  e.rounds_completed > 0 && isFiniteNumber(e.total_score) && isFiniteNumber(e.total_to_par);

const keyOf = (e: StandingsFeedEntry): StandingKey => ({
  toPar: e.total_to_par as number,
  total: e.total_score as number,
  played: e.rounds_completed,
  name: e.player_name,
});

export function deriveStandings(entries: ReadonlyArray<StandingsFeedEntry>): Standing[] {
  // The one order (src/lib/coachhelm/v3/qualifying/ranking.ts rankStandings): the order the selection workspace
  // confirms from and Clubhouse's board draws, with its rank, position and ties taken as given.
  const placed = rankStandings(entries.filter(isScored), keyOf);
  const waiting = entries.filter((e) => !isScored(e)).sort(byName);

  const rows: Standing[] = placed.map(({ item: entry, rank, position, tied }) => ({
    playerId: entry.player_id,
    playerName: entry.player_name,
    roundsCompleted: entry.rounds_completed,
    totalScore: entry.total_score as number,
    totalToPar: entry.total_to_par as number,
    averageScore: (entry.total_score as number) / entry.rounds_completed,
    hasScore: true,
    position,
    tied,
    rank,
  }));

  for (const entry of waiting) {
    rows.push({
      playerId: entry.player_id,
      playerName: entry.player_name,
      roundsCompleted: 0,
      totalScore: null,
      totalToPar: null,
      averageScore: null,
      hasScore: false,
      position: null,
      tied: false,
      rank: null,
    });
  }
  return rows;
}

/** "1", "T2", or an em dash before a player has a completed round. */
export function positionLabel(standing: Pick<Standing, 'position' | 'tied'>): string {
  if (standing.position === null) return '—';
  return `${standing.tied ? 'T' : ''}${standing.position}`;
}

/** Who is out in front, in words a coach would say. Null until someone scores. */
export interface LeaderSummary {
  /** The players at the lowest to-par (one unless the lead is shared). */
  leaders: Standing[];
  /** Strokes clear of the next score; null when the lead is shared or alone. */
  margin: number | null;
}

export function leaderSummary(standings: ReadonlyArray<Standing>): LeaderSummary | null {
  const scored = standings.filter((s) => s.hasScore);
  const first = scored[0];
  if (!first) return null;
  const leaders = scored.filter((s) => s.position === 1);
  if (leaders.length > 1) return { leaders, margin: null };
  const next = scored[1];
  // Only a gap between cards with the same rounds in is a lead: the next row may be a card a round short, which the
  // one order puts below every full card whatever its to par (the A1 honesty rule Clubhouse's line gaps follow).
  const margin =
    next && next.roundsCompleted === first.roundsCompleted && first.totalToPar !== null && next.totalToPar !== null
      ? next.totalToPar - first.totalToPar
      : null;
  return { leaders, margin };
}

export interface FieldProgress {
  numRounds: number;
  entrants: number;
  /** Completed rounds across the field, each player capped at `numRounds`. */
  cardsIn: number;
  cardsTotal: number;
  /** Rounds every entrant has finished. */
  roundsDone: number;
  /** The furthest round any entrant has finished. */
  roundsStarted: number;
  /** Share of the field through each round, 0–1, round 1 first. */
  perRound: number[];
}

export function fieldProgress(
  standings: ReadonlyArray<Pick<Standing, 'roundsCompleted'>>,
  numRounds: number,
): FieldProgress {
  const rounds = Math.max(1, Math.floor(numRounds));
  const played = standings.map((s) => Math.min(Math.max(0, s.roundsCompleted), rounds));
  const entrants = played.length;
  return {
    numRounds: rounds,
    entrants,
    cardsIn: played.reduce((a, b) => a + b, 0),
    cardsTotal: entrants * rounds,
    roundsDone: entrants > 0 ? Math.min(...played) : 0,
    roundsStarted: entrants > 0 ? Math.max(...played) : 0,
    perRound: Array.from({ length: rounds }, (_, i) =>
      entrants > 0 ? played.filter((p) => p > i).length / entrants : 0,
    ),
  };
}

/**
 * The one line that says where the qualifier is: "Round 3 of 3 up next",
 * "Round 2 of 3 in play", "All 3 rounds in", "Final standings".
 */
export function progressHeadline(progress: FieldProgress, status: string): string {
  const { numRounds, roundsDone, roundsStarted, cardsIn } = progress;
  const of = numRounds > 1 ? ` of ${numRounds}` : '';
  if (status === 'completed') return cardsIn === 0 ? 'Closed with no rounds posted' : 'Final standings';
  if (cardsIn === 0) return numRounds > 1 ? `Round 1${of} up next` : 'One round to play';
  if (roundsDone >= numRounds) return numRounds > 1 ? `All ${numRounds} rounds in` : 'The round is in';
  if (roundsStarted > roundsDone) return `Round ${roundsStarted}${of} in play`;
  return `Round ${roundsDone + 1}${of} up next`;
}
