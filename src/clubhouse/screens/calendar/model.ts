import { sunTimes, type LatLng } from '../../lib/sun';

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
   * The coach asked for replies (golf_events.requires_rsvp; owner, 2026-10-08: off unless the coach turns it on). Off,
   * the event shows who is on it but never a reply count, a pending reply, a Nudge or the player's Going / Maybe / Can't.
   */
  requiresRsvp: boolean;
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
  /** Multi-day all-day events: the whole span, repeated on each day's entry. */
  span: { from: string; to: string } | null;
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
export function focusHour(dates: string[], events: Array<{ date: string; allDay?: boolean; start: number | null }>, now: { date: string; hour: number }): number | null {
  if (dates.includes(now.date)) return now.hour;
  const timed = events.filter((e) => !e.allDay && e.start != null && dates.includes(e.date)).sort((a, b) => a.date.localeCompare(b.date) || a.start! - b.start!);
  const ahead = timed.find((e) => e.date > now.date || (e.date === now.date && e.start! >= now.hour));
  return (ahead ?? timed[0])?.start ?? null;
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

/** "3:30 PM", or "3:30" without the meridiem. */
export function fmtHour(h: number, meridiem = true): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')}${meridiem ? (hh < 12 ? ' AM' : ' PM') : ''}`;
}

export function rangeLabel(e: Pick<ChCalEvent, 'allDay' | 'start' | 'end'>): string {
  if (e.allDay || e.start == null || e.end == null) return 'All day';
  const sameHalf = e.start < 12 === e.end < 12;
  return `${fmtHour(e.start, !sameHalf)} – ${fmtHour(e.end)}`;
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

/** A coach's overlapping class meetings on one day, folded into one block (owner, 2026-10-08). */
export interface ChClassCluster<E> {
  /** Stable for the day: the date and the first meeting's id. */
  id: string;
  date: string;
  start: number;
  end: number;
  /** The meetings, by start time. */
  classes: E[];
  /** Players in class across the span; a meeting whose owner didn't resolve counts on its own. */
  players: number;
}

type Clusterable = { id: string; type: ChCalType; date: string; owner: string | null; allDay: boolean; start: number | null; end: number | null };

/**
 * The coach's grid (owner, 2026-10-08): nine players' synced classes cascaded into slivers about 8px wide that nobody
 * could read. Timed class meetings that overlap, directly or through one another, fold into one cluster per day; a class
 * that overlaps no other class stays its own block, so a coach looking at one player still sees that player's classes.
 * Team events, busy time and all-day rows pass through in `rest`, untouched and in their order.
 */
export function clusterClasses<E extends Clusterable>(events: E[]): { rest: E[]; clusters: Array<ChClassCluster<E>> } {
  const timedClass = (e: E) => e.type === 'class' && !e.allDay && e.start != null && e.end != null;
  const byDay = new Map<string, E[]>();
  for (const e of events) if (timedClass(e)) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const single = new Set<E>();
  const clusters: Array<ChClassCluster<E>> = [];
  for (const [date, list] of byDay) {
    const sorted = [...list].sort((a, b) => a.start! - b.start! || a.end! - b.end! || a.id.localeCompare(b.id));
    let group: E[] = [];
    let end = -Infinity;
    const flush = () => {
      if (group.length === 1) single.add(group[0]!);
      else if (group.length > 1) {
        clusters.push({ id: `classes:${date}:${group[0]!.id}`, date, start: group[0]!.start!, end, classes: group, players: new Set(group.map((g) => g.owner ?? `?${g.id}`)).size });
      }
      group = [];
    };
    for (const e of sorted) {
      // Back to back is not an overlap: a class that starts as another ends begins a new cluster.
      if (group.length && e.start! >= end) flush();
      end = group.length ? Math.max(end, e.end!) : e.end!;
      group.push(e);
    }
    flush();
  }
  return { rest: events.filter((e) => !timedClass(e) || single.has(e)), clusters };
}

/** "5 in class", the cluster's name on the grid and on the phone's day. */
export const clusterLabel = (c: Pick<ChClassCluster<unknown>, 'players'>) => `${c.players} in class`;

export function rsvpCounts(e: Pick<ChCalEvent, 'people' | 'rsvp'>): Record<ChRsvp, number> {
  const c: Record<ChRsvp, number> = { accepted: 0, maybe: 0, declined: 0, pending: 0 };
  for (const p of e.people) c[e.rsvp[p] ?? 'pending']++;
  return c;
}

/**
 * Invitees who haven't replied to an event that asked for replies. An event that didn't ask (requires_rsvp off, the
 * default) has no one pending, whatever its attendance rows say: it never reads "12 replies pending" (owner, 2026-10-08).
 */
export function awaitingReply(e: Pick<ChCalEvent, 'people' | 'rsvp' | 'requiresRsvp'>): string[] {
  return e.requiresRsvp ? e.people.filter((p) => (e.rsvp[p] ?? 'pending') === 'pending') : [];
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
        // Report each pair once, on the later-starting event (the one to move).
        const [later, earlier] = e.start > b.start || (e.start === b.start && e.id > b.id) ? [e, b] : [b, e];
        if (later.type === 'class') continue;
        const key = `${later.id}:${earlier.id}:${pid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ id: key, eventId: later.id, withId: earlier.id, who: pid, from: Math.max(e.start, b.start), to: Math.min(e.end, b.end) });
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
