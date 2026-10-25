/**
 * Tournaments (P016), places, tiebreaks and records. Pure, like scoring.ts. Plan section 2.2 and 2.3, step 1.2.
 *
 * Places: lowest total first; equal totals share a place shown with a T unless the event's tiebreak separates them.
 * Records: every team finish is also a win over every team below, a loss to every team above and a tie with every
 * team level. B teams never count, and teams outside the division are shown but left out of the division record.
 */

import { NO_DATA } from '../../lib/format';

export type ChTourTiebreak = 'ties_stand' | 'ncaa' | 'playoff' | 'card_playoff';

export interface ChTourPlaceable {
  id: string;
  /** Event total; null when the entry has no total (incomplete, withdrawn): it gets no place. */
  total: number | null;
  /** Lower seed is better; the last NCAA tiebreak. */
  seed?: number | null;
  /** A manual order for a playoff or a card playoff, 1 = won. */
  playoffOrder?: number | null;
}

/** NCAA team tiebreak inputs (prechamp manual): the dropped total, then each round's counting scores. */
export interface ChTourTeamTieInput extends ChTourPlaceable {
  droppedTotal: number | null;
  /** Each round's counting scores, any order. */
  countingByRound: number[][];
}

/** NCAA individual tiebreak inputs: round scores in playing order (the most recent round decides first). */
export interface ChTourPlayerTieInput extends ChTourPlaceable {
  rounds: Array<number | null>;
}

export interface ChTourPlace {
  id: string;
  /** 1-based; null when the entry has no total. */
  place: number | null;
  tied: boolean;
  /** "1", "T3", or the no-data dash. */
  label: string;
}


/** Lower is better; 0 means the rule cannot separate them. */
export type ChTourCompare<T> = (a: T, b: T) => number;

const bySeed = <T extends ChTourPlaceable>(a: T, b: T): number =>
  a.seed != null && b.seed != null ? a.seed - b.seed : 0;

const byPlayoff = <T extends ChTourPlaceable>(a: T, b: T): number =>
  a.playoffOrder != null && b.playoffOrder != null ? a.playoffOrder - b.playoffOrder : 0;

/**
 * NCAA non-sudden-death order for teams: (1) lower total of non-counting scores; (2) lower sum of each round's lowest
 * counting score; (3) then the second, third and fourth lowest in turn; (4) seed.
 */
export const ncaaTeamTiebreak: ChTourCompare<ChTourTeamTieInput> = (a, b) => {
  if (a.droppedTotal != null && b.droppedTotal != null && a.droppedTotal !== b.droppedTotal) return a.droppedTotal - b.droppedTotal;
  const sorted = (t: ChTourTeamTieInput) => t.countingByRound.map((r) => [...r].sort((x, y) => x - y));
  const ra = sorted(a);
  const rb = sorted(b);
  const depth = Math.max(0, ...ra.map((r) => r.length), ...rb.map((r) => r.length));
  for (let k = 0; k < depth; k += 1) {
    const sa = ra.reduce((sum, r) => sum + (r[k] ?? 0), 0);
    const sb = rb.reduce((sum, r) => sum + (r[k] ?? 0), 0);
    if (sa !== sb) return sa - sb;
  }
  return bySeed(a, b);
};

/** NCAA order for individuals: the most recent round, then the round before, and so on; then seed. */
export const ncaaPlayerTiebreak: ChTourCompare<ChTourPlayerTieInput> = (a, b) => {
  const n = Math.max(a.rounds.length, b.rounds.length);
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = a.rounds[i];
    const y = b.rounds[i];
    if (x != null && y != null && x !== y) return x - y;
  }
  return bySeed(a, b);
};

/**
 * Places for a field. `tiebreak` 'ties_stand' shares places; 'ncaa' applies `breakTie` (pass ncaaTeamTiebreak or
 * ncaaPlayerTiebreak); 'playoff' and 'card_playoff' use the entered `playoffOrder` and share places it leaves level.
 */
export function placeField<T extends ChTourPlaceable>(rows: readonly T[], tiebreak: ChTourTiebreak, breakTie?: ChTourCompare<T>): ChTourPlace[] {
  const separate: ChTourCompare<T> =
    tiebreak === 'ncaa' && breakTie ? breakTie : tiebreak === 'playoff' || tiebreak === 'card_playoff' ? byPlayoff : () => 0;
  const scored = rows.filter((r) => r.total != null);
  const order = [...scored].sort((a, b) => a.total! - b.total! || separate(a, b) || a.id.localeCompare(b.id));
  const out: ChTourPlace[] = [];
  order.forEach((row, i) => {
    const prev = order[i - 1];
    const level = (x: T, y: T) => x.total === y.total && separate(x, y) === 0;
    const next = order[i + 1];
    const place = prev && level(prev, row) ? out[i - 1]!.place! : i + 1;
    const tied = (prev != null && level(prev, row)) || (next != null && level(next, row));
    out.push({ id: row.id, place, tied, label: `${tied ? 'T' : ''}${place}` });
  });
  for (const row of rows) if (row.total == null) out.push({ id: row.id, place: null, tied: false, label: NO_DATA });
  return out;
}

export interface ChTourRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface ChTourFieldTeam {
  id: string;
  place: number | null;
  isBTeam?: boolean;
  /** False for a team outside the division: shown, but left out of the division record. */
  sameDivision?: boolean;
}

/**
 * Our head-to-head results from one finish. Teams without a place (no team score) and B teams are left out, and so
 * is our own B team. With no place of our own, the event adds nothing to the record.
 */
export function recordFromFinish(usId: string, field: readonly ChTourFieldTeam[]): ChTourRecord {
  const us = field.find((t) => t.id === usId);
  const record: ChTourRecord = { wins: 0, losses: 0, ties: 0 };
  if (!us || us.place == null) return record;
  for (const team of field) {
    if (team.id === usId || team.place == null || team.isBTeam || team.sameDivision === false) continue;
    if (team.place > us.place) record.wins += 1;
    else if (team.place < us.place) record.losses += 1;
    else record.ties += 1;
  }
  return record;
}

export function addRecords(records: readonly ChTourRecord[]): ChTourRecord {
  return records.reduce((acc, r) => ({ wins: acc.wins + r.wins, losses: acc.losses + r.losses, ties: acc.ties + r.ties }), {
    wins: 0,
    losses: 0,
    ties: 0,
  });
}

/** Winning percentage with ties as half a win; null with no results. */
export function recordPct(r: ChTourRecord): number | null {
  const games = r.wins + r.losses + r.ties;
  return games > 0 ? (r.wins + r.ties / 2) / games : null;
}

/** "11-2-0". */
export function formatRecord(r: ChTourRecord): string {
  return `${r.wins}-${r.losses}-${r.ties}`;
}

/** ".533" the way college golf writes it, "1.000" for a perfect record, the dash with no results. */
export function formatPct(pct: number | null): string {
  if (pct == null) return NO_DATA;
  const fixed = pct.toFixed(3);
  return pct >= 1 ? fixed : fixed.replace(/^0/, '');
}

/**
 * D1 at-large .500 check. From 2026-27 (men) there are three checkpoints (regular season; plus conference stroke
 * play; plus conference match play) and meeting any one is enough. Checkpoints not reached yet are null.
 */
export function meetsFiveHundred(checkpoints: ReadonlyArray<ChTourRecord | null>): boolean | null {
  const reached = checkpoints.filter((c): c is ChTourRecord => c != null && recordPct(c) != null);
  if (reached.length === 0) return null;
  return reached.some((c) => recordPct(c)! >= 0.5);
}
