/**
 * P-4 drag and drop: the pure maths behind moving and resizing calendar events (snap, edges, days, spans, clashes,
 * auto-scroll, labels). No React and no DOM: the engines (use-time-drag, use-bar-drag, month-dnd) read the pointer and
 * the grid's rect and hand plain numbers here.
 *
 * Times are decimal hours on the team's wall clock; dates are calendar dates (YYYY-MM-DD). A day move works on dates,
 * never instants, so 4:00 PM stays 4:00 PM across a clock change (the write gives each date its own offset).
 */
import type { ChClock } from '../../lib/clock-cookie';
import { addDays, dayNum, dowOf, fmtHour, rangeLabel, type ChCalEvent, type ChCalPerson } from './model';

/** Where a dragged event would land: its day and decimal hours. */
export interface ChMoveTarget {
  date: string;
  start: number;
  end: number;
}
/** Where a dragged bar (all-day or a timed run over several days) would land: its first and last day. */
export interface ChBarTarget {
  from: string;
  to: string;
}

export const SNAP_H = 0.25;
/** Alt held with a mouse: 5-minute steps. */
export const FINE_SNAP_H = 5 / 60;
export const MIN_LEN_H = 0.25;

const tidy = (h: number) => Math.round(h * 1e6) / 1e6;

export function snapTime(h: number, step = SNAP_H): number {
  return tidy(Math.round(h / step) * step);
}

/** The day column under a client x, from the grid's rect and its hour rail's width. */
export function columnAt(x: number, rect: { left: number; width: number }, rail: number, count: number): number {
  const span = rect.width - rail;
  if (span <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(((x - rect.left - rail) / span) * count)));
}

/**
 * The hour under a client y, measured against the grid's current rect (P-4 changelog: the card follows the grid, so a
 * scroll or an auto-scroll step mid-drag moves the time, never a stale `dy` from the start).
 */
export function hourAt(clientY: number, gridTop: number, hourPx: number, from: number): number {
  return from + (clientY - gridTop) / hourPx;
}

/**
 * A move: the event's start follows the pointer's hour less where in the block it was grabbed (`grabH`, hours below its
 * start), snapped and held inside the grid's hours with its length kept.
 */
export function moveTarget(e: { start: number; end: number }, pointerH: number, grabH: number, bounds: { from: number; to: number }, step = SNAP_H): { start: number; end: number } {
  const len = e.end - e.start;
  const start = Math.min(bounds.to - len, Math.max(bounds.from, snapTime(pointerH - grabH, step)));
  return { start: tidy(start), end: tidy(start + len) };
}

/** A resize: one edge follows the pointer's hour, the other stays; at least 15 minutes; never past 0:00 or 24:00. */
export function resizeTarget(e: { start: number; end: number }, edge: 'start' | 'end', pointerH: number, bounds: { from: number; to: number }, step = SNAP_H): { start: number; end: number } {
  const h = snapTime(pointerH, step);
  if (edge === 'end') return { start: e.start, end: tidy(Math.min(Math.min(24, bounds.to), Math.max(e.start + MIN_LEN_H, h))) };
  return { start: tidy(Math.max(Math.max(0, bounds.from), Math.min(e.end - MIN_LEN_H, h))), end: e.end };
}

/** A calendar date moved by whole days (DST-safe: dates, not instants). */
export function moveAcrossDays(date: string, days: number): string {
  return addDays(date, days);
}
export function moveSpan(span: ChBarTarget, days: number): ChBarTarget {
  return { from: addDays(span.from, days), to: addDays(span.to, days) };
}
/** One end of a span moved by whole days; it keeps at least one day. */
export function resizeSpan(span: ChBarTarget, edge: 'from' | 'to', days: number): ChBarTarget {
  if (edge === 'to') {
    const to = addDays(span.to, days);
    return { from: span.from, to: to < span.from ? span.from : to };
  }
  const from = addDays(span.from, days);
  return { from: from > span.to ? span.to : from, to: span.to };
}

/** The events an invitee of `e` is already at (or in class for) where `e` would land. */
export function clashesAt(e: ChCalEvent, to: ChMoveTarget, events: ChCalEvent[]): Set<string> {
  const who = new Set(e.people);
  return new Set(
    events
      .filter((o) => o.id !== e.id && o.date === to.date && !o.allDay && !o.cancelled && o.start != null && o.end != null && o.start < to.end && to.start < o.end)
      .filter((o) => (o.type === 'class' ? o.owner != null && who.has(o.owner) : o.people.some((p) => who.has(p))))
      .map((o) => o.id),
  );
}

const CLASH_NAME_MAX = 28;
const cut = (s: string) => (s.length > CLASH_NAME_MAX ? `${s.slice(0, CLASH_NAME_MAX).trimEnd()}…` : s);

/**
 * What a landing clashes with, in the pill's second line, and how many of the moved event's players it double-books.
 * Events are named ("Clashes with Team meeting and 1 more"); classes are counted with first names up to two
 * ("2 in class · Priya, Jonah", "4 in class"). Never a list of thirty people.
 */
export function clashSummary(e: ChCalEvent, ids: Set<string>, events: ChCalEvent[], people: Map<string, ChCalPerson>): { line: string | null; players: number } {
  if (ids.size === 0) return { line: null, players: 0 };
  const hit = events.filter((o) => ids.has(o.id));
  const mine = new Set(e.people);
  const booked = new Set<string>();
  for (const o of hit) {
    if (o.type === 'class') {
      if (o.owner && mine.has(o.owner)) booked.add(o.owner);
    } else for (const p of o.people) if (mine.has(p)) booked.add(p);
  }
  const others = hit.filter((o) => o.type !== 'class');
  if (others.length > 0) {
    const more = hit.length - 1;
    return { line: `Clashes with ${cut(others[0]!.title)}${more > 0 ? ` and ${more} more` : ''}`, players: booked.size };
  }
  const owners = [...new Set(hit.map((o) => o.owner).filter((o): o is string => !!o && mine.has(o)))];
  const n = owners.length;
  if (n === 0) return { line: null, players: 0 };
  const first = owners.map((id) => people.get(id)?.name.split(' ')[0]).filter(Boolean);
  return { line: n <= 2 && first.length === n ? `${n} in class · ${first.join(', ')}` : `${n} in class`, players: booked.size };
}

/**
 * Auto-scroll speed in px/s for a pointer `d` px into an edge zone (`zone` px deep): 720 at the edge, easing to 0 at the
 * zone's inner side ((1 - d/zone)^2). P-4 changelog: px per second, so a 120 Hz screen doesn't scroll twice as fast.
 */
export function autoScrollSpeed(d: number, zone: number): number {
  if (zone <= 0) return 0;
  const k = 1 - Math.min(zone, Math.max(0, d)) / zone;
  return 720 * k * k;
}
/** One frame's auto-scroll in px for a frame `dtMs` long (capped at 50 ms, so a stalled frame doesn't lurch). */
export function autoScrollStep(d: number, zone: number, dtMs: number): number {
  return (autoScrollSpeed(d, zone) * Math.min(50, Math.max(0, dtMs))) / 1000;
}

/** "15 min", "1 hr", "1 hr 15 min", "2 hr 30 min". */
export function durationLabel(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * What a viewer can drag: a coach's own team event they can edit, not cancelled, not a class or busy time, and not a
 * tournament round whose lineup is locked (P-5, OC-11 default: no lift). One day's timed event drags in time; an
 * all-day event or a timed run over several days drags as a bar, by whole days. Series are included (the drop asks
 * "This event" or "This and following").
 */
export function draggable(e: ChCalEvent, coach: boolean): 'timed' | 'bar' | null {
  if (!coach || !e.canEdit || e.cancelled || e.type === 'class' || e.type === 'busy') return null;
  if (e.round?.lockedAt) return null;
  if (e.allDay || (e.span && e.span.from !== e.span.to)) return 'bar';
  return e.start != null && e.end != null ? 'timed' : null;
}

/** The scopes a series drop offers: both on a time change; only "This event" when the day changed (BYDAY drift). */
export function seriesScopes(e: Pick<ChCalEvent, 'seriesId'>, from: { date: string }, to: { date: string }): Array<'this' | 'thisAndFuture'> {
  if (!e.seriesId) return [];
  return to.date === from.date ? ['this', 'thisAndFuture'] : ['this'];
}

/** The pill's first line for a move: "4:00 – 6:00 PM", or with the day when it changed, "Wed 15 · 4:00 – 6:00 PM". */
export function movePill(from: { date: string }, to: ChMoveTarget, clock: ChClock): string {
  const range = rangeLabel({ allDay: false, start: to.start, end: to.end }, clock);
  return to.date === from.date ? range : `${dowOf(to.date)} ${dayNum(to.date)} · ${range}`;
}
/** The pill's first line for a resize: "Ends 6:30 PM · 3 hr" or "Starts 3:00 PM · 2 hr 30 min". */
export function resizePill(edge: 'start' | 'end', to: { start: number; end: number }, clock: ChClock): string {
  const len = durationLabel(to.end - to.start);
  return edge === 'end' ? `Ends ${fmtHour(to.end, true, clock)} · ${len}` : `Starts ${fmtHour(to.start, true, clock)} · ${len}`;
}
/** "Fri 17 – Sun 19", or one day "Fri 17". */
export function barPill(to: ChBarTarget): string {
  const a = `${dowOf(to.from)} ${dayNum(to.from)}`;
  return to.from === to.to ? a : `${a} – ${dowOf(to.to)} ${dayNum(to.to)}`;
}

/** Whole days from `a` to `b` (calendar dates). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
}

/** An all-day event or a timed run over several days: what drags as a bar (P-4 4.5). */
export function isBar(e: Pick<ChCalEvent, 'allDay' | 'span'>): boolean {
  return e.allDay || (!!e.span && e.span.from !== e.span.to);
}

/** A bar's whole span as it stands: its first and last day. */
export function barSpan(e: Pick<ChCalEvent, 'date' | 'span'>): ChBarTarget {
  return e.span ? { from: e.span.from, to: e.span.to } : { from: e.date, to: e.date };
}

/**
 * The day entries of an event moved or stretched to `to`, the way the loader lays them out: an all-day event is one
 * entry a day; a timed run keeps its first day's start and last day's end (its start to midnight, whole days, midnight
 * to its end), and a run that now fits one day is one timed entry.
 */
export function respan(tpl: ChCalEvent, to: ChBarTarget): ChCalEvent[] {
  const n = daysBetween(to.from, to.to);
  const out: ChCalEvent[] = [];
  if (tpl.allDay) {
    const span = n === 0 ? null : { from: to.from, to: to.to };
    for (let i = 0; i <= n; i++) out.push({ ...tpl, date: addDays(to.from, i), start: null, end: null, allDay: true, span });
    return out;
  }
  const s = tpl.span?.start ?? tpl.start ?? 0;
  const e = tpl.span?.end ?? tpl.end ?? 24;
  if (n === 0) return [{ ...tpl, date: to.from, start: s, end: Math.max(e, s + MIN_LEN_H), allDay: false, span: null }];
  const span = { from: to.from, to: to.to, start: s, end: e };
  for (let i = 0; i <= n; i++) {
    const d = addDays(to.from, i);
    out.push({ ...tpl, date: d, start: i === 0 ? s : 0, end: i === n ? e : 24, allDay: false, span });
  }
  return out;
}

/** The week lane's bars: one per event over the days shown, clipped at the week's edges, stacked longest first. */
export interface ChLaneBar {
  e: ChCalEvent;
  span: ChBarTarget;
  c0: number;
  c1: number;
  row: number;
  clipStart: boolean;
  clipEnd: boolean;
}
export function laneBars(events: ChCalEvent[], dates: string[]): ChLaneBar[] {
  if (dates.length === 0) return [];
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const seen = new Map<string, ChCalEvent>();
  for (const e of events) if (isBar(e) && !seen.has(e.id)) seen.set(e.id, e);
  const items = [...seen.values()]
    .map((e) => ({ e, span: barSpan(e) }))
    .filter(({ span }) => span.to >= first && span.from <= last)
    .map(({ e, span }) => ({ e, span, c0: Math.max(0, daysBetween(first, span.from)), c1: Math.min(dates.length - 1, daysBetween(first, span.to)), clipStart: span.from < first, clipEnd: span.to > last }))
    .sort((a, b) => a.c0 - b.c0 || b.c1 - b.c0 - (a.c1 - a.c0) || a.e.title.localeCompare(b.e.title));
  const rows: number[] = [];
  return items.map((it) => {
    let row = rows.findIndex((end) => end < it.c0);
    if (row < 0) row = rows.length;
    rows[row] = it.c1;
    return { ...it, row };
  });
}
