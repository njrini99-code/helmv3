/**
 * Words and dates every Tournaments view writes the same way. Pure and client-safe.
 *
 * Dates are the team's `yyyy-mm-dd`, read at noon so a server render and its hydration land on the same day whatever
 * the machine's zone. "Today" is always the view's `data.now`, never the clock.
 */
import { formatToPar, MINUS, NO_DATA } from '../../lib/format';
import type { ChTourEvent, ChTourRecord, TourFormat } from './types';

export { formatToPar, MINUS, NO_DATA };

const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);

/** "Oct 5" by default; any `toLocaleDateString` options. */
export function tourDay(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return at(iso).toLocaleDateString('en-US', opts);
}

/** "Oct 5 – 7", "Sep 30 – Oct 2", or one day: the board's range. */
export function tourRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return tourDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return `${tourDay(start)} – ${tourDay(end, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}`;
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
  if (!m) return NO_DATA;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Tue 7:50 AM". */
export function tourDayTime(instant: string): string {
  return `${tourDay(instant, { weekday: 'short' })} ${tourTime(instant)}`;
}

/** "54 holes" for the event's rounds at its format's hole count. */
export function holesLabel(e: Pick<ChTourEvent, 'rounds' | 'format'>): string {
  return `${e.rounds.length * e.format.holes} holes`;
}

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

/** ".625", "1.000", or no data. */
export function pctText(pct: number | null): string {
  if (pct == null) return NO_DATA;
  const s = pct.toFixed(3);
  return s.startsWith('0') ? s.slice(1) : s;
}

/** A signed one-decimal figure with the true minus: "+0.9", "−1.4", "0.0". */
export function signed1(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NO_DATA;
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '0.0';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(1)}`;
}

/** First names, joined: "Theo, Sofia, Ava". */
export function firstNames(ids: readonly string[], players: ReadonlyArray<{ id: string; first: string }>): string {
  return ids.map((id) => players.find((p) => p.id === id)?.first ?? '').filter(Boolean).join(', ');
}

/** "1 event", "3 events". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
