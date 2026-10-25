import { sunTimes, type LatLng } from '../../lib/sun';
import type { ChClock } from '../../lib/clock-cookie';
import { clockFromHour } from '../../lib/clock-format';
import type { ChAvailability } from '../../data/availability';
import type { ChCalChange } from './change-view';

/**
 * Calendar view model. The loader resolves every time into the team's
 * timezone on the server, so the client only works with calendar dates
 * (YYYY-MM-DD) and decimal hours: no Date math in the browser's zone.
 */

export type ChCalType = 'practice' | 'qualifier' | 'tournament' | 'meeting' | 'travel' | 'class' | 'other' | 'busy';
export type ChCalView = 'day' | 'week' | 'month' | 'agenda';
export type ChRsvp = 'accepted' | 'maybe' | 'declined' | 'pending';

export interface ChCalPerson {
  id: string;
  name: string;
  year: string | null;
  /** Injured or away, for the coach's lists only (the loader leaves it off for a player). Display only; replies still count. */
  availability?: ChAvailability;
}

export interface ChCalEvent {
  id: string;
  type: ChCalType;
  title: string;
  /** Team-timezone calendar date. */
  date: string;
  /** Decimal hours in the team timezone; null when all day. */
  start: number | null;
  end: number | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  recurring: string | null;
  /** Invited player ids. Empty means "no invitees" (for example a coach call). */
  people: string[];
  /** Per-player reply, keyed by player id. */
  rsvp: Record<string, ChRsvp>;
  /**
   * The coach asked for replies (`golf_events.requires_rsvp`, null read as off). Off is the default (owner, 2026-10-08):
   * an event without it shows no reply controls, counts or "no reply" nudges. Invitees still make up who is on it.
   */
  rsvpRequired: boolean;
  /** `golf_events.rsvp_deadline`: replies lock after it, as the server enforces (Fairway's editor can set one). */
  rsvpDeadline?: string | null;
  /**
   * A player's data only: the event asks for replies and the coach invited no one, so it is the team's and any player
   * may reply (as production allows, golf_event_attendance_insert_self). Their reply puts them on it.
   */
  openReply?: boolean;
  /** Class blocks: the player whose schedule this is. */
  owner: string | null;
  /** Classes a viewer may only see as Busy carry no title or room. */
  busyOnly: boolean;
  instructor: string | null;
  pattern: string | null;
  canEdit: boolean;
  /** Soft-cancelled: still shown, struck through, so it never silently disappears. */
  cancelled: boolean;
  /** Set when the event belongs to a repeating series (edits and cancels ask for scope). */
  seriesId: string | null;
  /** The stored start instant (series edits and cancels key on it). */
  startIso: string;
  /** P-14: what a coach changed on this event in the last 72 hours (until it ends): the new value beside the old one struck. */
  change?: ChCalChange | null;
  /** A cancelled event with no live mark: when it was cancelled and why ("Cancelled Tue 9:14 PM"), so the detail still says. */
  cancelNote?: { line: string; reason: string | null } | null;
  /**
   * Multi-day events: the whole span, repeated on each day's entry. A timed one (a tournament from Friday 7 AM to Sunday
   * 4:30 PM, an overnight trip) also carries its first day's start and its last day's end, in decimal hours: each day's
   * entry draws only its part of the run (the start to midnight, the whole day, midnight to the end).
   */
  span: { from: string; to: string; start?: number; end?: number } | null;
  /**
   * P-4: `golf_events.updated_at` as read, an opaque token a move sends back so it never overwrites a newer change.
   * Absent or null for rows that are not team events (classes, busy time).
   */
  version?: string | null;
  /** P-5 (not built yet): set on a tournament round; until then tournament events drag like any event. */
  round?: { tournamentId: string; roundNo: number; lockedAt: string | null };
}

export interface ChCalOverlap {
  id: string;
  eventId: string;
  withId: string;
  who: string;
  /** Decimal hours of the overlap. */
  from: number;
  to: number;
}

export const CAL_START = 6;
export const CAL_END = 21;
export const CAL_HH = 52;

/** A day's light on the grid (P006-A1), as decimal hours on the team's clock; null where the sun doesn't rise or set. */
export interface ChDaylight {
  rise: number | null;
  set: number | null;
  golden: number | null;
}

/** Sunrise, sunset and the start of golden hour for a calendar day, from the global light's sun (lib/sun.ts sunTimes). */
export function daylightOn(date: string, place: LatLng, timeZone: string): ChDaylight {
  const t = sunTimes(date, place, timeZone);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
  const hour = (ms: number | null) => {
    if (ms === null) return null;
    const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
    return (Number(p.hour) % 24) + Number(p.minute) / 60;
  };
  return { rise: hour(t.sunrise), set: hour(t.sunset), golden: hour(t.goldenStart) };
}

/**
 * The hour the Week and Day grids open on (P006-B1): now, when today is on show; else the first event still ahead on
 * the days shown; else the first timed event shown; else null (the grid stays at its top).
 */
export function focusHour(dates: string[], events: Array<{ date: string; allDay?: boolean; start: number | null; span?: ChCalEvent['span'] }>, now: { date: string; hour: number }): number | null {
  // Now only leads inside the day's working hours: at 10 PM or 5 AM it would park the grid on its empty bottom or top.
  if (dates.includes(now.date) && now.hour >= CAL_START && now.hour < CAL_END) return now.hour;
  // A later day of a timed run starts at midnight only because the run began the day before: it is not a start to open on.
  const timed = events.filter((e) => !e.allDay && e.start != null && dates.includes(e.date) && !(e.span?.start != null && e.date !== e.span.from)).sort((a, b) => a.date.localeCompare(b.date) || a.start! - b.start!);
  const ahead = timed.find((e) => e.date > now.date || (e.date === now.date && e.start! >= now.hour));
  return (ahead ?? timed[0])?.start ?? null;
}

/**
 * Why a player can no longer reply, or null: the server's locks (lib/calendar/rsvp.ts, as Fairway's drawer reads them).
 * A timed event locks at its stored start, an all-day one 24 hours after its stored UTC midnight, every day of a run
 * with the run, and any event past its reply deadline. Without the browser's clock (`ms`: the server's first render, a
 * frozen preview) it reads the team's day and hour instead.
 */
export function replyLock(
  e: Pick<ChCalEvent, 'startIso' | 'allDay' | 'date' | 'start' | 'span' | 'rsvpDeadline'>,
  now: { date: string; hour: number; ms?: number },
): 'started' | 'deadline' | null {
  const lockAt = Date.parse(e.startIso) + (e.allDay ? 86_400_000 : 0);
  const first = e.span?.from ?? e.date;
  const started =
    now.ms != null && Number.isFinite(lockAt) ? lockAt <= now.ms : first < now.date || (first === now.date && !e.allDay && (e.span?.start ?? e.start ?? 0) <= now.hour);
  if (started) return 'started';
  const deadline = e.rsvpDeadline ? Date.parse(e.rsvpDeadline) : NaN;
  return now.ms != null && Number.isFinite(deadline) && deadline < now.ms ? 'deadline' : null;
}

/**
 * Decision B (owner, wave 7): a player sees a meeting only when they are on its invite list, which is their own attendance
 * row (`own`; a player reads it before and after migration 20261017102000). Only when that read failed (`own` null) does
 * D2-8 decide: a meeting nobody is invited to is the coach's own. When the count failed too (`invitedCount` null) the
 * meeting is hidden: a failed read never shows a player more than they are invited to (fail closed).
 */
export function playerSeesMeeting(own: boolean | null, invitedCount: number | null): boolean {
  return own ?? (invitedCount != null && invitedCount !== 0);
}

/**
 * The player's own reply mark (Home's Up next, the sidebar's next event), one rule for both: `going` once they said yes;
 * otherwise only while the server would take a reply (`closed` false): `needed` when their own row is unanswered, or,
 * with no row, when the event is open to the whole team (the coach invited no one; null: unknown, nothing claimed).
 */
export function playerMine(reply: ChRsvp | undefined, closed: boolean, openToTeam: boolean | null): 'going' | 'needed' | null {
  if (reply === 'accepted') return 'going';
  if (closed) return null;
  if (reply) return reply === 'pending' ? 'needed' : null;
  return openToTeam ? 'needed' : null;
}

/**
 * A stored event row takes no reply now: the rules updateRSVP enforces (lib/calendar/rsvp.ts), as Team Hub's
 * `replyIsClosed` reads them: it doesn't ask for replies (null reads as off), it is cancelled, it has started (an all-day
 * event a day after its stored start), or it is past its RSVP deadline.
 */
export function replyClosedAt(
  e: { requires_rsvp?: boolean | null; status?: string | null; cancelled_at?: string | null; all_day: boolean | null; start_time: string; rsvp_deadline?: string | null },
  nowMs: number,
): boolean {
  if (e.requires_rsvp !== true || e.status === 'cancelled' || e.cancelled_at) return true;
  const start = Date.parse(e.start_time);
  if (Number.isFinite(start) && (e.all_day ? start + 86_400_000 : start) <= nowMs) return true;
  return !!e.rsvp_deadline && Date.parse(e.rsvp_deadline) < nowMs;
}

/** The player's reply is waiting on this event: it asks for replies, they are invited (or it is open to the team), they haven't answered, and the server would still take an answer. */
export function playerReplyNeeded(
  e: Pick<ChCalEvent, 'rsvpRequired' | 'cancelled' | 'people' | 'openReply' | 'rsvp' | 'startIso' | 'allDay' | 'date' | 'start' | 'span' | 'rsvpDeadline'>,
  viewerId: string | null,
  now: { date: string; hour: number; ms?: number },
): boolean {
  if (!viewerId || !e.rsvpRequired || e.cancelled) return false;
  if (!e.people.includes(viewerId) && !e.openReply) return false;
  return (e.rsvp[viewerId] ?? 'pending') === 'pending' && !replyLock(e, now);
}

export const TYPE_LABEL: Record<ChCalType, string> = {
  practice: 'Practice',
  qualifier: 'Qualifier',
  tournament: 'Tournament',
  meeting: 'Meeting',
  travel: 'Travel',
  class: 'Class',
  other: 'Event',
  busy: 'Busy time',
};

export const isMajor = (t: ChCalType) => t === 'qualifier' || t === 'tournament';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y!, m!, d!];
}
function utc(date: string): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function addMonths(date: string, n: number): string {
  const [y, m] = parts(date);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1, 12)));
}
export const dowOf = (date: string) => DOW[utc(date).getUTCDay()]!;
export const dayNum = (date: string) => parts(date)[2];
export const monthName = (date: string) => MONTHS[parts(date)[1] - 1]!;
export const yearOf = (date: string) => parts(date)[0];
export const monthKey = (date: string) => date.slice(0, 7);

/** Sunday that starts the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -utc(date).getUTCDay());
}
export function weekDates(date: string): string[] {
  const s = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** Month grid: whole weeks from the Sunday on or before the 1st. */
export function monthCells(date: string): Array<{ date: string; out: boolean }> {
  const first = `${monthKey(date)}-01`;
  const start = weekStart(first);
  const nextMonth = addMonths(first, 1);
  const cells: Array<{ date: string; out: boolean }> = [];
  for (let d = start; d < nextMonth || cells.length % 7 !== 0; d = addDays(d, 1)) {
    cells.push({ date: d, out: monthKey(d) !== monthKey(first) });
  }
  return cells;
}

/**
 * "3:30 PM", or "3:30" without the meridiem; "15:30" with the device's 24-hour clock (Settings › Time format), which has no
 * meridiem to leave out. Every caller in a component passes `useChClock()`; the default is the app's 12-hour voice.
 */
export function fmtHour(h: number, meridiem = true, clock: ChClock = '12'): string {
  return clockFromHour(h, clock, meridiem);
}

export function rangeLabel(e: Pick<ChCalEvent, 'allDay' | 'start' | 'end'> & { date?: string; span?: ChCalEvent['span'] }, clock: ChClock = '12'): string {
  // One day of a timed run over several days says which part of it this day holds.
  const s = e.span;
  if (!e.allDay && s?.start != null && s.end != null && e.date) {
    if (e.date === s.from) return `From ${fmtHour(s.start, true, clock)}`;
    if (e.date === s.to) return `Until ${fmtHour(s.end, true, clock)}`;
    return 'All day';
  }
  if (e.allDay || e.start == null || e.end == null) return 'All day';
  const sameHalf = e.start < 12 === e.end < 12;
  return `${fmtHour(e.start, !sameHalf, clock)} – ${fmtHour(e.end, true, clock)}`;
}

/** A list row's time: the start, or, on a later day of a timed run over several days, "All day" or "Until 4:30 PM". */
export function startLabel(e: Pick<ChCalEvent, 'allDay' | 'start' | 'end' | 'date' | 'span'>, meridiem = true, clock: ChClock = '12'): string {
  if (e.allDay || e.start == null) return 'All day';
  if (e.span?.start != null && e.date !== e.span.from) return rangeLabel(e, clock);
  return fmtHour(e.start, meridiem, clock);
}

export function dayLabel(date: string, today: string): string {
  return `${date === today ? 'Today · ' : ''}${dowOf(date)}, ${dayNum(date)} ${monthName(date)}`;
}

/** Title for the masthead: "Oct 12 – 18", "Tue, 14 October", "October". */
export function viewTitle(view: ChCalView, anchor: string): { main: string; year: string | null } {
  if (view === 'day') return { main: `${dowOf(anchor)}, ${dayNum(anchor)} ${monthName(anchor)}`, year: null };
  if (view === 'week') {
    const [a, , , , , , b] = weekDates(anchor);
    const ma = monthName(a!).slice(0, 3);
    const mb = monthName(b!).slice(0, 3);
    return { main: ma === mb ? `${ma} ${dayNum(a!)} – ${dayNum(b!)}` : `${ma} ${dayNum(a!)} – ${mb} ${dayNum(b!)}`, year: String(yearOf(b!)) };
  }
  return { main: monthName(anchor), year: String(yearOf(anchor)) };
}

/** Players' classes that start in the same half hour, drawn as one block on the Week and Day grids. */
export interface ChClassGroup {
  id: string;
  date: string;
  start: number;
  /** Where the block is drawn to: the next group's start when the two only brush (half an hour or less). */
  end: number;
  /** The last class's end. */
  until: number;
  items: ChCalEvent[];
}

export const isClassGroup = (x: ChCalEvent | ChClassGroup): x is ChClassGroup => 'items' in x;

/**
 * P006 (owner, 2026-10-08: a full roster's class schedules crushed the week into slivers): a day's classes that start
 * in the same half hour fold into one block, earliest start to latest end, listed by player. A class alone in its
 * half hour, and every other event, stays itself, so a one-player filter shows that player's classes as before.
 */
export function groupClasses(events: ChCalEvent[]): Array<ChCalEvent | ChClassGroup> {
  const out: Array<ChCalEvent | ChClassGroup> = [];
  const slots = new Map<string, ChCalEvent[]>();
  for (const e of events) {
    if (e.type !== 'class' || e.allDay || e.start == null || e.end == null) {
      out.push(e);
      continue;
    }
    const key = `${e.date}:${Math.floor(e.start * 2) / 2}`;
    const slot = slots.get(key);
    if (slot) slot.push(e);
    else slots.set(key, [e]);
  }
  // A class alone in its half hour (a player on another timetable) joins the group it overlaps most, so it doesn't
  // lie across two groups as a third block.
  const groups = [...slots.values()].filter((items) => items.length > 1);
  const span = (items: ChCalEvent[]) => [Math.min(...items.map((e) => e.start!)), Math.max(...items.map((e) => e.end!))];
  for (const [key, items] of [...slots]) {
    if (items.length > 1) continue;
    const e = items[0]!;
    let best: ChCalEvent[] | null = null;
    let most = 0;
    for (const g of groups) {
      const [s0, s1] = span(g);
      const shared = Math.min(e.end!, s1!) - Math.max(e.start!, s0!);
      if (shared > most) [best, most] = [g, shared];
    }
    if (best) {
      best.push(e);
      slots.delete(key);
    }
  }
  const made: ChClassGroup[] = [];
  for (const [key, items] of slots) {
    if (items.length === 1) {
      out.push(items[0]!);
      continue;
    }
    items.sort((a, b) => a.start! - b.start! || a.end! - b.end! || a.id.localeCompare(b.id));
    const until = Math.max(...items.map((e) => e.end!));
    made.push({ id: `classes:${key}`, date: items[0]!.date, start: items[0]!.start!, end: until, until, items });
  }
  // Back-to-back groups that only brush (10:00–11:15, then 11:00) stack at full width instead of splitting the column.
  made.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  for (let i = 0; i + 1 < made.length; i += 1) {
    const [a, b] = [made[i]!, made[i + 1]!];
    if (a.date === b.date && b.start < a.end && a.end - b.start <= 0.5 && b.start > a.start) a.end = b.start;
  }
  return [...out, ...made];
}

export interface ChLaid<E> {
  e: E;
  lane: number;
  lanes: number;
}

/** Overlapping timed events split into side-by-side lanes (per cluster). */
export function layoutLanes<E extends { start: number | null; end: number | null }>(events: E[]): Array<ChLaid<E>> {
  const timed = events.filter((e) => e.start != null && e.end != null);
  const s = [...timed].sort((a, b) => a.start! - b.start! || b.end! - a.end!);
  const out: Array<ChLaid<E>> = [];
  let cluster: Array<{ e: E; lane: number }> = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes: number[] = [];
    for (const c of cluster) {
      let i = lanes.findIndex((end) => end <= c.e.start!);
      if (i < 0) {
        i = lanes.length;
        lanes.push(0);
      }
      lanes[i] = c.e.end!;
      c.lane = i;
    }
    for (const c of cluster) out.push({ e: c.e, lane: c.lane, lanes: lanes.length });
    cluster = [];
  };
  for (const e of s) {
    if (cluster.length && e.start! >= clusterEnd) flush();
    cluster.push({ e, lane: 0 });
    clusterEnd = cluster.length === 1 ? e.end! : Math.max(clusterEnd, e.end!);
  }
  if (cluster.length) flush();
  return out;
}

export function rsvpCounts(e: Pick<ChCalEvent, 'people' | 'rsvp'>): Record<ChRsvp, number> {
  const c: Record<ChRsvp, number> = { accepted: 0, maybe: 0, declined: 0, pending: 0 };
  for (const p of e.people) c[e.rsvp[p] ?? 'pending']++;
  return c;
}

/** A player's timed commitments on a date: their classes and the events they haven't declined. A cancelled event holds no time. */
export function busyFor(events: ChCalEvent[], playerId: string, date: string, ignoreId?: string): ChCalEvent[] {
  return events.filter(
    (e) =>
      e.date === date &&
      !e.allDay &&
      !e.cancelled &&
      e.id !== ignoreId &&
      ((e.type === 'class' && e.owner === playerId) || (e.type !== 'class' && e.people.includes(playerId) && e.rsvp[playerId] !== 'declined')),
  );
}

export const overlaps = (a: [number, number], b: [number, number]) => a[0] < b[1] && a[1] > b[0];

/** Every player whose schedule collides with a timed team event (class or another invited event). */
export function findOverlaps(events: ChCalEvent[]): ChCalOverlap[] {
  const out: ChCalOverlap[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === 'class' || e.allDay || e.cancelled || e.start == null || e.end == null) continue;
    for (const pid of e.people) {
      if (e.rsvp[pid] === 'declined') continue;
      for (const b of busyFor(events, pid, e.date, e.id)) {
        if (b.start == null || b.end == null || !overlaps([e.start, e.end], [b.start, b.end])) continue;
        // Report each pair once, on the later-starting event (the one to move); a class doesn't move, so a clash with a
        // class that starts later is reported on the team event (a 3:30 practice over a 4:00 class was missed).
        const [later, earlier] = e.start > b.start || (e.start === b.start && e.id > b.id) ? [e, b] : [b, e];
        const [at, other] = later.type === 'class' ? [earlier, later] : [later, earlier];
        const key = `${at.id}:${other.id}:${pid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: key, eventId: at.id, withId: other.id, who: pid, from: Math.max(e.start, b.start), to: Math.min(e.end, b.end) });
      }
    }
  }
  return out;
}

/**
 * Open windows of `len` hours on a date where none of `people` is busy,
 * between 7 AM and 8 PM on the quarter hour, closest to `near` first (the
 * event's current start), so a suggestion moves the event as little as possible.
 */
export function openTimes(events: ChCalEvent[], people: string[], date: string, len: number, ignoreId?: string, near = 15, max = 3): Array<[number, number]> {
  const busy = people.flatMap((p) => busyFor(events, p, date, ignoreId)).map((b) => [b.start!, b.end!] as [number, number]);
  const free: Array<[number, number]> = [];
  for (let s = 7; s + len <= 20; s += 0.25) {
    const w: [number, number] = [s, s + len];
    if (!busy.some((b) => overlaps(w, b))) free.push(w);
  }
  free.sort((a, b) => Math.abs(a[0] - near) - Math.abs(b[0] - near) || a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const w of free) {
    if (out.length >= max) break;
    if (!out.some((o) => overlaps(o, w))) out.push(w);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Where a new event opens (P006 D3): the first two hours on the date, on the quarter hour, when none of `people` is
 * busy, from now on today (from 9 AM on another day), within 7 AM to 8 PM. Practice every afternoon no longer makes
 * every new event open with the whole team Busy. Late in the day, or on a full day, the first free window of the day;
 * failing that the old 3:30.
 */
export function seedWindow(events: ChCalEvent[], people: string[], date: string, now: { date: string; hour: number }): [number, number] {
  const len = 2;
  const busy = people.flatMap((p) => busyFor(events, p, date)).map((b) => [b.start!, b.end!] as [number, number]);
  const firstFree = (from: number): [number, number] | null => {
    for (let s = Math.max(7, Math.ceil(from * 4) / 4); s + len <= 20; s += 0.25) {
      if (!busy.some((b) => overlaps([s, s + len], b))) return [s, s + len];
    }
    return null;
  };
  return firstFree(date === now.date ? now.hour : 9) ?? firstFree(7) ?? [15.5, 17.5];
}

/**
 * Dates a blocked-time row covers inside [from, to]: one-off spans day by day,
 * and daily or weekly (by weekday) rules expanded, bounded by UNTIL, COUNT and
 * a hard cap. Monthly rules fall back to the first occurrence.
 */
export function expandBusyDates(
  row: { start_date: string; end_date: string },
  rule: { frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly'; weekdays?: number[]; until?: string; count?: number; interval?: number } | null,
  from: string,
  to: string,
): string[] {
  const out: string[] = [];
  if (!rule) {
    for (let d = row.start_date, n = 0; d <= row.end_date && n < 62; d = addDays(d, 1), n++) if (d >= from && d <= to) out.push(d);
    return out;
  }
  // parseRecurrenceRule already returns UNTIL as an inclusive YYYY-MM-DD.
  const last = rule.until ?? null;
  const startDow = new Date(`${row.start_date}T12:00:00Z`).getUTCDay();
  const days = rule.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : rule.weekdays?.length ? rule.weekdays : [startDow];
  const step = rule.frequency === 'biweekly' ? 2 : rule.frequency === 'weekly' ? (rule.interval ?? 1) : 1;
  if (rule.frequency === 'monthly') return row.start_date >= from && row.start_date <= to ? [row.start_date] : [];
  let seen = 0;
  for (let d = row.start_date, n = 0; n < 740; d = addDays(d, 1), n++) {
    if (last && d > last) break;
    if (d > to) break;
    const weeks = Math.floor((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${weekStart(row.start_date)}T12:00:00Z`)) / (7 * 86400000));
    if (!days.includes(new Date(`${d}T12:00:00Z`).getUTCDay()) || weeks % step !== 0) continue;
    seen++;
    if (rule.count && seen > rule.count) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export const hhmmToHour = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) ? (h ?? 0) + (m ?? 0) / 60 : null;
};
