/**
 * ============================================================================
 * rounds-library-logic — pure derivations for the coach Rounds Library
 * (docs/design/fairway-facelift/screens/rounds-library.v3.md)
 * ----------------------------------------------------------------------------
 * Everything here is a pure function over the `rounds` prop already loaded by
 * `rounds/page.tsx` — no fetch, no clock read, no fabricated numbers. Ported
 * out of FairwayRoundsLibrary.tsx so the composition can be unit-tested
 * without mounting the page, per IMPLEMENTING.md's structure rule.
 * ========================================================================== */

import { formatDateOnlyWeekdayShort, formatDateOnlyShort } from '@/lib/golf/date-only';
import {
  parseDateOnly,
  dateOnlyToUtcDate,
  type DateOnlyParts,
} from '@/lib/golf/date-only';
import { normalizedScore } from './rounds-instruments';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

// ── Identity ─────────────────────────────────────────────────────────────--

/** A round's player display name, or `null` when unattributed. */
export function playerName(round: RoundLibraryRound): string | null {
  const first = round.player?.first_name?.trim() ?? '';
  const last = round.player?.last_name?.trim() ?? '';
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : null;
}

const MAJOR_TYPES = new Set(['qualifier', 'qualifying', 'tournament']);

/** Qualifier/tournament rounds are the ones that "count" — a real encoding of `round_type`. */
export function isMajorRoundType(type: string | null): boolean {
  return MAJOR_TYPES.has((type || '').toLowerCase());
}

// ── Dates ────────────────────────────────────────────────────────────────--

/** "Aug 31" / weekday-abbrev for a round's DATE-only day (UTC-pinned, #139). */
export function dateParts(iso: string): { weekday: string; md: string } {
  return { weekday: formatDateOnlyWeekdayShort(iso), md: formatDateOnlyShort(iso) };
}

/** The earliest round's month label, e.g. "Jan 2026" — `null` when unparseable. */
export function firstMonthLabel(rounds: ReadonlyArray<RoundLibraryRound>): string | null {
  const dates = rounds
    .map((r) => parseDateOnly(r.round_date))
    .filter((p): p is DateOnlyParts => p !== null)
    .map(dateOnlyToUtcDate)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  return dates[0]!.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Honest month range over the rounds, e.g. "Jan–Apr 2026" or "Apr 2026". */
export function honestRange(rounds: ReadonlyArray<RoundLibraryRound>): string | null {
  const dates = rounds
    .map((r) => parseDateOnly(r.round_date))
    .filter((p): p is DateOnlyParts => p !== null)
    .map(dateOnlyToUtcDate)
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return null;
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const sameMonth = first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth();
  if (sameMonth) return first.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
  const firstLabel = first.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const lastLabel = last.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return sameYear
    ? `${firstLabel}–${lastLabel}`
    : `${first.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })} – ${lastLabel}`;
}

/** Earliest/latest `round_date` over every round with a parseable date — the
 *  stage's shared axis. `round_date` is a bare `YYYY-MM-DD`, so lexicographic
 *  comparison already is chronological order (#139). `null` with no dates. */
export function roundsDateDomain(rounds: ReadonlyArray<RoundLibraryRound>): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const r of rounds) {
    const d = r.round_date?.slice(0, 10);
    if (!d) continue;
    if (start === null || d < start) start = d;
    if (end === null || d > end) end = d;
  }
  return start !== null && end !== null ? { start, end } : null;
}

// ── Series math ──────────────────────────────────────────────────────────--

/** Signed change from the first to the last point of a chronological (oldest
 *  → newest) series, or `null` with fewer than two points to compare. */
export function seriesDelta(series: ReadonlyArray<number>): number | null {
  if (series.length < 2) return null;
  return series[series.length - 1]! - series[0]!;
}

/** Chronological (oldest → newest) 18-hole-normalized scores over the SCORED
 *  subset of `rounds` — the series every trend/delta reads from. */
export function chronoNormalizedScores(rounds: ReadonlyArray<RoundLibraryRound>): number[] {
  return rounds
    .filter((r) => r.total_score !== null && r.total_score > 0)
    .slice()
    .sort((a, b) => a.round_date.localeCompare(b.round_date))
    .map((r) => normalizedScore(r))
    .filter((v): v is number => v !== null);
}

/** "+3.6" / "−2.1" / "0.0" — one decimal, explicit sign above zero, the exact
 *  format this file's masthead/readouts/average-line all share for a to-par
 *  number (distinct from `formatToPar`'s bare "E" convention). */
export function formatSignedDecimal(n: number): string {
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

// ── Stage geometry ───────────────────────────────────────────────────────--

/** Strokes that reach full mark travel: the largest swing across the WHOLE
 *  unscoped `rounds` set, kept between 4 and 12 — same shape as
 *  `scoreFieldCap`, re-expressed over individual rounds instead of nested
 *  per-player rows, so the axis scale never re-scales when the coach changes
 *  the player-scope Select. */
export function roundFieldCap(rounds: ReadonlyArray<RoundLibraryRound>): number {
  let max = 0;
  for (const r of rounds) {
    if (r.score_to_par !== null) max = Math.max(max, Math.abs(r.score_to_par));
  }
  return Math.min(12, Math.max(4, max));
}

export interface RoundFieldMark {
  id: string;
  date: string;
  toPar: number;
  isMajor: boolean;
  href: string;
  label: string;
}

/** One mark per round IN SCOPE that carries a real `score_to_par` — a round
 *  without one has no honest height to plot (Honesty: never fabricate a
 *  position), so it contributes to the readouts' counts but not to the field. */
export function buildRoundFieldMarks(rounds: ReadonlyArray<RoundLibraryRound>): RoundFieldMark[] {
  const marks: RoundFieldMark[] = [];
  for (const r of rounds) {
    if (r.score_to_par === null) continue;
    const name = playerName(r) ?? 'Unnamed player';
    const course = r.course_name?.trim() || 'Unknown course';
    const scoreLabel = r.total_score !== null ? `${r.total_score}` : 'no score';
    marks.push({
      id: r.id,
      date: r.round_date.slice(0, 10),
      toPar: r.score_to_par,
      isMajor: isMajorRoundType(r.round_type),
      href: `/golf/dashboard/rounds/${r.id}`,
      label: `${name}, ${course}, ${scoreLabel} (${formatSignedDecimalOrEven(r.score_to_par)}), ${dateParts(r.round_date).md}`,
    });
  }
  return marks;
}

/** Like `formatSignedDecimal` but for a whole-stroke to-par value ("E" at par,
 *  no decimal) — used only for the mark's spoken/hovered label. */
function formatSignedDecimalOrEven(stp: number): string {
  if (stp === 0) return 'E';
  return stp > 0 ? `+${stp}` : `−${Math.abs(stp)}`;
}

// ── Scoped summary (readouts + average line + qualifier share) ──────────--

export interface RoundsScopedSummary {
  count: number;
  scoredCount: number;
  toParCount: number;
  avg: number | null;
  avgToPar: number | null;
  best: number | null;
  qualifierCount: number;
}

/** The stage/readouts' shared honesty-gated rollup over whatever rounds are
 *  currently in scope (the coach's player-Select scope, `playerScopedRounds`) —
 *  modeled on `rounds/page.tsx`'s own `roundStats`, re-run per scope with the
 *  same three separate denominators (never one shared count). */
export function computeScopedSummary(rounds: ReadonlyArray<RoundLibraryRound>): RoundsScopedSummary {
  let scoredCount = 0;
  let scoredSum = 0;
  let best: number | null = null;
  let toParCount = 0;
  let toParSum = 0;
  let qualifierCount = 0;
  for (const r of rounds) {
    const ns = normalizedScore(r);
    if (ns !== null) {
      scoredCount += 1;
      scoredSum += ns;
      best = best === null ? ns : Math.min(best, ns);
    }
    if (r.score_to_par !== null) {
      toParCount += 1;
      toParSum += r.score_to_par;
    }
    if (isMajorRoundType(r.round_type)) qualifierCount += 1;
  }
  return {
    count: rounds.length,
    scoredCount,
    toParCount,
    avg: scoredCount > 0 ? scoredSum / scoredCount : null,
    avgToPar: toParCount > 0 ? toParSum / toParCount : null,
    best,
    qualifierCount,
  };
}

/** Lowest `score_to_par` round in scope (first on a tie) — the record round
 *  named by the Best readout's caption. */
export function bestOfRounds(rounds: ReadonlyArray<RoundLibraryRound>): RoundLibraryRound | null {
  let best: RoundLibraryRound | null = null;
  let bestScoreToPar = Infinity;
  for (const r of rounds) {
    if (r.score_to_par !== null && r.score_to_par < bestScoreToPar) {
      bestScoreToPar = r.score_to_par;
      best = r;
    }
  }
  return best;
}

// ── Leaders ──────────────────────────────────────────────────────────────--

export interface PlayerSeasonEntry {
  avgToPar: number;
  count: number;
  avatarUrl: string | null;
}

/** Ascending by season avg-to-par (lower is better) — the same sort the
 *  masthead's unscoped leader and the ledger's Leaders column both read. */
export function rankPlayersByAvgToPar(
  stats: ReadonlyMap<string, PlayerSeasonEntry>,
): Array<[string, PlayerSeasonEntry]> {
  return Array.from(stats.entries()).sort((a, b) => a[1].avgToPar - b[1].avgToPar);
}

// ── Masthead verdict ─────────────────────────────────────────────────────--

export interface RoundsVerdictPart {
  text: string;
  /** Numbers and the (not-yet-linkable) leader name render `font-fw-mono`. */
  mono?: boolean;
}

export interface RoundsVerdictInput {
  roundsCount: number;
  firstMonth: string | null;
  /** Team-wide, unscoped last-minus-first normalized-score delta. */
  scoreDelta: number | null;
  leader: { name: string; avgToPar: number } | null;
}

/** The masthead's one verdict sentence — always describes the whole roster,
 *  built only from facts already computed team-wide (never the stage's own
 *  player-scope). See rounds-library.v3.md "Missing-fact fallbacks" for the
 *  degraded-path ordering this follows. */
export function buildRoundsVerdict(input: RoundsVerdictInput): RoundsVerdictPart[] {
  const { roundsCount, firstMonth, scoreDelta, leader } = input;
  const parts: RoundsVerdictPart[] = [];
  const push = (text: string, mono = false) => parts.push({ text, mono });
  const roundsWord = `round${roundsCount === 1 ? '' : 's'}`;

  if (firstMonth === null) {
    push(`${roundsCount}`, true);
    push(` ${roundsWord} recorded`);
  } else if (scoreDelta === null) {
    push(`${roundsCount}`, true);
    push(` ${roundsWord} since ${firstMonth}`);
  } else {
    const shots = Math.abs(Math.round(scoreDelta));
    const direction = scoreDelta < 0 ? 'better' : scoreDelta > 0 ? 'worse' : 'even';
    push(`${roundsCount}`, true);
    push(` ${roundsWord} since ${firstMonth}. `);
    push(`${shots}`, true);
    push(` shot${shots === 1 ? '' : 's'} ${direction} than where the season started`);
  }

  if (leader) {
    push(', led by ');
    push(leader.name, true);
    push(' at ');
    push(formatSignedDecimal(leader.avgToPar), true);
    push('.');
  } else {
    push('.');
  }
  return parts;
}
