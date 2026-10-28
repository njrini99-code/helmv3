/**
 * What the event desk reads off its data, as pure functions (P016 EventDesk). Team math is never done here: the
 * counting and dropped sets, the team total and the places arrive computed on `event.team` and each `ChTourPlayerRound`.
 * What is derived is display arithmetic on figures the desk already shows: a player's own total across the rounds, how
 * many of their rounds counted, the nine sums on a scorecard, and the average of the team's holes against par.
 */
import type { ChTourEntry, ChTourEvent, ChTourHoleCard, ChTourHoleLedger, ChTourPlayer, ChTourPlayerRound } from './types';

/** One player's line on Who counted: their entry, their score in each round (null where none was entered), the totals. */
export interface DeskRow {
  entry: ChTourEntry;
  player: ChTourPlayer | undefined;
  /** In round order, one per round of the event. */
  cells: Array<ChTourPlayerRound | null>;
  /** The player's own total across the rounds entered; null with no score. */
  total: number | null;
  /** Rounds that counted in the team score, of the rounds played. Individuals have neither. */
  counted: number;
  played: number;
  individual: boolean;
  alternate: boolean;
}

/** Lineup players in slot order, then alternates, then individuals (who are never in the team score). */
export function deskRows(event: ChTourEvent, players: readonly ChTourPlayer[]): DeskRow[] {
  const order = (e: ChTourEntry) => (e.role === 'lineup' ? 0 : e.role === 'alternate' ? 1 : 2);
  const sorted = [...event.entries].sort((a, b) => order(a) - order(b) || (a.slot ?? 99) - (b.slot ?? 99));
  return sorted.map((entry) => {
    const cells = event.rounds.map((r) => event.playerRounds.find((p) => p.playerId === entry.playerId && p.roundNumber === r.number) ?? null);
    const scored = cells.filter((c): c is ChTourPlayerRound => c != null && c.total != null);
    return {
      entry,
      player: players.find((p) => p.id === entry.playerId),
      cells,
      total: scored.length ? scored.reduce((s, c) => s + (c.total ?? 0), 0) : null,
      counted: cells.filter((c) => c?.count === 'counted').length,
      played: cells.filter((c) => c != null).length,
      individual: entry.role === 'individual',
      alternate: entry.role === 'alternate',
    };
  });
}

/** Rounds with a stroke total entered: a WD, a DQ or a blank cell is not a round played for ranking. */
const roundsScored = (row: DeskRow) => row.cells.filter((c) => c?.total != null).length;

/**
 * Flat, the Players view of Who counted: more rounds scored first, then the player's own total, lowest first (owner
 * rule 2026-10-24: a card a round short ranks below every full one, however low its total). Nobody without a score
 * sorts first.
 */
export function byTotal(rows: readonly DeskRow[]): DeskRow[] {
  return [...rows].sort(
    (a, b) =>
      roundsScored(b) - roundsScored(a) ||
      (a.total ?? Number.POSITIVE_INFINITY) - (b.total ?? Number.POSITIVE_INFINITY),
  );
}

/** The words a score cell shows: the stroke total, or why there is none. */
export function scoreWords(pr: ChTourPlayerRound | null): string {
  if (!pr) return '—';
  if (pr.status === 'wd') return 'WD';
  if (pr.status === 'dq') return 'DQ';
  if (pr.status === 'dq_pending') return 'DQ?';
  return pr.total == null ? '—' : String(pr.total);
}

/** A score that did not count in the team round (dropped, or tied at the line and dropped): "NC". */
export const notCounted = (pr: ChTourPlayerRound | null) => pr != null && (pr.count === 'dropped' || pr.count === 'tie');

/** The players a round's team score counted and left out, each with the score. Read from the round's own sets. */
export function roundSets(event: ChTourEvent, roundNumber: number): { counted: Array<{ id: string; total: number | null }>; dropped: Array<{ id: string; total: number | null }>; tied: string[] } {
  const tr = event.team.rounds.find((r) => r.roundNumber === roundNumber);
  const totalOf = (id: string) => event.playerRounds.find((p) => p.playerId === id && p.roundNumber === roundNumber)?.total ?? null;
  return {
    counted: (tr?.counting ?? []).map((id) => ({ id, total: totalOf(id) })),
    dropped: (tr?.dropped ?? []).map((id) => ({ id, total: totalOf(id) })),
    tied: tr?.tiedAtBoundary ?? [],
  };
}

/** The sum of a run of holes; null when any hole has no score yet. */
export function sumHoles(strokes: ReadonlyArray<number | null>): number | null {
  return strokes.every((s): s is number => s != null) && strokes.length ? strokes.reduce((a, b) => a + b, 0) : null;
}

export interface HoleCardRow {
  card: ChTourHoleCard;
  playerId: string;
  strokes: Array<number | null>;
  out: number | null;
  inn: number | null;
  total: number | null;
  /** In the team score this round, a dropped score, or an individual: from the round's own `count`. */
  count: ChTourPlayerRound['count'] | 'none';
}

/** The ledger's cards for one round, each with its nine sums and how its round counted. */
export function holeRows(event: ChTourEvent, ledger: ChTourHoleLedger, roundNumber: number): HoleCardRow[] {
  return ledger.cards
    .filter((c) => c.roundNumber === roundNumber)
    .map((card) => {
      const strokes = card.holes.map((h) => h.strokes);
      return {
        card,
        playerId: card.playerId,
        strokes,
        out: sumHoles(strokes.slice(0, 9)),
        inn: sumHoles(strokes.slice(9, 18)),
        total: sumHoles(strokes),
        count: event.playerRounds.find((p) => p.playerId === card.playerId && p.roundNumber === roundNumber)?.count ?? 'none',
      };
    });
}

/** The team players' average strokes against par on each hole, for the rows given; null where nobody has a score. */
export function holeAverages(rows: readonly HoleCardRow[], pars: readonly number[]): Array<number | null> {
  return pars.map((par, i) => {
    const vals = rows.map((r) => r.strokes[i]).filter((s): s is number => s != null);
    return vals.length ? vals.reduce((a, s) => a + (s - par), 0) / vals.length : null;
  });
}

/** The indexes of the `n` holes that cost the team most (largest average over par), only where they cost anything. */
export function costliest(avgs: ReadonlyArray<number | null>, n = 3): number[] {
  return avgs
    .map((v, i) => [v, i] as const)
    .filter((x): x is readonly [number, number] => x[0] != null && x[0] > 0)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, n)
    .map((x) => x[1]);
}
