/**
 * P-5 Tournaments from the calendar: the pure model behind the tournament fields (the calendar editor's section, round
 * mode, the drag order rule and the create payload). No React, no DOM, no clock: the caller passes the team's time zone
 * and today. Plan: P-05 sections 4.1, 6.4, 8.10 and 11.1, with the 2026-10-25 changelog applied.
 *
 * Times are the team's wall clock ("08:42") on calendar dates ("2026-11-05"). Each round's instant takes the zone's
 * offset on its own date (offsetMinutesFor), so an 8:00 AM tee is 8:00 AM local on both sides of a clock change.
 *
 * Round order (one rule for the editor, the drag, the RPCs and the 040100 trigger): a timed round keys at its local
 * wall time; a round with no tee time keys at the very end of its day, so it sorts after that day's timed rounds. Two
 * untimed rounds may share a day (a 36-hole day with no times yet); two timed rounds may not share a minute.
 */
import { plural } from '../../../lib/plural';
import { offsetMinutesFor } from '@/lib/golf/timezone';
import { rangeText, shortDay } from '@/lib/golf/tournaments/dates';
import type { ChClock } from '../../../lib/clock-cookie';
import { addDays, dayNum, dowOf, fmtHour, monthName } from '../../calendar/model';

export type ChTourStartType = 'tee_times' | 'shotgun' | 'two_tees';
/**
 * 4.33's stored format (golf_tournaments.format). The same union as PR 2354's ChTourFormatKind
 * (screens/tournaments/scoring.ts on the 4.33 branch); when that file lands here, import it instead (parity test).
 */
export type ChTourFormatKind = '5c4' | '6c5' | '6c4' | 'custom' | 'match' | 'medal_match' | 'individual';
export type ChTourCounting = '5c4' | '6c5' | '6c4' | 'custom';
export type ChTourPlay = 'stroke' | 'match' | 'medal_match' | 'individual';
export type ChTourEventKind = 'regular' | 'conference' | 'ncaa_regional' | 'ncaa_championship' | 'exhibition';

export const MAX_ROUNDS = 6;
export const DEFAULT_LOCK_MINUTES = 10;

/** One round as the form holds it. `tee` is null for a round with no first tee yet (stored all-day). */
export interface ChRoundDraft {
  id: string;
  date: string;
  tee: string | null;
  startType: ChTourStartType;
  /** Only when "Same course every round" is off. */
  courseId?: string | null;
  courseLabel?: string | null;
  /** A calendar event this round adopts (convert, or "Set up from calendar" grouping). */
  eventId?: string | null;
  /** Read-side only (a saved tournament's rounds): a cancelled round is ignored by the order rule. */
  cancelled?: boolean;
}

export interface ChTourCourse {
  id: string | null;
  label: string;
  teeId?: string | null;
  /** "Blue tees · 7,214 yds", "Tees later", or "Not in the course library". */
  teeLine?: string | null;
}

export interface ChTourState {
  name: string;
  firstDay: string;
  lastDay: string;
  mode: 'daily' | 'custom';
  rounds: ChRoundDraft[];
  course: ChTourCourse | null;
  sameCourse: boolean;
  counting: ChTourCounting;
  play: number;
  count: number;
  format: ChTourPlay;
  holes: 9 | 18;
  eventKind: ChTourEventKind;
  fieldSize: number | null;
  host: string;
  resultsUrl: string;
  lockMinutes: number;
}

let seq = 0;
/** A round row's stable id (React keys and the re-sort FLIP); not stored. */
export const nextRoundId = () => `rd${++seq}`;

/** "08:42" to minutes after midnight. */
export const teeMinutes = (tee: string) => {
  const [h, m] = tee.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const dayIndex = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
/** Days from `a` to `b`, inclusive count minus one (0 for the same day). */
export const daysBetween = (a: string, b: string) => dayIndex(b) - dayIndex(a);

/** The order key: minutes since the epoch day, a timed round at its wall time, an untimed one just before midnight. */
export function orderKey(r: Pick<ChRoundDraft, 'date' | 'tee'>): number {
  return dayIndex(r.date) * 1440 + (r.tee ? teeMinutes(r.tee) : 1440 - 0.001);
}

/** A new form's state: one round on the day, stroke play, 5 count 4, 18 holes, the lock 10 minutes before the first tee. */
export function initialTourState(first: string, last = first, over: Partial<ChTourState> = {}): ChTourState {
  const lastDay = last < first ? first : last;
  return {
    name: '',
    firstDay: first,
    lastDay,
    mode: 'daily',
    rounds: roundsFromRange(first, lastDay, []),
    course: null,
    sameCourse: true,
    counting: '5c4',
    play: 5,
    count: 4,
    format: 'stroke',
    holes: 18,
    eventKind: 'regular',
    fieldSize: null,
    host: '',
    resultsUrl: '',
    lockMinutes: DEFAULT_LOCK_MINUTES,
    ...over,
  };
}

/**
 * "One round each day": one round per day from the first day to the last (up to 7 days are drawn; validate refuses the
 * seventh). Rows that remain keep their times, start type and course: a shorter range drops rows from the end, a longer
 * one adds them.
 */
export function roundsFromRange(first: string, last: string, prev: readonly ChRoundDraft[]): ChRoundDraft[] {
  const n = Math.max(1, Math.min(MAX_ROUNDS + 1, daysBetween(first, last) + 1));
  return Array.from({ length: n }, (_, i) => {
    const was = prev[i];
    return { id: was?.id ?? nextRoundId(), date: addDays(first, i), tee: was?.tee ?? null, startType: was?.startType ?? 'tee_times', ...(was?.courseId !== undefined ? { courseId: was.courseId, courseLabel: was.courseLabel } : {}) };
  });
}

/** The second round of a 36-hole day: the previous first tee plus 5:30, or none when there is none (or it would pass midnight). */
export function defaultSecondTee(prevTee: string | null): string | null {
  if (!prevTee) return null;
  const m = teeMinutes(prevTee) + 330;
  return m < 1440 ? hhmm(m) : null;
}

/** Custom: a round on the last round's day, timed 5:30 after it when it has a time. Nothing past six rounds. */
export function addRound(list: readonly ChRoundDraft[]): ChRoundDraft[] {
  if (list.length >= MAX_ROUNDS) return [...list];
  const last = list[list.length - 1];
  if (!last) return [{ id: nextRoundId(), date: '', tee: null, startType: 'tee_times' }];
  return [...list, { id: nextRoundId(), date: last.date, tee: defaultSecondTee(last.tee), startType: last.startType }];
}

/** Only the last round can be removed, so round numbers never have a gap. One round always stays. */
export function removeLastRound(list: readonly ChRoundDraft[]): ChRoundDraft[] {
  return list.length > 1 ? list.slice(0, -1) : [...list];
}

/** Rounds in date and time order (stable for equal keys): the plates number from this order. */
export function sortRounds<R extends Pick<ChRoundDraft, 'date' | 'tee'>>(list: readonly R[]): R[] {
  return list
    .map((r, i) => ({ r, i }))
    .sort((a, b) => orderKey(a.r) - orderKey(b.r) || a.i - b.i)
    .map((x) => x.r);
}

/** True when the list is already in round order (the editor re-sorts, and announces it, when it isn't). */
export function inRoundOrder(list: readonly Pick<ChRoundDraft, 'date' | 'tee'>[]): boolean {
  return list.every((r, i) => i === 0 || orderKey(list[i - 1]!) <= orderKey(r));
}

/**
 * The order rule, on rounds given in round-number order: each round that isn't cancelled starts after the one before
 * it. Equal keys pass only for two untimed rounds (a 36-hole day with no times yet). Returns the first pair out of order
 * (1-based round numbers), or null when the order holds.
 */
export function roundOrderBreak(list: readonly Pick<ChRoundDraft, 'date' | 'tee' | 'cancelled'>[]): { before: number; after: number } | null {
  let prev: { n: number; key: number; untimed: boolean } | null = null;
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    if (r.cancelled) continue;
    const key = orderKey(r);
    const untimed = !r.tee;
    if (prev && (key < prev.key || (key === prev.key && !(untimed && prev.untimed)))) return { before: prev.n, after: i + 1 };
    prev = { n: i + 1, key, untimed };
  }
  return null;
}
export const roundOrderOk = (list: readonly Pick<ChRoundDraft, 'date' | 'tee' | 'cancelled'>[]) => roundOrderBreak(list) === null;

/** Pairs of rows that share a day: the index of the first row of each 36-hole day, for its top label. */
export function thirtySixHoleStarts(list: readonly Pick<ChRoundDraft, 'date'>[]): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i + 1 < list.length; i++) {
    const d = list[i]!.date;
    if (d && d === list[i + 1]!.date && (i === 0 || list[i - 1]!.date !== d)) out.add(i);
  }
  return out;
}

/** The instant for a wall time on a date in the zone, as an ISO string with that date's own offset. */
export function zonedIso(date: string, tee: string, timeZone: string): string {
  const off = offsetMinutesFor(date, tee, timeZone) ?? 0;
  const sign = off <= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${date}T${tee}:00${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** A round's stored start: its tee in the team's zone, or the calendar's all-day convention (UTC midnight of the date). */
export function roundStartAt(r: Pick<ChRoundDraft, 'date' | 'tee'>, timeZone: string): string {
  return r.tee ? zonedIso(r.date, r.tee, timeZone) : `${r.date}T00:00:00+00:00`;
}

export interface ChLockAt {
  /** The lock instant (ISO), or null when R1 has no tee time. */
  at: string | null;
  date: string | null;
  /** Wall-clock minutes after midnight on `date`. */
  minutes: number | null;
  /** R1 is cancelled: the lock stays on R1 (4.33's rule, tournaments-plan.md:172). */
  r1Cancelled: boolean;
}

/**
 * When the lineup locks: R1's first tee (a shotgun's start is its first tee) less `lockMinutes`, in the team's zone.
 * Always R1, even when R1 is cancelled (changelog should 9: 4.33's lock and substitute RPCs use R1). R1 with no time
 * gives no lock yet.
 */
export function lockAt(rounds: readonly Pick<ChRoundDraft, 'date' | 'tee' | 'cancelled'>[], lockMinutes: number, timeZone: string): ChLockAt {
  const r1 = rounds[0];
  if (!r1 || !r1.tee || !r1.date) return { at: null, date: null, minutes: null, r1Cancelled: !!r1?.cancelled };
  let mins = teeMinutes(r1.tee) - lockMinutes;
  let date = r1.date;
  while (mins < 0) {
    mins += 1440;
    date = addDays(date, -1);
  }
  return { at: zonedIso(date, hhmm(mins), timeZone), date, minutes: mins, r1Cancelled: !!r1.cancelled };
}

export { rangeText, shortDay };
/** "Thursday 5 November", for speech. */
export function spokenDay(d: string): string {
  const long: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
  return `${long[dowOf(d)] ?? dowOf(d)} ${dayNum(d)} ${monthName(d)}`;
}
export const teeText = (tee: string, clock: ChClock = '12') => fmtHour(teeMinutes(tee) / 60, true, clock);

/** The lock line under the rounds (4.1.6). */
export function lockLine(rounds: readonly Pick<ChRoundDraft, 'date' | 'tee' | 'cancelled'>[], lockMinutes: number, timeZone: string, clock: ChClock = '12'): string {
  const l = lockAt(rounds, lockMinutes, timeZone);
  if (!l.at || l.date == null || l.minutes == null) return 'Lineup lock is set once R1 has a tee time.';
  const when = `${shortDay(l.date)} at ${fmtHour(l.minutes / 60, true, clock)}`;
  if (l.r1Cancelled) return `R1 is cancelled. The lineup still locks ${when}, ${lockMinutes} minutes before R1’s first tee.`;
  return `Lineup locks ${when}, ${lockMinutes} minutes before the first tee.`;
}

/** "Name · R2", the stored calendar title of a round (D-81). */
export const roundTitle = (name: string, n: number) => `${name} · R${n}`;

/**
 * A block's title split from its round number, only when the event carries a round ref: "Pinehurst Invitational · R2"
 * with ref R2 gives the name and 2. Without a ref the title is left whole (a title that merely ends " · R2" is never
 * stripped), so the flag off shows exactly what is stored.
 */
export function roundTitleParts(title: string, ref: { roundNo: number } | null | undefined): { name: string; round: number | null } {
  if (!ref) return { name: title, round: null };
  const suffix = ` · R${ref.roundNo}`;
  return { name: title.endsWith(suffix) ? title.slice(0, -suffix.length) : title, round: ref.roundNo };
}

export const COUNTING_OPTIONS: ReadonlyArray<{ value: ChTourCounting; label: string }> = [
  { value: '5c4', label: '5 play, 4 count' },
  { value: '6c5', label: '6 play, 5 count' },
  { value: '6c4', label: '6 play, 4 count' },
  { value: 'custom', label: 'Custom' },
];
export const FORMAT_OPTIONS: ReadonlyArray<{ value: ChTourPlay; label: string }> = [
  { value: 'stroke', label: 'Stroke play' },
  { value: 'match', label: 'Match play' },
  { value: 'medal_match', label: 'Medal match' },
  { value: 'individual', label: 'Individual' },
];
export const EVENT_KIND_OPTIONS: ReadonlyArray<{ value: ChTourEventKind; label: string }> = [
  { value: 'regular', label: 'Regular' },
  { value: 'conference', label: 'Conference' },
  { value: 'ncaa_regional', label: 'NCAA regional' },
  { value: 'ncaa_championship', label: 'NCAA championship' },
  { value: 'exhibition', label: 'Exhibition' },
];
const PRESET: Record<Exclude<ChTourCounting, 'custom'>, { play: number; count: number }> = { '5c4': { play: 5, count: 4 }, '6c5': { play: 6, count: 5 }, '6c4': { play: 6, count: 4 } };
/** The players and counting a counting choice stands for (PR 2354's formatOf: the three presets fix them). */
export function countingNumbers(counting: ChTourCounting, play: number, count: number): { play: number; count: number } {
  return counting === 'custom' ? { play, count: Math.min(count, play) } : PRESET[counting];
}

/**
 * 4.34.5's two pickers onto 4.33's one `format` column. Stroke play stores the counting code; the match formats and
 * custom always send players and counting (changelog should 17), the presets never need to; individual sends neither.
 */
export function formatToColumns(format: ChTourPlay, counting: ChTourCounting, play = 5, count = 4): { format: ChTourFormatKind; playersPerTeam?: number; counting?: number } {
  if (format === 'individual') return { format: 'individual' };
  const n = countingNumbers(counting, play, count);
  if (format === 'match' || format === 'medal_match') return { format, playersPerTeam: n.play, counting: n.count };
  if (counting === 'custom') return { format: 'custom', playersPerTeam: n.play, counting: n.count };
  return { format: counting };
}

export interface ChTourReceiptInput {
  state: Pick<ChTourState, 'name' | 'rounds' | 'firstDay' | 'lastDay' | 'course' | 'sameCourse'>;
  convert: boolean;
  rsvp: boolean;
  qualifierName?: string | null;
}

function courseCount(s: ChTourReceiptInput['state']): { n: number; one: string | null } {
  if (s.sameCourse || s.rounds.length < 2) return { n: s.course ? 1 : 0, one: s.course?.label ?? null };
  const names = new Set(s.rounds.map((r) => r.courseLabel ?? s.course?.label ?? '').filter(Boolean));
  return { n: names.size, one: names.size === 1 ? [...names][0]! : null };
}

/** The receipt sentence (4.1.9) that replaces the editor's receipt list for a tracked tournament. */
export function receiptSentence({ state, convert, rsvp, qualifierName }: ChTourReceiptInput): string {
  const name = state.name.trim();
  const n = state.rounds.length;
  const dates = state.rounds.map((r) => r.date).filter(Boolean).sort();
  const first = dates[0] ?? state.firstDay;
  const last = dates[dates.length - 1] ?? state.lastDay;
  const c = courseCount(state);
  const where = c.n === 0 ? '' : c.one ? ` at ${c.one}` : ` on ${c.n} courses`;
  const when = n === 1 ? ` on ${shortDay(first)}` : `, ${rangeText(first, last)}`;
  const parts: string[] = [];
  if (convert) {
    const added = n === 1 ? '' : n === 2 ? '; R2 is added' : n === 3 ? '; R2 and R3 are added' : `; R2 to R${n} are added`;
    parts.push(`Sets up ${name || 'the tournament'} in Tournaments. This event becomes R1 and keeps its replies and files${added}.`);
  } else {
    parts.push(`Creates ${name || 'the tournament'} in Tournaments with ${plural(n, 'round')}${when}${where}.`);
  }
  parts.push('Players see the rounds now and the lineup when you publish it.');
  if (rsvp) parts.push('Players are asked to reply for each round.');
  if (qualifierName) parts.push(`${qualifierName} counts toward it.`);
  return parts.join(' ');
}

/** CH-614x: what stops a save, keyed by field. The form shows every one at once and focuses the first. */
export type ChTourErrors = Partial<Record<'name' | 'course' | 'days' | 'rounds' | 'counting' | 'resultsUrl', { code: string; text: string }>>;

export function validate(s: ChTourState): ChTourErrors {
  const e: ChTourErrors = {};
  const name = s.name.trim();
  if (!name || name.length > 120) e.name = { code: 'CH-6147', text: 'Add a name for the tournament, up to 120 characters.' };
  const perRoundCourse = !s.sameCourse && s.rounds.length > 1;
  if (!s.course && !(perRoundCourse && s.rounds.every((r) => r.courseId || r.courseLabel))) e.course = { code: 'CH-6140', text: 'Pick a course to set up the tournament, or turn off Track in Tournaments.' };
  if (s.lastDay < s.firstDay) e.days = { code: 'CH-6141', text: 'The last day is before the first day.' };
  else if (s.rounds.length > MAX_ROUNDS || (s.mode === 'daily' && daysBetween(s.firstDay, s.lastDay) + 1 > MAX_ROUNDS)) e.rounds = { code: 'CH-6142', text: 'A tournament has up to 6 rounds.' };
  if (s.format !== 'individual' && s.counting === 'custom' && s.count > s.play) e.counting = { code: 'CH-6145', text: 'Counting can’t be more than players.' };
  if (s.resultsUrl.trim() && !/^https:\/\/\S+$/.test(s.resultsUrl.trim())) e.resultsUrl = { code: 'CH-6146', text: 'Use a link that starts with https://' };
  return e;
}

export interface ChCreateRound {
  date: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  startType: ChTourStartType;
  courseId?: string | null;
  courseLabel?: string | null;
  teeId?: string | null;
  eventId?: string | null;
}

/** The create action's input (createTournamentFromCalendar's CreateFromCalendarInput), built from the form. */
export interface ChCreateFromCalendar {
  teamId: string;
  requestId: string;
  fromEventId?: string;
  name: string;
  courseId?: string;
  courseLabel?: string;
  format: ChTourFormatKind;
  playersPerTeam?: number;
  counting?: number;
  holesPerRound: 9 | 18;
  eventKind: ChTourEventKind;
  fieldSize?: number;
  host?: string;
  resultsUrl?: string;
  rounds: ChCreateRound[];
  description?: string;
  requiresRsvp: boolean;
  rsvpDeadline?: string;
  attendeeIds: string[];
  qualifierId?: string;
  itineraryId?: string;
  entries?: Array<{ playerId: string; role: 'lineup' | 'alternate' | 'individual'; slot: number | null }>;
}

export function toCreatePayload(
  s: ChTourState,
  timeZone: string,
  x: { teamId: string; requestId: string; fromEventId?: string | null; description?: string; requiresRsvp: boolean; attendeeIds: string[]; qualifierId?: string | null; itineraryId?: string | null; entries?: ChCreateFromCalendar['entries'] },
): ChCreateFromCalendar {
  const rounds = sortRounds(s.rounds).map((r, i): ChCreateRound => {
    const own = !s.sameCourse && s.rounds.length > 1 && (r.courseId || r.courseLabel);
    return {
      date: r.date,
      startAt: roundStartAt(r, timeZone),
      endAt: null,
      allDay: !r.tee,
      startType: r.startType,
      ...(own ? (r.courseId ? { courseId: r.courseId } : { courseLabel: r.courseLabel ?? undefined }) : {}),
      ...(s.course?.teeId && !own ? { teeId: s.course.teeId } : {}),
      ...(i === 0 && x.fromEventId ? { eventId: x.fromEventId } : r.eventId ? { eventId: r.eventId } : {}),
    };
  });
  const cols = formatToColumns(s.format, s.counting, s.play, s.count);
  return {
    teamId: x.teamId,
    requestId: x.requestId,
    ...(x.fromEventId ? { fromEventId: x.fromEventId } : {}),
    name: s.name.trim(),
    ...(s.course?.id ? { courseId: s.course.id } : s.course?.label ? { courseLabel: s.course.label.trim() } : {}),
    ...cols,
    holesPerRound: s.holes,
    eventKind: s.eventKind,
    ...(s.fieldSize != null ? { fieldSize: s.fieldSize } : {}),
    ...(s.host.trim() ? { host: s.host.trim() } : {}),
    ...(s.resultsUrl.trim() ? { resultsUrl: s.resultsUrl.trim() } : {}),
    rounds,
    ...(x.description?.trim() ? { description: x.description.trim() } : {}),
    requiresRsvp: x.requiresRsvp,
    attendeeIds: x.attendeeIds,
    ...(x.qualifierId ? { qualifierId: x.qualifierId } : {}),
    ...(x.itineraryId ? { itineraryId: x.itineraryId } : {}),
    ...(x.entries?.length ? { entries: x.entries } : {}),
  };
}

/** The 1 August season turnover: "2026–27" for any date from 1 Aug 2026 to 31 Jul 2027. */
export function seasonLabelOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = date.slice(5) >= '08-01' ? y : y - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}
