import type { ChClock } from '../lib/clock-cookie';
import { clockFromMinutes } from '../lib/clock-format';
import { parseClassName } from './classes-shape';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from './class-day-shape';

/**
 * P-10 class awareness: "who is in class right now", as pure functions of the payload and an instant.
 *
 * Every surface (the thread header, the composer, Home, Roster, the sheets and the player's own "Coaches see" row)
 * renders from `classStatusFor`, so the coach view and the player's preview read the same line for the same payload
 * and moment by construction.
 *
 * The one rule that outranks the rest: a wrong "in class" must never silence a player. Every uncertain input here
 * resolves to "none". There is no pre-class window (Must 2): a hold begins at the first block, and "Class at 1:00 PM"
 * is information only: it never drives the composer placeholder or Notify anyway.
 *
 * Nothing here reads a clock: `now` is always passed in (epoch ms).
 */

const MINUTE = 60_000;
/** Two blocks with a gap of this many minutes or less are one island (the walk between classes). */
export const ISLAND_GAP_MINUTES = 15;
/** "Class at 1:00 PM" shows when the next island starts within this many minutes. */
export const SOON_MINUTES = 15;
/** The Home line goes quiet outside these hours (class-zone wall clock). */
export const HOME_LINE_FROM_HOUR = 7;
export const HOME_LINE_UNTIL_HOUR = 19;

// ---------------------------------------------------------------------------
// Zones and wall clocks
// ---------------------------------------------------------------------------

const WALL = new Map<string, Intl.DateTimeFormat>();

function wallParts(at: number, timeZone: string): { year: number; month: number; day: number; hour: number; minute: number } | null {
  try {
    let fmt = WALL.get(timeZone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      WALL.set(timeZone, fmt);
    }
    const out: Record<string, number> = {};
    for (const p of fmt.formatToParts(at)) if (p.type !== 'literal') out[p.type] = Number(p.value);
    const { year, month, day, hour, minute } = out as { year: number; month: number; day: number; hour: number; minute: number };
    if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
    return { year, month, day, hour: hour % 24, minute };
  } catch {
    return null;
  }
}

/** Minutes after midnight on the wall clock of `timeZone` at `at`; null when the zone does not resolve. */
export function minutesOfDay(at: number, timeZone: string): number | null {
  const w = wallParts(at, timeZone);
  return w ? w.hour * 60 + w.minute : null;
}

/** The calendar day of `at` in `timeZone` as YYYY-MM-DD; null when the zone does not resolve. */
export function dayOf(at: number, timeZone: string): string | null {
  const w = wallParts(at, timeZone);
  return w ? `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}` : null;
}

function offsetMs(at: number, timeZone: string): number | null {
  const w = wallParts(at, timeZone);
  if (!w) return null;
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute) - Math.floor(at / MINUTE) * MINUTE;
}

/** The instant a wall-clock time (minutes after midnight) occurs on `dayIso` in `timeZone`; null when the zone does not resolve. */
export function instantAt(dayIso: string, minutes: number, timeZone: string): number | null {
  const [y, m, d] = dayIso.split('-').map(Number);
  if (![y, m, d].every((n) => Number.isFinite(n))) return null;
  const guess = Date.UTC(y!, m! - 1, d!) + minutes * MINUTE;
  const first = offsetMs(guess, timeZone);
  if (first == null) return null;
  const at = guess - first;
  const second = offsetMs(at, timeZone);
  return second != null && second !== first ? guess - second : at;
}

/** "CT" for America/Chicago: the generic short zone name, so a daylight change never flips the suffix. */
export function zoneAbbreviation(timeZone: string, at: number): string | null {
  try {
    for (const style of ['shortGeneric', 'short'] as const) {
      const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: style }).formatToParts(at).find((p) => p.type === 'timeZoneName');
      if (part?.value) return part.value;
    }
  } catch {
    /* fall through */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Islands and status
// ---------------------------------------------------------------------------

export type ChIsland = { startsAt: number; endsAt: number; blocks: ChClassBlock[]; kind: 'class' | 'exam' };

const startMs = (b: ChClassBlock) => Date.parse(b.startsAt);
const endMs = (b: ChClassBlock) => Date.parse(b.endsAt);

/**
 * Blocks whose gap is `gapMinutes` or less (overlaps and back-to-back included) are one island, sorted by start. An
 * island is an exam island only when every block in it is an exam. Blocks that do not parse are skipped.
 */
export function mergeIslands(blocks: readonly ChClassBlock[], gapMinutes: number = ISLAND_GAP_MINUTES): ChIsland[] {
  const sorted = blocks.filter((b) => Number.isFinite(startMs(b)) && Number.isFinite(endMs(b)) && endMs(b) > startMs(b)).sort((a, b) => startMs(a) - startMs(b));
  const out: ChIsland[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && startMs(b) <= last.endsAt + gapMinutes * MINUTE) {
      last.blocks.push(b);
      last.endsAt = Math.max(last.endsAt, endMs(b));
    } else {
      out.push({ startsAt: startMs(b), endsAt: endMs(b), blocks: [b], kind: 'class' });
    }
  }
  for (const island of out) island.kind = island.blocks.every((b) => b.kind === 'exam') ? 'exam' : 'class';
  return out;
}

export type ChClassStatus =
  | { kind: 'in_class' | 'exam'; until: number; island: ChIsland }
  | { kind: 'soon'; at: number; island: ChIsland }
  | { kind: 'travelling'; destination: string | null }
  | { kind: 'none' };

const NONE: ChClassStatus = { kind: 'none' };

/**
 * One player's status at `now`. Order: on the course outranks everything and reads as no class (Roster's own line, if
 * a plan ever builds one, handles the course); a confirmed trip reads as travelling; an untracked player reads as
 * none; the island holding `now` reads as in class or an exam; an island starting within 15 minutes reads as soon.
 */
export function classStatusFor(p: ChClassDayPlayer, now: number): ChClassStatus {
  if (p.onCourse) return NONE;
  if (p.away?.confirmed) return { kind: 'travelling', destination: p.away.destination };
  if (!p.tracked) return NONE;
  const islands = mergeIslands(p.blocks);
  for (const island of islands) {
    if (island.startsAt <= now && now < island.endsAt) return { kind: island.kind === 'exam' ? 'exam' : 'in_class', until: island.endsAt, island };
  }
  for (const island of islands) {
    const wait = island.startsAt - now;
    if (wait > 0 && wait <= SOON_MINUTES * MINUTE) return { kind: 'soon', at: island.startsAt, island };
  }
  return NONE;
}

/** Whether a status is the player being in a block right now (a class or an exam). */
export const isInBlock = (s: ChClassStatus): s is Extract<ChClassStatus, { kind: 'in_class' | 'exam' }> => s.kind === 'in_class' || s.kind === 'exam';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export type ChStatusTextOptions = {
  clock: ChClock;
  /** The team's zone; also the zone times are drawn in when `classTz` is absent. */
  teamTz: string;
  /** The term's class zone. When it differs from the team's, times are drawn in it with its abbreviation. */
  classTz: string | null;
};

/** "11:50 AM", or "11:50 AM CT" when the class zone differs from the team's. Null when the zone does not resolve. */
export function statusClock(at: number, o: ChStatusTextOptions): string | null {
  const zone = o.classTz ?? o.teamTz;
  const minutes = minutesOfDay(at, zone);
  if (minutes == null) return null;
  const time = clockFromMinutes(minutes, o.clock);
  if (o.classTz && o.classTz !== o.teamTz) {
    const abbr = zoneAbbreviation(o.classTz, at);
    return abbr ? `${time} ${abbr}` : time;
  }
  return time;
}

/** The one line every surface shows, or null when there is nothing to say. */
export function classStatusText(s: ChClassStatus, o: ChStatusTextOptions): string | null {
  switch (s.kind) {
    case 'in_class': {
      const t = statusClock(s.until, o);
      return t ? `In class until ${t}` : null;
    }
    case 'exam': {
      const t = statusClock(s.until, o);
      return t ? `In an exam until ${t}` : null;
    }
    case 'soon': {
      const t = statusClock(s.at, o);
      return t ? `Class at ${t}` : null;
    }
    case 'travelling':
      return s.destination ? `Travelling · ${s.destination}` : 'Travelling';
    default:
      return null;
  }
}

/** "STAT 201" when the stored name carries a course code, else the first 24 characters with an ellipsis. Never a room or an instructor. */
export function classLabel(label: string): string {
  const { code, name } = parseClassName(label);
  if (code) return code;
  const text = (name || label).trim();
  return text.length > 24 ? `${text.slice(0, 24).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------

export type ChFreeWindow = { from: number; to: number | null };
export type ChFreeWindowResult = ChFreeWindow | 'none_before_cutoff' | null;

export type ChTeamNow = {
  /** Active players on the team. */
  total: number;
  /** Players with sharing on and a usable class: the only people the numbers below count. */
  tracked: number;
  inClassNow: number;
  inExamNow: number;
  firstClassAt: number | null;
  /** The next island start after now, and how many tracked players start a block then. */
  nextClass: { at: number; count: number } | null;
  lastEndAt: number | null;
  /** True when every tracked player has a team break or a no-class day covering today. */
  allOffToday: boolean;
  freeWindow: ChFreeWindowResult;
};

/** Tracked players that are available to be counted in class (the course and a confirmed trip take a player out). */
const countable = (p: ChClassDayPlayer) => p.tracked && !p.onCourse && !p.away?.confirmed;

/** The cutoff for "everyone out of class": 7 PM in the class zone on the payload's date. */
function cutoffFor(day: ChClassDay, untilHour: number): number | null {
  return instantAt(day.on, untilHour * 60, day.classTimeZone);
}

/**
 * The first stretch of at least `minMinutes`, starting at or after `after` (default now), in which no countable
 * player has a block. Unbounded (`to: null`) when no block follows it before the cutoff; `'none_before_cutoff'` when
 * no such stretch fits before the cutoff; null when no countable player has any block left today (nothing to say).
 * It is never "everyone free": untracked players and practices are unknown.
 */
export function freeWindow(
  day: ChClassDay,
  now: number,
  o: { minMinutes?: number; untilHour?: number; after?: number } = {},
): ChFreeWindowResult {
  const min = (o.minMinutes ?? 60) * MINUTE;
  const cutoff = cutoffFor(day, o.untilHour ?? HOME_LINE_UNTIL_HOUR);
  if (cutoff == null) return null;
  const from = Math.max(now, o.after ?? now);
  const busy = mergeIslands(
    day.players.filter(countable).flatMap((p) => p.blocks),
    0,
  ).filter((i) => i.endsAt > from);
  if (busy.length === 0) return null;
  let cursor = from;
  for (const b of busy) {
    if (b.startsAt <= cursor) {
      cursor = Math.max(cursor, b.endsAt);
      continue;
    }
    if (b.startsAt - cursor >= min) {
      if (b.startsAt <= cutoff) return cursor + min <= cutoff ? { from: cursor, to: b.startsAt } : 'none_before_cutoff';
      return cursor + min <= cutoff ? { from: cursor, to: null } : 'none_before_cutoff';
    }
    cursor = b.endsAt;
  }
  return cursor + min <= cutoff ? { from: cursor, to: null } : 'none_before_cutoff';
}

/** The counts the Home line and the sheets read, from the payload at `now`. Tracked players only. */
export function teamNow(day: ChClassDay, now: number): ChTeamNow {
  const total = day.players.length;
  const tracked = day.players.filter((p) => p.tracked);
  let inClassNow = 0;
  let inExamNow = 0;
  let firstClassAt: number | null = null;
  let lastEndAt: number | null = null;
  let nextAt: number | null = null;
  for (const p of tracked) {
    const status = classStatusFor(p, now);
    if (status.kind === 'in_class') inClassNow += 1;
    else if (status.kind === 'exam') inExamNow += 1;
    for (const b of p.blocks) {
      const s = startMs(b);
      const e = endMs(b);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      firstClassAt = firstClassAt == null ? s : Math.min(firstClassAt, s);
      lastEndAt = lastEndAt == null ? e : Math.max(lastEndAt, e);
    }
    for (const island of mergeIslands(p.blocks)) {
      if (island.startsAt > now) nextAt = nextAt == null ? island.startsAt : Math.min(nextAt, island.startsAt);
    }
  }
  const nextClass =
    nextAt == null ? null : { at: nextAt, count: tracked.filter((p) => !p.onCourse && !p.away?.confirmed && mergeIslands(p.blocks).some((i) => i.startsAt === nextAt)).length };
  const startFrom = firstClassAt != null && now < firstClassAt ? firstClassAt : now;
  return {
    total,
    tracked: tracked.length,
    inClassNow,
    inExamNow,
    firstClassAt,
    nextClass,
    lastEndAt,
    allOffToday: tracked.length > 0 && tracked.every((p) => p.offToday),
    freeWindow: freeWindow(day, now, { after: startFrom }),
  };
}

/** "2:15 PM", "2:15 to 3:30 PM", "11:45 AM to 12:30 PM": a window in the clock's own words (times only; the caller adds words). */
export function windowRange(from: number, to: number | null, o: ChStatusTextOptions): string | null {
  const zone = o.classTz ?? o.teamTz;
  const a = minutesOfDay(from, zone);
  if (a == null) return null;
  if (to == null) return clockFromMinutes(a, o.clock);
  const b = minutesOfDay(to, zone);
  if (b == null) return null;
  if (o.clock === '24') return `${clockFromMinutes(a, '24')} to ${clockFromMinutes(b, '24')}`;
  const sameHalf = a < 720 === b < 720;
  return `${clockFromMinutes(a, '12', !sameHalf)} to ${clockFromMinutes(b, '12')}`;
}

// ---------------------------------------------------------------------------
// The composer and Notify anyway
// ---------------------------------------------------------------------------

/**
 * The composer placeholder for a coach writing to this player, or null for the normal one. Only while the player is
 * in a class or an exam right now and their pushes are held: the message then won't interrupt them (Should 14: it
 * promises nothing about when they read it). "Class at 1:00 PM" never changes the placeholder.
 */
export function composerPlaceholder(p: ChClassDayPlayer, now: number, firstName: string | null): string | null {
  if (!p.holds) return null;
  const s = classStatusFor(p, now);
  if (!isInBlock(s)) return null;
  const who = firstName?.trim() || 'them';
  return s.kind === 'exam' ? `Won't interrupt ${who} in an exam` : `Won't interrupt ${who} in class`;
}

/** The recipients Notify anyway would skip a hold for: tracked, holding, and in a class or exam right now. */
export function notifyAnywayTargets(day: ChClassDay, participantPlayerIds: readonly string[], now: number): ChClassDayPlayer[] {
  const wanted = new Set(participantPlayerIds);
  return day.players.filter((p) => wanted.has(p.playerId) && p.holds && isInBlock(classStatusFor(p, now)));
}
