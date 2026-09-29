/**
 * Calendar view model. The loader resolves every time into the team's
 * timezone on the server, so the client only works with calendar dates
 * (YYYY-MM-DD) and decimal hours: no Date math in the browser's zone.
 */

export type ChCalType = 'practice' | 'qualifier' | 'tournament' | 'meeting' | 'travel' | 'class' | 'other';
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

export const TYPE_LABEL: Record<ChCalType, string> = {
  practice: 'Practice',
  qualifier: 'Qualifier',
  tournament: 'Tournament',
  meeting: 'Meeting',
  travel: 'Travel',
  class: 'Class',
  other: 'Event',
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

export function rsvpCounts(e: Pick<ChCalEvent, 'people' | 'rsvp'>): Record<ChRsvp, number> {
  const c: Record<ChRsvp, number> = { accepted: 0, maybe: 0, declined: 0, pending: 0 };
  for (const p of e.people) c[e.rsvp[p] ?? 'pending']++;
  return c;
}

/** A player's timed commitments on a date: their classes and the events they haven't declined. */
export function busyFor(events: ChCalEvent[], playerId: string, date: string, ignoreId?: string): ChCalEvent[] {
  return events.filter(
    (e) =>
      e.date === date &&
      !e.allDay &&
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
    if (e.type === 'class' || e.allDay || e.start == null || e.end == null) continue;
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
