import { isClassEvent } from '@/lib/calendar/class-events';
import { inferTermForImport, parseSemesterDates } from '@/lib/golf/semester';
import type { ParsedClass } from '@/lib/utils/schedule-parser';

/**
 * The Classes page's data shapes and the pure steps that build them, kept apart
 * from the server loader (data/classes.ts) so the screen, the preview and the
 * tests run the same code the page does. Nothing here reads a clock or a
 * database: "today" is always passed in, resolved in the team's time zone.
 */

/** Day tokens as `golf_player_classes.days` stores them (the importer and the form write the same five, and Sa and Su from an import). */
export const CH_DAYS = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'] as const;
/** The days the form offers. A class saved on Sa or Su from an import keeps them. */
export const CH_WEEKDAYS = ['M', 'T', 'W', 'Th', 'F'] as const;
export const DAY_SHORT: Record<string, string> = { M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sa: 'Sat', Su: 'Sun' };
export const DAY_LONG: Record<string, string> = { M: 'Monday', T: 'Tuesday', W: 'Wednesday', Th: 'Thursday', F: 'Friday', Sa: 'Saturday', Su: 'Sunday' };
/** The one-letter mark on the week strip. */
export const DAY_LETTER: Record<string, string> = { M: 'M', T: 'T', W: 'W', Th: 'T', F: 'F', Sa: 'S', Su: 'S' };
/** getUTCDay() (0 is Sunday) to a day token. */
const TOKEN_OF_DOW = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'] as const;

/** The five muted class tones of the board (`.t-mist` and the rest); a stored `color` is a free hex, so it is never drawn. */
export type ChTone = 'mist' | 'clay' | 'sand' | 'stone' | 'sage';
export const CH_TONES: readonly ChTone[] = ['mist', 'clay', 'sand', 'stone', 'sage'];

export interface ChClassRow {
  id: string;
  class_name: string;
  instructor: string | null;
  days: string[] | null;
  start_time: string | null;
  end_time: string | null;
  building: string | null;
  room: string | null;
  credits: number | null;
  color: string | null;
  notes: string | null;
  semester: string | null;
  created_at: string | null;
}

export interface ChClass {
  id: string;
  /** "STAT 201"; empty when the stored name carries no course code. */
  code: string;
  name: string;
  instructor: string | null;
  /** Stored day tokens, in week order. Unknown tokens are kept as they are. */
  days: string[];
  /** "HH:MM" wall-clock, or null when no time is set. */
  start: string | null;
  end: string | null;
  building: string | null;
  room: string | null;
  /** "Hanes Hall 120", or null. */
  location: string | null;
  credits: number | null;
  /** Academic term ("Fall 2026"), or null on a row saved before the column was filled. */
  semester: string | null;
  /** The stored hex. Kept only so an edit writes it back; the screen draws `tone`. */
  color: string | null;
  notes: string | null;
  tone: ChTone;
  /** Newest last; the tone follows this order. */
  createdAt: string | null;
}

// ---------------------------------------------------------------------------
// Names, days and times
// ---------------------------------------------------------------------------

/** A course code the way registrars print one: "STAT 201", "CS-101", "COMP 110.001", "ENGL 105W". */
const CODE_RE = /^[A-Za-z&]{2,10}[\s.-]?\d{1,4}[A-Za-z.\d]{0,6}$/;

/** `class_name` is stored as "CODE - Name". A name with no code-shaped first part is all name. */
export function parseClassName(className: string): { code: string; name: string } {
  const at = className.indexOf(' - ');
  if (at > 0) {
    const head = className.slice(0, at).trim();
    const tail = className.slice(at + 3).trim();
    if (CODE_RE.test(head) && tail) return { code: head, name: tail };
  }
  return { code: '', name: className.trim() };
}

/** What is stored: "CODE - Name", or the name alone. */
export const classNameOf = (code: string, name: string) => (code.trim() ? `${code.trim()} - ${name.trim()}` : name.trim());

/** The tab's two lines: the department and the number ("STAT" over "201"), or the name's first letters. */
export function tabParts(c: Pick<ChClass, 'code' | 'name'>): { top: string; bottom: string } {
  const m = /^([A-Za-z&]+)[\s.-]*(.*)$/.exec(c.code.trim());
  if (m) return { top: m[1]!, bottom: m[2]! };
  return { top: c.name.trim().slice(0, 4), bottom: '' };
}

/** Days in week order, unknown tokens last. */
export const sortDays = (days: readonly string[]) =>
  [...new Set(days)].sort((a, b) => {
    const ia = CH_DAYS.indexOf(a as (typeof CH_DAYS)[number]);
    const ib = CH_DAYS.indexOf(b as (typeof CH_DAYS)[number]);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

/** "09:00", "9:00" or "09:00:00" to minutes after midnight; null for anything else. */
export function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/** "HH:MM" from stored time, or null. */
export const toHHMM = (t: string | null | undefined): string | null => {
  const m = toMinutes(t);
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const meridiem = (min: number) => (min < 720 ? 'AM' : 'PM');
const clock = (min: number) => `${((Math.floor(min / 60) + 11) % 12) + 1}:${String(min % 60).padStart(2, '0')}`;

/** "9:00", the clock without AM or PM (the week strip's start under a day). */
export const clockLabel = (t: string | null | undefined): string | null => {
  const m = toMinutes(t);
  return m == null ? null : clock(m);
};

/** "9:00 AM". */
export const timeLabel = (t: string | null | undefined): string | null => {
  const m = toMinutes(t);
  return m == null ? null : `${clock(m)} ${meridiem(m)}`;
};

/** "9:00–10:15 AM", or "11:30 AM–12:45 PM" when the two sit either side of noon; a lone start is "9:00 AM". */
export function timeRange(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s == null) return null;
  if (e == null) return `${clock(s)} ${meridiem(s)}`;
  return meridiem(s) === meridiem(e) ? `${clock(s)}–${clock(e)} ${meridiem(e)}` : `${clock(s)} ${meridiem(s)}–${clock(e)} ${meridiem(e)}`;
}

/** "Tue, Thu" (in week order). */
export const daysLabel = (days: readonly string[]) =>
  sortDays(days)
    .map((d) => DAY_SHORT[d] ?? d)
    .join(', ');

/** A calendar date (yyyy-mm-dd) as a Date at noon UTC, so no zone moves it a day. */
export const dateOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`);
export const addDays = (iso: string, n: number) => new Date(dateOf(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);
export const dayToken = (iso: string): string => TOKEN_OF_DOW[dateOf(iso).getUTCDay()]!;
const fmtDate = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o });
/** "Oct 14". */
export const shortDay = (iso: string) => fmtDate({ month: 'short', day: 'numeric' }).format(dateOf(iso));
/** "Tue, Oct 14". */
export const longDay = (iso: string) => fmtDate({ weekday: 'short', month: 'short', day: 'numeric' }).format(dateOf(iso));

// ---------------------------------------------------------------------------
// Rows to classes
// ---------------------------------------------------------------------------

/** Order of the week: first meeting of the week, then name; classes with no fixed meeting last. */
function meetingKey(c: Pick<ChClass, 'days' | 'start'>): number {
  const start = toMinutes(c.start);
  if (!c.days.length || start == null) return Number.MAX_SAFE_INTEGER;
  const day = Math.min(...c.days.map((d) => (CH_DAYS.indexOf(d as (typeof CH_DAYS)[number]) === -1 ? CH_DAYS.length : CH_DAYS.indexOf(d as (typeof CH_DAYS)[number]))));
  return day * 1440 + start;
}

export function toChClass(row: ChClassRow, tone: ChTone): ChClass {
  const { code, name } = parseClassName(row.class_name);
  const building = row.building?.trim() || null;
  const room = row.room?.trim() || null;
  return {
    id: row.id,
    code,
    name,
    instructor: row.instructor?.trim() || null,
    days: sortDays(Array.isArray(row.days) ? row.days : []),
    start: toHHMM(row.start_time),
    end: toHHMM(row.end_time),
    building,
    room,
    location: [building, room].filter(Boolean).join(' ') || null,
    credits: row.credits,
    semester: row.semester?.trim() || null,
    color: row.color,
    notes: row.notes?.trim() || null,
    tone,
    createdAt: row.created_at,
  };
}

/**
 * Every class, in the order the week unfolds. The tone follows the order the
 * classes were added, so it is the same on every visit and never repeats among
 * neighbours until a sixth class.
 */
export function orderClasses(list: ChClass[]): ChClass[] {
  const byAdded = [...list].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id));
  const tone = new Map(byAdded.map((c, i) => [c.id, CH_TONES[i % CH_TONES.length]!]));
  return list.map((c) => ({ ...c, tone: tone.get(c.id)! })).sort((a, b) => meetingKey(a) - meetingKey(b) || `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`));
}

export const toChClasses = (rows: ChClassRow[]): ChClass[] => orderClasses(rows.map((r) => toChClass(r, 'mist')));

/** A class with times but no days never reaches the calendar (legacy roster note). */
export const hasNoDays = (c: Pick<ChClass, 'days' | 'start'>) => c.days.length === 0 && c.start != null;
/** A start and an end time, both readable. */
export const hasTime = (c: Pick<ChClass, 'start' | 'end'>) => toMinutes(c.start) != null && toMinutes(c.end) != null;
/** Days but no start or no end. The server would fill in 08:00 to 09:00, so such a class is kept off the calendar instead (writes.ts). */
export const hasNoTime = (c: Pick<ChClass, 'days' | 'start' | 'end'>) => c.days.length > 0 && !hasTime(c);
/** No fixed meeting: online, arranged, or not set, and so a class with days but no start or no end. */
export const isFlexible = (c: Pick<ChClass, 'days' | 'start' | 'end'>) => c.days.length === 0 || !hasTime(c);

/** Why a class has nothing to put on the calendar, when it is not a failed sync: no meeting days, or days but no time. */
export type ChCalendarGap = 'days' | 'time';
export function calendarGap(c: Pick<ChClass, 'days' | 'start' | 'end'>): ChCalendarGap | null {
  if (c.days.length === 0) return 'days';
  return hasTime(c) ? null : 'time';
}
/** The gap in words, for "PHIL 150 (no meeting days)". */
export const gapReason = (g: ChCalendarGap) => (g === 'days' ? 'no meeting days' : 'no time set');
/** "A, B and C". */
export const joinList = (items: readonly string[]) => new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(items);

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

export interface ChTerm {
  /** "Fall 2026". */
  label: string;
  /** Inclusive first and last day of the term window (`parseSemesterDates`, the window the calendar sync uses). */
  start: string;
  end: string;
  /** The week of the term today falls in (1-based), or null before it starts. */
  week: number | null;
  weeks: number;
  /** Days until the term starts, when it hasn't. */
  startsIn: number | null;
  /** How far through the term today is, 0 to 1. */
  progress: number;
}

const DAY_MS = 86_400_000;

/** The academic term in progress on `todayIso`, or the next one to begin. Same rule the importer uses. */
export function termOn(todayIso: string): ChTerm | null {
  const label = inferTermForImport(todayIso);
  const window = label ? parseSemesterDates(label) : null;
  if (!label || !window) return null;
  const span = dateOf(window.end).getTime() - dateOf(window.start).getTime();
  const sinceStart = Math.round((dateOf(todayIso).getTime() - dateOf(window.start).getTime()) / DAY_MS);
  const weeks = Math.ceil((span / DAY_MS + 1) / 7);
  return {
    label,
    start: window.start,
    end: window.end,
    week: sinceStart < 0 ? null : Math.min(weeks, Math.floor(sinceStart / 7) + 1),
    weeks,
    startsIn: sinceStart < 0 ? -sinceStart : null,
    progress: span <= 0 ? 0 : Math.max(0, Math.min(1, (dateOf(todayIso).getTime() - dateOf(window.start).getTime()) / span)),
  };
}

export const sameTerm = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/** In the term named `label`. A class saved with no term is in `current`, the legacy rows read as the current term as the calendar sync does. */
export const inTermLabel = (c: Pick<ChClass, 'semester'>, label: string, current: string) => sameTerm(c.semester || current, label);

/** In this term, or saved with no term. */
export const inTerm = (c: Pick<ChClass, 'semester'>, term: Pick<ChTerm, 'label'>) => inTermLabel(c, term.label, term.label);

/** The last day of a class's own term (the calendar sync's window for it), or the current term's end when its label can't be read. */
export const termEnd = (semester: string | null, term: Pick<ChTerm, 'label' | 'end'>) => parseSemesterDates(semester || term.label)?.end ?? term.end;

/**
 * The first day to put a class on the calendar from, or undefined for the term's whole window. Like the current importer it is the Monday
 * after today, so a schedule read mid-term doesn't fill the calendar with meetings already held. But the sync takes a start only inside
 * the class's own term, and re-derives another term when the start leaves the label under 21 days (semester.ts), so it is offered only when
 * the window it gives is the class's own: a class in next term, one imported before its term begins, or one in the last weeks of a term
 * gets no start, and the sync uses the term's window.
 */
export function syncStartFor(semester: string | null, current: string, todayIso: string): string | undefined {
  const label = semester || current;
  const own = parseSemesterDates(label);
  if (!own) return undefined;
  const start = nextMonday(todayIso);
  if (start < own.start || start > own.end) return undefined;
  const used = parseSemesterDates(label, start);
  return used && used.start === start && used.end === own.end ? start : undefined;
}

const TERM_NAMES = ['Spring', 'Summer', 'Fall', 'Winter'] as const;

/** The term picker: the one before the current term, the current one and the next three, plus the class's own if it is none of them. */
export function termOptions(current: string, keep?: string | null): string[] {
  const m = /^(Spring|Summer|Fall|Winter)\s+(\d{4})$/i.exec(current.trim());
  const out: string[] = [];
  if (m) {
    const at = TERM_NAMES.findIndex((t) => t.toLowerCase() === m[1]!.toLowerCase());
    const abs = Number(m[2]) * 4 + at;
    for (let o = -1; o <= 3; o++) {
      const a = abs + o;
      out.push(`${TERM_NAMES[((a % 4) + 4) % 4]} ${Math.floor(a / 4)}`);
    }
  } else if (current.trim()) out.push(current.trim());
  const own = keep?.trim();
  if (own && !out.some((t) => sameTerm(t, own))) out.push(own);
  return out;
}

// ---------------------------------------------------------------------------
// Overlaps with the team's week
// ---------------------------------------------------------------------------

/** A team event (never a class) as wall-clock date and minutes in the team's zone. */
export interface ChTeamEvent {
  id: string;
  title: string;
  /** practice, travel, qualifier, tournament, meeting or other. */
  type: string;
  startDate: string;
  startMin: number;
  endDate: string;
  endMin: number;
  allDay: boolean;
  where: string | null;
}

export interface ChWeek {
  /** Monday to Sunday of the week that holds today. */
  dates: string[];
  /** The team's events that touch those days, cancelled ones and classes left out. */
  events: ChTeamEvent[];
  /** The events didn't load: overlaps are unknown, never "none". */
  error: boolean;
}

export interface ChConflict {
  classId: string;
  date: string;
  event: ChTeamEvent;
}

export type ChEventRow = {
  id: string;
  title: string;
  event_type: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean | null;
  status: string | null;
  location: string | null;
  description: string | null;
};

/** Wall-clock date and minutes of an instant in a zone. */
export function zonedParts(iso: string, timeZone: string): { date: string; minutes: number } {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)))
    p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/**
 * A `golf_events` row as a team event, or null when it isn't one a class can
 * overlap: a class meeting (never the player's own schedule against itself) or
 * a cancelled event. All-day rows are stored as UTC-midnight dates, so their
 * date part is read as it is and never zoned (the calendar does the same).
 */
export function toTeamEvent(r: ChEventRow, timeZone: string): ChTeamEvent | null {
  if (isClassEvent(r) || r.status === 'cancelled') return null;
  const base = { id: r.id, title: r.title, type: r.event_type, where: r.location?.trim() || null };
  if (r.all_day) {
    const s = r.start_time.slice(0, 10);
    return { ...base, startDate: s, startMin: 0, endDate: (r.end_time ?? r.start_time).slice(0, 10), endMin: 1440, allDay: true };
  }
  const a = zonedParts(r.start_time, timeZone);
  const b = r.end_time ? zonedParts(r.end_time, timeZone) : a;
  return { ...base, startDate: a.date, startMin: a.minutes, endDate: b.date, endMin: b.minutes, allDay: false };
}

/** Monday to Sunday of the week that holds `todayIso`. */
export function weekDates(todayIso: string): string[] {
  const back = (dateOf(todayIso).getUTCDay() + 6) % 7;
  const monday = addDays(todayIso, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The minutes an event occupies on one day, or null when it doesn't touch it. A multi-day trip fills the days between its ends. */
export function eventWindowOn(e: ChTeamEvent, date: string): [number, number] | null {
  if (date < e.startDate || date > e.endDate) return null;
  if (e.allDay) return [0, 1440];
  const s = date === e.startDate ? e.startMin : 0;
  const en = date === e.endDate ? e.endMin : 1440;
  // No end (or one at the start): an hour, the shortest event the calendar draws.
  return en > s ? [s, en] : [s, Math.min(1440, s + 60)];
}

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** When an event occupies `date`: "3:30–5:30 PM", "All day", or "From 6:15 AM" for a trip that carries on past midnight. */
export function eventWhen(e: ChTeamEvent, date: string): string {
  const w = eventWindowOn(e, date);
  if (!w) return '';
  if (w[0] === 0 && w[1] === 1440) return 'All day';
  if (w[1] === 1440) return `From ${timeLabel(hhmm(w[0]))}`;
  return timeRange(hhmm(w[0]), hhmm(w[1])) ?? '';
}

type Meeting = Pick<ChClass, 'id' | 'days' | 'start' | 'end'>;

/** Each time a class meets during `dates` that a team event overlaps. Classes with no days or no times can't overlap anything. */
export function conflictsOf(classes: readonly Meeting[], events: readonly ChTeamEvent[], dates: readonly string[]): ChConflict[] {
  const out: ChConflict[] = [];
  for (const c of classes) {
    const s = toMinutes(c.start);
    const e = toMinutes(c.end);
    if (s == null || e == null || e <= s) continue;
    for (const date of dates) {
      if (!c.days.includes(dayToken(date))) continue;
      for (const ev of events) {
        const w = eventWindowOn(ev, date);
        if (w && w[0] < e && s < w[1]) out.push({ classId: c.id, date, event: ev });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.event.startMin - b.event.startMin || a.classId.localeCompare(b.classId));
}

export interface ChConflictGroup {
  key: string;
  date: string;
  event: ChTeamEvent;
  classes: ChClass[];
}

/** The overlaps grouped by team event and day, for the side card: "Practice on Mon overlaps STAT 201 and ECON 310". */
export function groupConflicts(conflicts: readonly ChConflict[], classes: readonly ChClass[]): ChConflictGroup[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const groups = new Map<string, ChConflictGroup>();
  for (const x of conflicts) {
    const c = byId.get(x.classId);
    if (!c) continue;
    const key = `${x.event.id}|${x.date}`;
    const g = groups.get(key) ?? { key, date: x.date, event: x.event, classes: [] };
    g.classes.push(c);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.date.localeCompare(b.date) || a.event.startMin - b.event.startMin);
}

/** "Practice", "Pinehurst qualifier": the title, which already says what it is. */
export const eventLabel = (e: ChTeamEvent) => e.title.trim() || (e.type ? e.type.charAt(0).toUpperCase() + e.type.slice(1) : 'Team event');

/** What the class card's flag says about this week: "Overlaps Practice Mon", or a count when there are several. */
export function conflictFlag(mine: readonly ChConflict[]): string | null {
  if (!mine.length) return null;
  const first = mine[0]!;
  return mine.length === 1 ? `Overlaps ${eventLabel(first.event)} ${DAY_SHORT[dayToken(first.date)]}` : `Overlaps ${mine.length} team events`;
}

/** Classes that meet at overlapping times on a shared day: the form's "This overlaps STAT 201". */
export function overlapsAmong(draft: Meeting, others: readonly ChClass[]): Array<{ other: ChClass; days: string[]; exact: boolean }> {
  const s = toMinutes(draft.start);
  const e = toMinutes(draft.end);
  if (s == null || e == null || e <= s || !draft.days.length) return [];
  const out: Array<{ other: ChClass; days: string[]; exact: boolean }> = [];
  for (const o of others) {
    if (o.id === draft.id) continue;
    const os = toMinutes(o.start);
    const oe = toMinutes(o.end);
    if (os == null || oe == null) continue;
    const shared = draft.days.filter((d) => o.days.includes(d));
    if (!shared.length || !(s < oe && os < e)) continue;
    const exact = os === s && oe === e && sortDays(draft.days).join() === sortDays(o.days).join();
    out.push({ other: o, days: sortDays(shared), exact });
  }
  return out;
}

/** The next meetings of a class from `todayIso` through the end of the term, at most `n`. Pass the later of today and the term's first day, so a class in next term starts where it does. */
export function upcomingMeetings(c: Pick<ChClass, 'days' | 'start'>, todayIso: string, endIso: string, n: number): string[] {
  if (!c.days.length || c.start == null) return [];
  const out: string[] = [];
  for (let d = todayIso; d <= endIso && out.length < n && d <= addDays(todayIso, 400); d = addDays(d, 1)) if (c.days.includes(dayToken(d))) out.push(d);
  return out;
}

/** The Monday after `todayIso` (a Monday is the next one, a week on): the importer's default first day, offered per class by `syncStartFor`. */
export function nextMonday(todayIso: string): string {
  const dow = dateOf(todayIso).getUTCDay();
  return addDays(todayIso, (1 + 7 - dow) % 7 || 7);
}

// ---------------------------------------------------------------------------
// The form and the importer
// ---------------------------------------------------------------------------

/** What the add and edit form hands to a save. Text is trimmed at the save, times are "" or "HH:MM". */
export interface ChClassInput {
  code: string;
  name: string;
  instructor: string;
  /** Every day the class meets, Sa and Su included. */
  days: string[];
  start: string;
  end: string;
  building: string;
  room: string;
  credits: number | null;
  semester: string;
  notes: string;
}

export function inputOf(c: ChClass): ChClassInput {
  return {
    code: c.code,
    name: c.name,
    instructor: c.instructor ?? '',
    days: c.days,
    start: c.start ?? '',
    end: c.end ?? '',
    building: c.building ?? '',
    room: c.room ?? '',
    credits: c.credits,
    semester: c.semester ?? '',
    notes: c.notes ?? '',
  };
}

/** The form's state: what was typed. Credits stay text until it is checked. */
export type ChClassDraft = Omit<ChClassInput, 'credits'> & { credits: string };

/** A class row saved before the term column was filled is edited in the current term, as the current page does and as the calendar sync reads it. */
export const draftOf = (c: ChClass | null, term: string): ChClassDraft =>
  c
    ? { ...inputOf(c), semester: c.semester || term, credits: c.credits == null ? '' : String(c.credits) }
    : { code: '', name: '', instructor: '', days: [], start: '', end: '', building: '', room: '', credits: '', semester: term, notes: '' };

/** Credits is a whole number (the column is an integer); blank means not set. */
export function parseCredits(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.trim();
  if (!t) return { ok: true, value: null };
  return /^\d{1,2}$/.test(t) && Number(t) <= 12 ? { ok: true, value: Number(t) } : { ok: false };
}

export const inputFromDraft = (d: ChClassDraft): ChClassInput => {
  const credits = parseCredits(d.credits);
  return {
    ...d,
    code: d.code.trim(),
    name: d.name.trim(),
    instructor: d.instructor.trim(),
    building: d.building.trim(),
    room: d.room.trim(),
    semester: d.semester.trim(),
    notes: d.notes.trim(),
    days: sortDays(d.days),
    credits: credits.ok ? credits.value : null,
  };
};

export type ChFormField = 'code' | 'name' | 'semester' | 'time' | 'credits' | 'duplicate';
export interface ChFormIssue {
  field: ChFormField;
  /** Catalog number (docs/clubhouse/catalog/classes.md). */
  code: string;
  message: string;
}

/**
 * What stops a save, in the order the form reads. The current form required a
 * code, a name and a term, and blocked a class that meets at exactly the same
 * days and times as another; the rest keep a bad time from reaching the calendar
 * sync. Only a class in the draft's own term counts as the same (a class from
 * last spring meets no one this fall); `currentTerm` is the term a class saved with
 * no term is read as, and when it is left out those classes count as in the
 * draft's term.
 */
export function checkDraft(d: ChClassDraft, others: readonly ChClass[], editingId: string | null, currentTerm?: string): ChFormIssue[] {
  const issues: ChFormIssue[] = [];
  if (!d.code.trim()) issues.push({ field: 'code', code: 'CH-12101', message: 'Add the course code, for example STAT 201.' });
  if (!d.name.trim()) issues.push({ field: 'name', code: 'CH-12102', message: 'Add the course name.' });
  if (!d.semester.trim()) issues.push({ field: 'semester', code: 'CH-12103', message: 'Choose the term this class is in.' });
  const s = toMinutes(d.start);
  const e = toMinutes(d.end);
  const hasStart = d.start.trim() !== '';
  const hasEnd = d.end.trim() !== '';
  if (hasStart !== hasEnd || (hasStart && s == null) || (hasEnd && e == null)) issues.push({ field: 'time', code: 'CH-12105', message: 'Add both a start and an end time, or leave both empty.' });
  else if (s != null && e != null && e <= s) issues.push({ field: 'time', code: 'CH-12104', message: 'Ends must be after it starts.' });
  if (!parseCredits(d.credits).ok) issues.push({ field: 'credits', code: 'CH-12106', message: 'Credits is a whole number from 0 to 12.' });
  if (s != null && e != null && e > s) {
    const same = overlapsAmong(
      { id: editingId ?? 'new', days: d.days, start: d.start, end: d.end },
      others.filter((o) => o.id !== editingId && inTermLabel(o, d.semester, currentTerm ?? d.semester)),
    ).find((x) => x.exact);
    if (same) issues.push({ field: 'duplicate', code: 'CH-12107', message: `${same.other.code || same.other.name} already meets at exactly this time. Change the days or times, or edit that class.` });
  }
  return issues;
}

/** One class in the importer's review. */
export interface ChImportRow extends ChClassInput {
  key: string;
  color: string | null;
  /** Why this row needs a look before it is imported, or null. */
  look: string | null;
}

/** Why a parsed class needs a look, in plain words. */
export function lookAt(p: Pick<ParsedClass, 'days' | 'start_time'>): string | null {
  const days = p.days.length > 0;
  const time = !!toHHMM(p.start_time);
  if (days && time) return null;
  if (!days && time) return 'No meeting days found';
  if (days) return 'No time found';
  return 'No days or time found';
}

export function toImportRow(p: ParsedClass): ChImportRow {
  const code = p.course_code.trim();
  const location = p.location.trim();
  const building = p.building.trim() || (!p.room.trim() ? location : '');
  return {
    key: p.id,
    code,
    name: p.course_name.trim() || code || 'Untitled class',
    instructor: p.instructor.trim(),
    days: sortDays(p.days),
    start: toHHMM(p.start_time) ?? '',
    end: toHHMM(p.end_time) ?? '',
    building,
    room: p.room.trim(),
    credits: p.credits,
    semester: p.semester.trim(),
    notes: '',
    color: p.color ?? null,
    look: lookAt(p),
  };
}

/** The importer's own duplicate check: the stored name plus the term. */
export const importKey = (className: string, semester: string | null) => `${className}|||${semester ?? ''}`;

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export interface ChClassesPage {
  /** Today in the team's zone, yyyy-mm-dd. */
  todayIso: string;
  term: ChTerm;
  classes: { list: ChClass[]; error: boolean };
  week: ChWeek;
}
