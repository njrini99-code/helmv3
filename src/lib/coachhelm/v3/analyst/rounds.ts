/**
 * CoachHelm analyst: which rounds a figure reads, and the named windows.
 *
 * This is the Stats screens' rule, stated from the same lib pieces they use (`src/lib` may not import `src/clubhouse`):
 *
 *   counts at all        `isCountableRound`, else a total posted without its holes (`isTotalOnlyCountable`), with the
 *                        canonical total (`withCanonicalRoundTotal`): src/clubhouse/data/season.ts `loadSeasonRounds`
 *   practice left out    `countsForScoring` (src/lib/coachhelm/v3/chat/season-rule.ts, the lib twin of season.ts)
 *   18-hole rounds only  Stats' default filter, `filterFor()` `holes: '18'` (src/clubhouse/data/stats-filter.ts:99-101)
 *   newest first         date, then id (season.ts sort), so two readers never pick different rounds on a tied date
 *   last 10              the newest 10, whenever played (stats-filter.ts `selectRounds`, Q-122)
 *   previous 10          rounds 11 to 20, only with three or more (stats-filter.ts `previousRounds`)
 *   season               from 1 August on the team's calendar (`seasonStartDate`)
 *
 * `__tests__/stats-parity.test.ts` runs these and the Clubhouse functions over the same rows and fails if they part.
 *
 * Pure: no Supabase, no clock.
 */
import { isCountableRound } from '@/lib/golf/round-countable';
import { isTotalOnlyCountable } from '@/lib/golf/round-score-countable';
import { withCanonicalRoundTotal } from '@/lib/golf/round-total';
import { countsForScoring } from '@/lib/coachhelm/v3/chat/season-rule';
import type { RoundRow } from './sources';
import { WINDOW_ROUNDS, type WindowKey, type WindowRef } from './types';

/** A round that counts, with its canonical total. `total_only`: posted as a total with no holes, so it feeds scores and nothing hole-level. */
export interface CountedRound extends RoundRow {
  total_only: boolean;
}

/**
 * Stats shows "vs previous 10" only when at least three earlier rounds exist (stats-filter.ts `previousRounds`:
 * `wholeRounds(prev) >= 3`). Under that there is no previous window.
 */
export const MIN_PREVIOUS_ROUNDS = 3;

/** How far back the read goes: a rolling year, which always reaches the season start (season.ts `LAST_TEN_MONTHS`). */
export const READ_BACK_MONTHS = 12;

export const WINDOW_LABEL: Record<WindowKey, string> = {
  last10: `Last ${WINDOW_ROUNDS} rounds`,
  previous10: `The ${WINDOW_ROUNDS} rounds before those`,
  season: 'This season',
};

const newestFirst = (a: RoundRow, b: RoundRow): number =>
  a.round_date < b.round_date ? 1 : a.round_date > b.round_date ? -1 : a.id.localeCompare(b.id);

/** The rounds that count, newest first, each with its canonical total (season.ts `loadSeasonRounds`, after the query). */
export function countedRounds(rows: readonly RoundRow[]): CountedRound[] {
  const out: CountedRound[] = [];
  for (const r of rows) {
    if (r.total_score == null) continue;
    if (isCountableRound(r)) out.push({ ...withCanonicalRoundTotal(r), total_only: false });
    else if (isTotalOnlyCountable(r)) out.push({ ...withCanonicalRoundTotal(r), total_only: true });
  }
  return out.sort(newestFirst);
}

/**
 * The rounds a Stats figure reads by default: 18-hole rounds with a score, practice left out. `keepPractice` is for the
 * one figure that sets practice against competition (the pressure gap), which Stats also reads from the uncut rounds.
 */
export function figureRounds(rounds: readonly CountedRound[], opts: { keepPractice?: boolean } = {}): CountedRound[] {
  return rounds.filter((r) => r.total_score != null && (r.holes_played ?? 18) === 18 && (opts.keepPractice || countsForScoring(r)));
}

/** The rounds with their holes scored: what every hole-level and shot-level figure reads (round-scope.ts `holeRounds`). */
export function holeRounds(rounds: readonly CountedRound[]): CountedRound[] {
  return rounds.filter((r) => !r.total_only);
}

export interface PlayerWindows {
  last10: CountedRound[];
  /** Null when the player has fewer than {@link MIN_PREVIOUS_ROUNDS} earlier rounds. */
  previous10: CountedRound[] | null;
  season: CountedRound[];
}

/** One player's figure rounds (newest first) cut into the three named windows. */
export function cutWindows(rounds: readonly CountedRound[], seasonStart: string): PlayerWindows {
  const previous = rounds.slice(WINDOW_ROUNDS, WINDOW_ROUNDS * 2);
  return {
    last10: rounds.slice(0, WINDOW_ROUNDS),
    previous10: previous.length >= MIN_PREVIOUS_ROUNDS ? previous : null,
    season: rounds.filter((r) => r.round_date.slice(0, 10) >= seasonStart),
  };
}

export function windowRef(key: WindowKey, rounds: readonly CountedRound[]): WindowRef {
  const dates = rounds.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    key,
    label: WINDOW_LABEL[key],
    rounds: rounds.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    round_ids: rounds.map((r) => r.id),
  };
}

/** Where the rounds read starts: twelve months before `now` (season.ts `lastTenFloor`). */
export function readSince(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - READ_BACK_MONTHS, now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** `now`'s calendar day in the team's zone (YYYY-MM-DD). */
export function dayIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
