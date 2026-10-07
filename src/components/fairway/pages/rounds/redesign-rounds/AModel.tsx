// REDESIGN-SCRATCH (docs/redesign/rounds): Direction A, season scorecard. Pure derivations, no React.
//
// Everything the scorecard grid and the round ledger show is computed here from the
// real `golf_rounds` columns the page already loads. Nothing is estimated: a value that
// cannot be derived is null and renders as a dash.
import { formatDateOnly, formatDateOnlyShort, parseDateOnly } from '@/lib/golf/date-only';
import type { RoundLibraryRound } from '../FairwayRoundsLibrary';

/**
 * `front_nine` / `back_nine` are selected by rounds/page.tsx and survive its cast, but
 * `RoundLibraryRound` does not declare them. Read them through this widened type and
 * treat `undefined` as missing, never as 0.
 */
export type ARound = RoundLibraryRound & {
  front_nine?: number | null;
  back_nine?: number | null;
};

/** Columns on the season scorecard: the last N counted rounds. */
export const SCORECARD_COLUMNS = 9;
/** Averages need at least this many counted 18-hole rounds. */
export const AVERAGES_MIN_ROUNDS = 3;
/** Placeholder for a value that does not exist (never a fabricated 0). */
export const DASH = '—';

/** A finite number, or null. */
export function num(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** A number as text, or the dash placeholder. */
export function show(value: number | null): string {
  return value === null ? DASH : String(value);
}

// ── Marks ───────────────────────────────────────────────────────────────────

export type MarkKind = 'circle' | 'square' | 'double-square' | 'none';

/**
 * Scorecard mark for a round's score to par: a circle under par, a square 1 to 4 over,
 * a double square 5 or more over, nothing for level par or an unknown par.
 */
export function markKind(scoreToPar: number | null | undefined): MarkKind {
  const stp = num(scoreToPar);
  if (stp === null || stp === 0) return 'none';
  if (stp < 0) return 'circle';
  return stp >= 5 ? 'double-square' : 'square';
}

// ── Ordering ────────────────────────────────────────────────────────────────

/** Oldest first. `round_date` is a bare YYYY-MM-DD, so string order is date order. */
export function byChrono(a: ARound, b: ARound): number {
  if (a.round_date !== b.round_date) return a.round_date < b.round_date ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** A round feeds the scorecard when the server counted it and it has a positive total. */
export function isCountedRound(round: ARound): boolean {
  const total = num(round.total_score);
  return round.countable !== false && total !== null && total > 0;
}

function holesOf(round: ARound): number {
  return round.holes_played ?? 18;
}

// ── The season scorecard ────────────────────────────────────────────────────

export interface ScorecardColumn {
  id: string;
  href: string;
  /** "Sep 26" (UTC-pinned through the shared date-only helper). */
  label: string;
  holes: number;
  /** total_score - score_to_par, or null when either is missing. */
  par: number | null;
  score: number;
  toPar: number | null;
}

export interface SeasonAverages {
  /** Counted 18-hole rounds behind every figure below. */
  n: number;
  front: number;
  back: number;
  total: number;
  /** Mean score to par, only when every one of the n rounds has a score to par. */
  toPar: number | null;
}

export interface Scorecard {
  /** Every counted round, any length. */
  counted: number;
  /** Counted rounds that are not 18 holes; they are left out of the averages. */
  shortRounds: number;
  /** The last SCORECARD_COLUMNS counted rounds, oldest to newest. */
  columns: ScorecardColumn[];
  averages: SeasonAverages | null;
}

interface EighteenHole {
  front: number;
  back: number;
  total: number;
  toPar: number | null;
}

function toEighteenHole(round: ARound): EighteenHole | null {
  const front = num(round.front_nine);
  const back = num(round.back_nine);
  const total = num(round.total_score);
  if (holesOf(round) !== 18 || front === null || back === null || total === null) return null;
  return { front, back, total, toPar: num(round.score_to_par) };
}

function toColumn(round: ARound): ScorecardColumn {
  const score = num(round.total_score) ?? 0;
  const toPar = num(round.score_to_par);
  return {
    id: round.id,
    href: `/golf/dashboard/rounds/${round.id}`,
    label: formatDateOnlyShort(round.round_date),
    holes: holesOf(round),
    par: toPar === null ? null : score - toPar,
    score,
    toPar,
  };
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Derive the scorecard grid and the season averages from the loaded rounds. */
export function buildScorecard(rounds: readonly ARound[]): Scorecard {
  const counted = rounds.filter(isCountedRound).sort(byChrono);
  const columns = counted.slice(-SCORECARD_COLUMNS).map(toColumn);
  const eighteen = counted
    .map(toEighteenHole)
    .filter((r): r is EighteenHole => r !== null);
  const shortRounds = counted.filter((r) => holesOf(r) !== 18).length;

  let averages: SeasonAverages | null = null;
  if (eighteen.length >= AVERAGES_MIN_ROUNDS) {
    const toPars = eighteen.map((r) => r.toPar);
    const allHavePar = toPars.every((v): v is number => v !== null);
    averages = {
      n: eighteen.length,
      front: mean(eighteen.map((r) => r.front)),
      back: mean(eighteen.map((r) => r.back)),
      total: mean(eighteen.map((r) => r.total)),
      toPar: allHavePar ? mean(toPars as number[]) : null,
    };
  }
  return { counted: counted.length, shortRounds, columns, averages };
}

/** "Last 9 of 14 counted rounds" or "5 counted rounds": window, unit and n. */
export function windowCaption(card: Scorecard): string {
  if (card.counted > card.columns.length) {
    return `Last ${card.columns.length} of ${card.counted} counted rounds`;
  }
  return `${card.counted} counted round${card.counted === 1 ? '' : 's'}`;
}

/** The caption under the grid: why averages are missing, or what they leave out. */
export function averagesCaption(card: Scorecard): string | null {
  if (card.averages) return card.shortRounds > 0 ? 'Averages use 18-hole rounds only' : null;
  return card.counted < AVERAGES_MIN_ROUNDS
    ? 'Averages after 3 counted rounds'
    : 'Averages after 3 counted 18-hole rounds';
}

/** One decimal, for season averages. */
export function formatAvg(value: number): string {
  return value.toFixed(1);
}

/** Signed one-decimal average to par, U+2212 for minus, "E" when it rounds to level. */
export function formatAvgToPar(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'E';
  return rounded > 0 ? `+${rounded.toFixed(1)}` : `−${Math.abs(rounded).toFixed(1)}`;
}

// ── Header meta ─────────────────────────────────────────────────────────────

/** "Feb–Sep 2026", "Sep 2026" or "Nov 2025 – Feb 2026" over every recorded round. */
export function seasonRange(rounds: readonly ARound[]): string | null {
  const dates = rounds
    .map((r) => r.round_date)
    .filter((d) => parseDateOnly(d) !== null)
    .sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return null;
  const a = parseDateOnly(first);
  const b = parseDateOnly(last);
  if (!a || !b) return null;
  const lastLabel = formatDateOnly(last, { month: 'short', year: 'numeric' });
  if (a.year === b.year && a.month === b.month) return lastLabel;
  if (a.year === b.year) return `${formatDateOnly(first, { month: 'short' })}–${lastLabel}`;
  return `${formatDateOnly(first, { month: 'short', year: 'numeric' })} – ${lastLabel}`;
}

/** "14 rounds · 2 not counted · Feb–Sep 2026". Counts every listed round. */
export function libraryMeta(rounds: readonly ARound[]): string {
  const n = rounds.length;
  const notCounted = rounds.filter((r) => r.countable === false).length;
  const parts = [`${n} round${n === 1 ? '' : 's'}`];
  if (notCounted > 0) parts.push(`${notCounted} not counted`);
  const range = seasonRange(rounds);
  if (range) parts.push(range);
  return parts.join(' · ');
}

// ── The ledger ──────────────────────────────────────────────────────────────

export type RoundFilter = 'all' | 'practice' | 'qualifier' | 'tournament';

export const ROUND_FILTERS: readonly RoundFilter[] = ['all', 'practice', 'qualifier', 'tournament'];

export function roundTypeKey(round: ARound): RoundFilter | 'other' {
  const t = (round.round_type || '').toLowerCase();
  if (t === 'practice') return 'practice';
  if (t === 'qualifier' || t === 'qualifying') return 'qualifier';
  if (t === 'tournament') return 'tournament';
  return 'other';
}

/** Course search. For a player this is the course name only (never their own name). */
export function searchRounds(rounds: readonly ARound[], query: string): ARound[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [...rounds];
  return rounds.filter((r) => (r.course_name ?? '').toLowerCase().includes(q));
}

/** Pill counts over an already search-scoped set. */
export function filterCounts(rounds: readonly ARound[]): Record<RoundFilter, number> {
  const counts: Record<RoundFilter, number> = {
    all: rounds.length,
    practice: 0,
    qualifier: 0,
    tournament: 0,
  };
  for (const r of rounds) {
    const key = roundTypeKey(r);
    if (key !== 'other') counts[key] += 1;
  }
  return counts;
}

export function filterByType(rounds: readonly ARound[], filter: RoundFilter): ARound[] {
  if (filter === 'all') return [...rounds];
  return rounds.filter((r) => roundTypeKey(r) === filter);
}

export interface MonthGroup {
  key: string;
  label: string;
  rounds: ARound[];
}

const UNDATED_KEY = 'undated';

/**
 * Group by calendar month, newest month first and newest round first inside it. Every
 * round lands in exactly one group (an unparseable date goes to a trailing "Undated"
 * group), so a group's `rounds.length` IS the number of rows shown under its header.
 */
export function groupByMonth(rounds: readonly ARound[]): MonthGroup[] {
  const newestFirst = [...rounds].sort((a, b) => byChrono(b, a));
  const groups = new Map<string, MonthGroup>();
  for (const round of newestFirst) {
    const parts = parseDateOnly(round.round_date);
    const key = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}` : UNDATED_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: parts
          ? formatDateOnly(round.round_date, { month: 'long', year: 'numeric' })
          : 'Undated',
        rounds: [],
      };
      groups.set(key, group);
    }
    group.rounds.push(round);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === UNDATED_KEY) return 1;
    if (b.key === UNDATED_KEY) return -1;
    return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
  });
}

/** OUT / IN / TOT for one ledger row. A nine that was not played is null (a dash). */
export function rowScores(round: ARound): {
  out: number | null;
  back: number | null;
  total: number | null;
} {
  return {
    out: num(round.front_nine),
    back: num(round.back_nine),
    total: num(round.total_score),
  };
}

export function isShortRound(round: ARound): boolean {
  return holesOf(round) !== 18;
}

export function holesLabel(round: ARound): string {
  const holes = holesOf(round);
  return `${holes} ${holes === 1 ? 'hole' : 'holes'}`;
}
