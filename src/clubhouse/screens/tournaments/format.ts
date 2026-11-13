/**
 * Words and dates every Tournaments view writes the same way. Pure and client-safe.
 *
 * Dates are the team's `yyyy-mm-dd`, written as that calendar day (lib/golf/date-only) so a server render and its hydration
 * agree whatever the machine's zone. "Today" is always the view's `data.now`, never the clock.
 */
import { formatDateOnly } from '@/lib/golf/date-only';
import { formatClock, isoDay } from '../../lib/dates';
import { formatFixed, formatSigned, formatToPar, MINUS } from '../../lib/format';
import type { ChTourEvent, ChTourRecord, TourFormat } from './types';
import { formatPct } from './standings';

/** The kit's number formatters, re-exported so a view takes every figure from here (no `.toFixed(` in a view). */
export { formatFixed, formatPct, formatSigned, formatToPar, MINUS };

/** "Oct 5" by default; any date options. The calendar day the value names, the same in every zone (lib/golf/date-only). */
export function tourDay(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return formatDateOnly(iso, opts);
}

/** "Oct 5 – 7", "Sep 30 – Oct 2", or one day: the board's range. */
export function tourRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return tourDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${tourDay(start)} – ${tourDay(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
}

/**
 * The team's own date at `now` (yyyy-mm-dd). `now` is a UTC instant, so its first ten characters are tomorrow for about
 * four hours each US evening: an event today read "Tomorrow" (audit 2026-10-31).
 */
export function teamToday(now: string, timezone: string): string {
  try {
    return isoDay(now, timezone);
  } catch {
    return now.slice(0, 10);
  }
}

/** Whole days from `now`'s date to `iso`'s date (negative once it has passed). */
export function daysUntil(now: string, iso: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(iso) - d(now)) / 86_400_000);
}

/** "Today", "Tomorrow", "In 6 days", "Yesterday", "3 days ago". */
export function inDays(now: string, iso: string): string {
  const n = daysUntil(now, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

/** "7:50 AM" from an instant, in the instant's own offset (the team's zone as the server wrote it). */
export function tourTime(instant: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(instant);
  if (!m) return formatClock(instant);
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Tue 7:50 AM". */
export function tourDayTime(instant: string): string {
  return `${tourDay(instant, { weekday: 'short' })} ${tourTime(instant)}`;
}

/** "54 holes" for the event's rounds at its format's hole count. */
export function holesLabel(e: Pick<ChTourEvent, 'rounds' | 'format'>): string {
  const holes = e.rounds.length * e.format.holes;
  return holes > 0 ? `${holes} holes` : 'Holes not set';
}

/** "stroke play" or "match play": the words the event line uses for how the event is scored. */
export function playLabel(f: TourFormat): string {
  return f.kind === 'match' || f.kind === 'medal_match' ? 'match play' : 'stroke play';
}

/** Whether a team score is made of counting scores (the 5-count-4 family), so "each round" belongs after it. */
export const countsEachRound = (f: TourFormat) => f.kind !== 'individual' && f.kind !== 'match' && f.kind !== 'medal_match';

/** "5 count 4", or the format's own words where nobody counts. */
export function countLabel(f: TourFormat): string {
  if (f.kind === 'individual') return 'Individuals only';
  if (f.kind === 'match' || f.kind === 'medal_match') return 'Match play';
  return `${f.players} count ${f.counting}`;
}

/** "5-count-4", the ledger's compact form. */
export function countShort(f: TourFormat): string {
  if (f.kind === 'individual' || f.kind === 'match' || f.kind === 'medal_match') return countLabel(f);
  return `${f.players}-count-${f.counting}`;
}

/** "3–1–0". */
export function recordText(r: ChTourRecord): string {
  return `${r.w}–${r.l}–${r.t}`;
}

/** First names, joined: "Theo, Sofia, Ava". */
export function firstNames(ids: readonly string[], players: ReadonlyArray<{ id: string; first: string }>): string {
  return ids.map((id) => players.find((p) => p.id === id)?.first ?? '').filter(Boolean).join(', ');
}

/** "A", "A and B", "A, B and C". */
export function andList(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "1 event", "3 events": lib/plural's, re-exported for the tournament views. */
export { plural } from '../../lib/plural';

/** "Finish round 1" for a round left live after its day, "Score round 1" for one that never started. */
export function closeLabel(close: { round: number; live: boolean }): string {
  return `${close.live ? 'Finish' : 'Score'} round ${close.round}`;
}

/**
 * The coach's word for an event now, on the team's day: "Needs closing" past its day and not final, "Live now" in play
 * today, "Today" on its first day before play, else how far off it is.
 */
export function showChip(e: { show: 'upcoming' | 'today' | 'live' | 'needs_closing' | 'final'; startDate: string }, today: string): string {
  if (e.show === 'needs_closing') return 'Needs closing';
  if (e.show === 'live') return 'Live now';
  if (e.show === 'today') return 'Today';
  return inDays(today, e.startDate);
}

/** The player's word for an event now: a past event the coach hasn't closed is "Scores pending" (closing is the coach's job). */
export function playerShowChip(e: { show: 'upcoming' | 'today' | 'live' | 'needs_closing' | 'final'; startDate: string }, today: string): string {
  return e.show === 'needs_closing' ? 'Scores pending' : showChip(e, today);
}

/**
 * A finish's "of": the teams with a score, and the field too when it is larger (coach audit, 13 Nov 2026: "4 of 4" against a
 * field of 12). The place is among the teams scored, so it is never said "of 12" alone.
 */
export function finishOf(f: { of: number; field?: number | null }): string {
  return f.field != null && f.field > f.of ? `of ${f.of} scored · ${f.field} teams` : `of ${f.of}`;
}

/** The desk's "of 14 teams", or the scored and the field when they differ ("of 4 scored · 12 teams"). */
export function finishTeams(f: { of: number; field?: number | null }): string {
  return f.field != null && f.field > f.of ? finishOf(f) : `of ${f.of} teams`;
}
