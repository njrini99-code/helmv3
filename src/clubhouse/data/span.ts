/*
 * "This season" or "All time": the basis a Clubhouse figure is read on (owner decision, 2026-11-07).
 *
 *   season (the default, no address param)  the rules the screens have always applied: the season from 1 August in the team's zone (or the
 *                                           window the page names), practice rounds out, a three-round floor on a leaderboard.
 *   all    (`?range=all`)                   Fairway's rules, so a Clubhouse number can be set beside the Fairway one: no date cut, every round
 *                                           type in (practice too), no floor on a leaderboard, and only rounds with their holes (Fairway's
 *                                           `isCountableRound`, which reads no round posted as a total only; Clubhouse's season counts those, Q-123).
 *
 * Pure (no server-only, no React): the address parser, the loaders and the switch all read these.
 */

export type ChSpan = 'season' | 'all';

export const DEFAULT_SPAN: ChSpan = 'season';

/** The address key. Fairway's dashboard reads the same key (`range=all`), so one link means the same thing on both. */
export const SPAN_PARAM = 'range';

export const SPAN_LABEL: Record<ChSpan, string> = { season: 'This season', all: 'All time' };

/** The span from an address value: only `all` leaves the default; anything else (a missing or unknown value, `season`) is the season. */
export function parseSpan(v: string | string[] | null | undefined): ChSpan {
  return (Array.isArray(v) ? v[0] : v) === 'all' ? 'all' : DEFAULT_SPAN;
}

/** Earlier than any round: the "season start" an all-time read compares dates against, so nothing is cut. */
export const ALL_TIME_START = '0000-01-01';

/** The first day a read counts from: the season's own, or no day at all. */
export function spanStart(span: ChSpan | undefined, seasonStart: string): string {
  return span === 'all' ? ALL_TIME_START : seasonStart;
}

/**
 * Where a loader's read begins. `fallback` is what the surface reads when the span is the season (its season start, or the year-long floor of
 * its Last 10); all-time reads everything (`null`, which `loadSeasonRounds` takes for "no bound").
 */
export function spanSince<T extends string | null | undefined>(span: ChSpan | undefined, fallback: T): T | null {
  return span === 'all' ? null : fallback;
}

/** Practice rounds count in all-time figures (Fairway counts every round type), and stay out of the season's. */
export function spanKeepsPractice(span: ChSpan | undefined): boolean {
  return span === 'all';
}

/** A leaderboard puts a player under three rounds below everyone with a sample in the season; all-time ranks on the average alone, as Fairway does. */
export function spanFloorsLeaderboard(span: ChSpan | undefined): boolean {
  return span !== 'all';
}

/**
 * Fairway reads no round posted as a total only (`isCountableRound` wants every hole scored); Clubhouse's season counts them in its score
 * figures (Q-123). All-time follows Fairway, so a number set beside Fairway's is the same number.
 */
export function spanKeepsTotalOnly(span: ChSpan | undefined): boolean {
  return span !== 'all';
}

/** What the figures rest on, in a few words ("All time · every round"), for a caption beside the switch. */
export function spanWords(span: ChSpan | undefined): string {
  return span === 'all' ? 'All time, every round type' : 'This season, practice left out';
}
