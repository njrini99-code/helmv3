/**
 * Change marks (P-14): what a coach changed on an event, in words. Pure: the same functions draw the Calendar rows, the
 * event panel, the live region, the phone feed's first line and the "Message players" draft, so the words never drift.
 *
 * The mark itself is written only by the `golf_events_change_mark` trigger (supabase/migrations/20261025080000): it keeps
 * the value invitees last knew (`from`) and the fields that differ now. Nothing here writes; it reads the stored mark and
 * the event's current values.
 *
 * Every string is in the app's 12-hour voice ("4:00 PM"). A device on the 24-hour clock restyles them on screen
 * (`restyleClock` in the Clubhouse's lib/clock-format.ts), as it does every other server-written time.
 */

export type ChangeField = 'start_time' | 'end_time' | 'all_day' | 'location' | 'title' | 'event_type' | 'cancelled';

const CHANGE_FIELDS: ReadonlySet<string> = new Set<ChangeField>(['start_time', 'end_time', 'all_day', 'location', 'title', 'event_type', 'cancelled']);

/** What the trigger compares: the tracked columns of an event, normalised (UTC instants to the second, '' place as null). */
export interface ChangeSnapshot {
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  title: string;
  event_type: string;
  cancelled: boolean;
}

/** `golf_events.metadata.change`, version 1. */
export interface StoredChange {
  v: 1;
  /** One id per session of edits; the cookie and the live region key on it. */
  id: string;
  first_at: string;
  at: string;
  /** The latest editor's `golf_coaches.id`, or null for a system write. */
  by: string | null;
  /** Up to three `golf_coaches.full_name`, in order of first edit. */
  by_names: string[];
  /** What invitees last knew. */
  from: ChangeSnapshot;
  fields: ChangeField[];
  /** Set by a sender that has told the players (not written when the coach sends the message themselves). */
  settled_at?: string;
  prior?: StoredChange;
}

export type MarkKind = 'time' | 'day' | 'retime' | 'allday' | 'place' | 'rename' | 'retype' | 'cancel' | 'restore' | 'several';

export type MarkBadgeWord = 'Moved' | 'New time' | 'Renamed' | 'Changed' | 'Cancelled' | 'Back on';

/** Owner call 12.1 (default b): a mark shows for 72 hours after the last edit, or until the event ends. */
export const MARK_LIFETIME_MS = 72 * 60 * 60 * 1000;
/** Rows show a mark only on events that start within this many days; further out, the detail still says what changed. */
export const ROW_MARK_HORIZON_DAYS = 14;

const DAY_MS = 86_400_000;

// ── Parsing ──

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));

function parseSnapshot(raw: unknown): ChangeSnapshot | null {
  if (!isObject(raw)) return null;
  const { start_time, end_time, all_day, location, title, event_type, cancelled } = raw;
  if (!isIso(start_time)) return null;
  if (end_time !== null && !isIso(end_time)) return null;
  if (typeof all_day !== 'boolean' || typeof cancelled !== 'boolean') return null;
  if (location !== null && typeof location !== 'string') return null;
  if (typeof title !== 'string' || typeof event_type !== 'string') return null;
  return { start_time, end_time, all_day, location, title, event_type, cancelled };
}

function parseOne(raw: unknown, allowPrior: boolean): StoredChange | null {
  if (!isObject(raw) || raw.v !== 1) return null;
  if (typeof raw.id !== 'string' || !raw.id || !isIso(raw.first_at) || !isIso(raw.at)) return null;
  if (raw.by !== null && raw.by !== undefined && typeof raw.by !== 'string') return null;
  const names = raw.by_names;
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) return null;
  const from = parseSnapshot(raw.from);
  if (!from) return null;
  if (!Array.isArray(raw.fields) || raw.fields.some((f) => typeof f !== 'string' || !CHANGE_FIELDS.has(f))) return null;
  const out: StoredChange = {
    v: 1,
    id: raw.id,
    first_at: raw.first_at,
    at: raw.at,
    by: typeof raw.by === 'string' ? raw.by : null,
    by_names: (names as string[]).slice(0, 3),
    from,
    fields: raw.fields as ChangeField[],
  };
  if (isIso(raw.settled_at)) out.settled_at = raw.settled_at;
  if (allowPrior && raw.prior !== undefined) {
    const prior = parseOne(raw.prior, false);
    if (prior) out.prior = prior;
  }
  return out;
}

/** The stored mark, or null when it is absent or not a shape this version reads (unknown `v`, missing `from`, bad types). */
export function parseStoredChange(raw: unknown): StoredChange | null {
  return parseOne(raw, true);
}

/** A mark that is there but unreadable, with enough to show a bare "Changed" badge: its id and the time of the edit. */
export function readPartialChange(raw: unknown): { id: string; at: string } | null {
  if (!isObject(raw)) return null;
  if (typeof raw.id !== 'string' || !raw.id || !isIso(raw.at)) return null;
  return { id: raw.id, at: raw.at };
}

const toSecondIso = (iso: string): string => new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z');

/** An event row as the trigger sees it, for comparing with a stored mark's `from`. */
export function snapshotOf(row: { start_time: string; end_time: string | null; all_day: boolean | null; location: string | null; title: string; event_type: string; status: string | null }): ChangeSnapshot {
  return {
    start_time: toSecondIso(row.start_time),
    end_time: row.end_time ? toSecondIso(row.end_time) : null,
    all_day: row.all_day === true,
    location: row.location?.trim() ? row.location.trim() : null,
    title: row.title,
    event_type: row.event_type,
    cancelled: row.status === 'cancelled',
  };
}

// ── Time in the team's zone ──

interface Zoned {
  date: string;
  hour: number;
  minute: number;
  /** 0 is Sunday. */
  dow: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const formatters = new Map<string, Intl.DateTimeFormat>();
function zonedParts(ms: number, timeZone: string): Zoned {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formatters.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, hour: Number(p.hour) % 24, minute: Number(p.minute), dow: new Date(`${date}T12:00:00Z`).getUTCDay() };
}

/** Where a snapshot's start sits on the calendar: a timed event in the team's zone; an all-day one by its stored date. */
function startOf(s: Pick<ChangeSnapshot, 'start_time' | 'all_day'>, timeZone: string): Zoned {
  if (s.all_day) {
    const date = (s.start_time ?? '').slice(0, 10);
    return { date, hour: 0, minute: 0, dow: new Date(`${date}T12:00:00Z`).getUTCDay() };
  }
  return zonedParts(Date.parse(s.start_time ?? ''), timeZone);
}
function endOf(s: Pick<ChangeSnapshot, 'start_time' | 'end_time' | 'all_day'>, timeZone: string): Zoned | null {
  if (!s.end_time) return null;
  return startOf({ start_time: s.end_time, all_day: s.all_day }, timeZone);
}

const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dayDiff = (a: string, b: string): number => dayNumber(a) - dayNumber(b);

/** "4:00 PM". */
function clockText(z: Zoned): string {
  return `${((z.hour + 11) % 12) + 1}:${String(z.minute).padStart(2, '0')} ${z.hour < 12 ? 'AM' : 'PM'}`;
}
const half = (z: Zoned): 'AM' | 'PM' => (z.hour < 12 ? 'AM' : 'PM');

/** "4:00 to 6:00 PM", or "11:00 AM to 1:00 PM" across noon. */
function rangeText(a: Zoned, b: Zoned | null): string {
  if (!b) return clockText(a);
  const start = clockText(a);
  return half(a) === half(b) ? `${start.replace(/ [AP]M$/, '')} to ${clockText(b)}` : `${start} to ${clockText(b)}`;
}

/** "Wed 15 April". */
export function longDateLabel(date: string): string {
  return longDate(date);
}
function longDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${DOW[new Date(`${date}T12:00:00Z`).getUTCDay()]} ${d} ${MONTH[m! - 1]}`;
}

/** "today", "tomorrow", a weekday within the next 6 days, else "Thu 23 April"; a past date is "Thu 16 April". */
function dayPhrase(date: string, today: string): string {
  const n = dayDiff(date, today);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n >= 2 && n <= 6) return DOW[new Date(`${date}T12:00:00Z`).getUTCDay()]!;
  return longDate(date);
}

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const eventName = (title: string): string => clip(title.trim() || 'Event', 40);
const placeName = (place: string): string => clip(place, 28);

const TYPE_PHRASE: Record<string, string> = { practice: 'a practice', qualifier: 'a qualifier', tournament: 'a tournament', meeting: 'a meeting', travel: 'a trip', other: 'an event' };
const typePhrase = (t: string): string => TYPE_PHRASE[t] ?? 'an event';

// ── What changed ──

interface Delta {
  cancel: boolean;
  restore: boolean;
  allday: boolean;
  dayMoved: boolean;
  /** The clock time of the start differs. */
  clockMoved: boolean;
  startMoved: boolean;
  endMoved: boolean;
  /** Start and end moved by the same amount. */
  sameShift: boolean;
  time: boolean;
  place: boolean;
  rename: boolean;
  retype: boolean;
}

function deltaOf(before: ChangeSnapshot, after: ChangeSnapshot, timeZone: string): Delta {
  const allday = before.all_day !== after.all_day;
  const bs = startOf(before, timeZone);
  const as = startOf(after, timeZone);
  const startMs = Date.parse(after.start_time ?? '') - Date.parse(before.start_time ?? '');
  const startMoved = before.start_time !== after.start_time;
  const endMoved = before.end_time !== after.end_time;
  const endMs = before.end_time && after.end_time ? Date.parse(after.end_time) - Date.parse(before.end_time) : null;
  const dayMoved = !allday && bs.date !== as.date;
  const clockMoved = !before.all_day && !after.all_day && (bs.hour !== as.hour || bs.minute !== as.minute);
  return {
    cancel: !before.cancelled && after.cancelled,
    restore: before.cancelled && !after.cancelled,
    allday,
    dayMoved,
    clockMoved,
    startMoved,
    endMoved,
    sameShift: startMoved && (endMs === null ? !endMoved : endMs === startMs),
    time: allday || startMoved || endMoved,
    place: before.location !== after.location,
    rename: before.title !== after.title,
    retype: before.event_type !== after.event_type,
  };
}

/** The kind of change between what invitees knew and the event now. A cancel in the session wins over everything else. */
export function markKind(c: Pick<StoredChange, 'from'>, now: ChangeSnapshot, timeZone = 'UTC'): MarkKind {
  const d = deltaOf(c.from, now, timeZone);
  if (d.cancel) return 'cancel';
  if (d.restore) return 'restore';
  const groups = [d.time, d.place, d.rename, d.retype].filter(Boolean).length;
  if (groups > 1) return 'several';
  if (d.allday) return 'allday';
  if (d.time) return d.dayMoved ? 'day' : d.sameShift ? 'time' : 'retime';
  if (d.place) return 'place';
  if (d.rename) return 'rename';
  if (d.retype) return 'retype';
  return 'several';
}

/** The badge's word: Moved for a move of time or place, New time for a changed length, else the plain word for the kind. */
export function badgeWord(kind: MarkKind, delta?: { time: boolean; place: boolean }): MarkBadgeWord {
  switch (kind) {
    case 'time':
    case 'day':
    case 'allday':
    case 'place':
      return 'Moved';
    case 'retime':
      return 'New time';
    case 'rename':
      return 'Renamed';
    case 'cancel':
      return 'Cancelled';
    case 'restore':
      return 'Back on';
    case 'several':
      return delta?.time || delta?.place ? 'Moved' : 'Changed';
    default:
      return 'Changed';
  }
}

// ── Liveness ──

/**
 * When an event ends, in ms: a timed one at its end (one hour after its start when it has none, as the calendar draws
 * it); an all-day one at midnight, in the team's zone, after its last day. The last day is read as a date, as the loader
 * does (stored at 00:00 UTC), never zoned.
 */
export function eventEndMs(ev: { startIso: string; endIso: string | null; allDay: boolean }, timeZone: string): number {
  if (!ev.allDay) {
    const end = ev.endIso ? Date.parse(ev.endIso) : NaN;
    return Number.isFinite(end) ? end : Date.parse(ev.startIso) + 3_600_000;
  }
  const last = (ev.endIso ?? ev.startIso).slice(0, 10);
  const next = new Date(dayNumber(last) * DAY_MS + DAY_MS).toISOString().slice(0, 10);
  return zonedMidnightMs(next, timeZone);
}

/** The instant a calendar date begins in a zone. */
function zonedMidnightMs(date: string, timeZone: string): number {
  const utc = Date.parse(`${date}T00:00:00Z`);
  const offsetAt = (ms: number): number => {
    const z = zonedParts(ms, timeZone);
    return Date.parse(`${z.date}T${String(z.hour).padStart(2, '0')}:${String(z.minute).padStart(2, '0')}:00Z`) - Math.floor(ms / 60_000) * 60_000;
  };
  const first = utc - offsetAt(utc);
  return utc - offsetAt(first);
}

/** The mark shows while the last edit is under 72 hours old and the event has not ended. */
export function markIsLive(c: Pick<StoredChange, 'at'>, ev: { startIso: string; endIso: string | null; allDay: boolean }, timeZone: string, nowMs: number): boolean {
  const at = Date.parse(c.at);
  if (!Number.isFinite(at) || at + MARK_LIFETIME_MS <= nowMs) return false;
  return nowMs < eventEndMs(ev, timeZone);
}

/** Whether a row of the calendar carries the mark: the event starts within the horizon (or has started). */
export function withinRowHorizon(startIso: string, nowMs: number): boolean {
  return Date.parse(startIso) <= nowMs + ROW_MARK_HORIZON_DAYS * DAY_MS;
}

// ── Copy ──

export interface ChangeItem {
  before: ChangeSnapshot;
  after: ChangeSnapshot;
}

export interface ChangeCopyInput {
  items: ChangeItem[];
  timeZone: string;
  nowIso: string;
  /** Full names from the stored mark ("Maya Reyes"); written as "Coach Reyes". */
  byNames: string[];
  /** The reader made the change. */
  byMe?: boolean;
  /** The cancellation's reason, when one was given. */
  reason?: string | null;
  /** The mark's `at`. */
  at: string;
}

export interface ChangePanelRow {
  label: string;
  now: string;
  was: string;
}

export interface ChangeCopy {
  kind: MarkKind;
  badge: MarkBadgeWord;
  /** One sentence naming what changed: the Message players draft opens with it, and the live region reads it. */
  title: string;
  /** Its context line. */
  body: string;
  panelLine1: string;
  panelRows: ChangePanelRow[];
  panelLine2: string;
  /** The title without parentheses, for the polite live region. */
  liveText: string;
  /** The phone feed's first DESCRIPTION line. */
  feedLine: string;
  /** The old values, for the struck chunks beside the new ones. */
  was: { time?: string; place?: string; title?: string };
}

/** Where a snapshot's start sits on the calendar: its date in the team's zone and its decimal hour (null for an all-day event). */
export function slotOf(s: Pick<ChangeSnapshot, 'start_time' | 'all_day'>, timeZone: string): { date: string; hour: number | null } {
  const z = startOf(s, timeZone);
  return { date: z.date, hour: s.all_day ? null : z.hour + z.minute / 60 };
}

/** "3:00 PM", or null for an all-day event. */
export function clockLabel(s: Pick<ChangeSnapshot, 'start_time' | 'all_day'>, timeZone: string): string | null {
  return s.all_day ? null : clockText(startOf(s, timeZone));
}

/** On the day an event left: "Moved to Thu at 4:00 PM" ("Moved to tomorrow", "Moved to Thu 23 April at 4:00 PM"). */
export function movedToPhrase(after: ChangeSnapshot, timeZone: string, nowIso: string): string {
  const today = zonedParts(Date.parse(nowIso), timeZone).date;
  const z = startOf(after, timeZone);
  const day = dayPhrase(z.date, today);
  return after.all_day ? `Moved to ${day}` : `Moved to ${day} at ${clockText(z)}`;
}

/** What a reader hears for the row on the day an event left: "Practice, moved to Thursday 16 April at 4:00 PM. Was 3:00 PM today." */
export function movedAwayAria(before: ChangeSnapshot, after: ChangeSnapshot, timeZone: string, nowIso: string): string {
  const today = zonedParts(Date.parse(nowIso), timeZone).date;
  const to = startOf(after, timeZone);
  const from = startOf(before, timeZone);
  const [, m, d] = to.date.split('-').map(Number);
  const when = `${DOW_LONG[to.dow]} ${d} ${MONTH[m! - 1]}${after.all_day ? '' : ` at ${clockText(to)}`}`;
  const was = before.all_day ? 'All day' : clockText(from);
  return `${eventName(before.title)}, moved to ${when}. Was ${was} ${whenOn(from.date, today, null)}.`;
}

/** "Coach Reyes", "Coach Reyes and Coach Ito", "you", or null when no name is known. */
export function byLabel(names: string[], byMe?: boolean): string | null {
  return byPhrase(names, byMe).who;
}

/** "Maya Reyes" is "Coach Reyes"; a name that is only the title is unknown. Long names end in an ellipsis at 24 characters. */
export function coachLabel(fullName: string | null | undefined): string | null {
  const words = (fullName ?? '').split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const isTitle = (w: string | undefined) => !w || /^coach$/i.test(w);
  const last = words[words.length - 1];
  const pick = isTitle(last) ? words[0] : last;
  if (isTitle(pick)) return null;
  return clip(`Coach ${pick}`, 24);
}

function byPhrase(names: string[], byMe: boolean | undefined): { who: string | null } {
  if (byMe) return { who: 'you' };
  const labels = names.map(coachLabel).filter((n): n is string => !!n);
  if (!labels.length) return { who: null };
  if (labels.length === 1) return { who: labels[0]! };
  return { who: `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` };
}

/** When the edit happened: "9:14 PM" today, "Yesterday 9:14 PM", "Tue 9:14 PM" within 6 days, else "21 October 9:14 PM". */
export function whenPhrase(atIso: string, nowIso: string, timeZone: string): string {
  const at = zonedParts(Date.parse(atIso), timeZone);
  const now = zonedParts(Date.parse(nowIso), timeZone);
  const n = dayDiff(now.date, at.date);
  const time = clockText(at);
  if (n <= 0) return time;
  if (n === 1) return `Yesterday ${time}`;
  if (n <= 6) return `${DOW[at.dow]} ${time}`;
  const [, m, d] = at.date.split('-').map(Number);
  return `${d} ${MONTH[m! - 1]} ${time}`;
}

interface Single {
  d: Delta;
  kind: MarkKind;
  b: Zoned;
  a: Zoned;
  be: Zoned | null;
  ae: Zoned | null;
  today: string;
}

/** The old time, named the way the new one sits beside it: a time, a day and time, a range, or "All day". */
function wasTime(s: Single, before: ChangeSnapshot, after: ChangeSnapshot): string {
  if (before.all_day && !after.all_day) return 'All day';
  if (s.kind === 'retime' && !before.all_day) return rangeText(s.b, s.be);
  if (s.b.date !== s.a.date) {
    const near = Math.abs(dayDiff(s.b.date, s.a.date)) <= 6;
    const day = near ? DOW[s.b.dow]! : longDate(s.b.date);
    return before.all_day ? day : `${day} ${clockText(s.b)}`;
  }
  return before.all_day ? 'All day' : clockText(s.b);
}

function whenOn(date: string, today: string, time: string | null): string {
  const n = dayDiff(date, today);
  const day = n === 0 ? 'today' : n === 1 ? 'tomorrow' : n >= 2 && n <= 6 ? `on ${DOW[new Date(`${date}T12:00:00Z`).getUTCDay()]}` : `on ${longDate(date)}`;
  return time ? `${day} at ${time}` : day;
}

function composeOne(item: ChangeItem, input: ChangeCopyInput): Omit<ChangeCopy, 'panelLine2' | 'feedLine' | 'liveText'> {
  const { before, after } = item;
  const tz = input.timeZone;
  const today = zonedParts(Date.parse(input.nowIso), tz).date;
  const d = deltaOf(before, after, tz);
  const kind = markKind({ from: before }, after, tz);
  const b = startOf(before, tz);
  const a = startOf(after, tz);
  const be = endOf(before, tz);
  const ae = endOf(after, tz);
  const s: Single = { d, kind, b, a, be, ae, today };
  const name = eventName(d.rename ? after.title : before.title);
  const oldName = eventName(before.title);
  const placeNow = after.location ? placeName(after.location) : null;
  const placeWas = before.location ? placeName(before.location) : null;
  const badge = badgeWord(kind, d);

  // The old values for the struck chunks.
  const was: ChangeCopy['was'] = {};
  if (d.time && !d.cancel && !d.restore) was.time = wasTime(s, before, after);
  if (d.place && before.location) was.place = before.location;
  if (d.rename) was.title = before.title;

  // The new time as the sentence names it.
  const newTime = after.all_day ? 'all day' : clockText(a);
  const oldTime = before.all_day ? 'all day' : clockText(b);
  const timePart = ((): string => {
    if (d.dayMoved) return `${dayPhrase(a.date, today)} at ${newTime}`;
    return newTime;
  })();

  const isSeveral = !d.cancel && !d.restore && (kind === 'several' || (d.time && d.place) || (d.rename && (d.time || d.place)));
  let title: string;
  let panelLine1: string;
  if (d.cancel) {
    title = `${oldName} ${whenOn(b.date, today, before.all_day ? null : clockText(b))} is cancelled`;
    panelLine1 = 'Cancelled';
  } else if (d.restore) {
    title = `${name} ${whenOn(a.date, today, after.all_day ? null : clockText(a))} is back on`;
    panelLine1 = 'Back on';
  } else if (isSeveral) {
    // More than one field: the title names the move; the panel lists each.
    const toWhen = after.all_day ? 'all day' : d.dayMoved ? timePart : newTime;
    const moved: string[] = [];
    if (d.time) moved.push(`moved to ${toWhen}`);
    if (d.place) moved.push(placeNow ? `${d.time ? 'at' : 'moved to'} ${placeNow}` : 'has no place set');
    if (moved.length) title = `${name} ${moved.join(' ')}`;
    else if (d.rename) title = `${oldName} is now called ${eventName(after.title)}`;
    else title = `${name} changed`;
    panelLine1 = 'Changed';
  } else if (kind === 'time') {
    title = `${name} moved to ${newTime} (was ${oldTime})`;
    panelLine1 = `Moved from ${oldTime}`;
  } else if (kind === 'day') {
    if (after.all_day) {
      title = `${name} moved to ${dayPhrase(a.date, today)} (was ${dayPhrase(b.date, today)})`;
      panelLine1 = `Moved from ${longDate(b.date)}`;
    } else {
      const sameClock = !d.clockMoved;
      title = `${name} moved to ${dayPhrase(a.date, today)} at ${newTime} (was ${dayPhrase(b.date, today)}${sameClock ? '' : ` at ${oldTime}`})`;
      panelLine1 = `Moved from ${longDate(b.date)}${sameClock ? '' : ` at ${oldTime}`}`;
    }
  } else if (kind === 'retime') {
    if (after.all_day && ae && be) {
      title = `${name} now runs until ${longDate(ae.date)} (was ${longDate(be.date)})`;
      panelLine1 = `Now runs until ${longDate(ae.date)}, was ${longDate(be.date)}`;
    } else if (d.endMoved && !d.startMoved && ae && be) {
      title = `${name} now ends at ${clockText(ae)} (was ${clockText(be)})`;
      panelLine1 = `Now ends at ${clockText(ae)}, was ${clockText(be)}`;
    } else {
      title = `${name} is now ${rangeText(a, ae)} (was ${rangeText(b, be)})`;
      panelLine1 = `Now ${rangeText(a, ae)}, was ${rangeText(b, be)}`;
    }
  } else if (kind === 'allday') {
    if (after.all_day) {
      title = `${name} is now all day (was ${oldTime})`;
      panelLine1 = `Now all day, was ${oldTime}`;
    } else {
      title = `${name} is now at ${newTime} (was all day)`;
      panelLine1 = `Now at ${newTime}, was all day`;
    }
  } else if (kind === 'place') {
    if (placeNow && placeWas) {
      title = `${name} moved to ${placeNow} (was ${placeWas})`;
      panelLine1 = `Now at ${placeNow}, was ${placeWas}`;
    } else if (placeNow) {
      title = `${name} is now at ${placeNow}`;
      panelLine1 = `Now at ${placeNow}`;
    } else {
      title = `${name} has no place set${placeWas ? ` (was ${placeWas})` : ''}`;
      panelLine1 = `No place set${placeWas ? `, was ${placeWas}` : ''}`;
    }
  } else if (kind === 'rename') {
    title = `${oldName} is now called ${eventName(after.title)}`;
    panelLine1 = `Renamed from ${oldName}`;
  } else {
    title = `${name} is now ${typePhrase(after.event_type)}`;
    panelLine1 = `Now ${typePhrase(after.event_type)}, was ${typePhrase(before.event_type)}`;
  }

  // The panel's list, for a change in more than one field.
  const panelRows: ChangePanelRow[] = [];
  if (d.time) {
    const nowRange = after.all_day ? 'All day' : rangeText(a, ae);
    const wasRange = before.all_day ? 'All day' : rangeText(b, be);
    if (nowRange !== wasRange) panelRows.push({ label: 'Time', now: nowRange, was: wasRange });
  }
  if (d.dayMoved) panelRows.push({ label: 'Day', now: longDate(a.date), was: longDate(b.date) });
  if (d.place) panelRows.push({ label: 'Place', now: after.location ?? 'No place', was: before.location ?? 'No place' });
  if (d.rename) panelRows.push({ label: 'Name', now: after.title, was: before.title });
  if (d.retype) panelRows.push({ label: 'Type', now: after.event_type.replace(/^./, (c) => c.toUpperCase()), was: before.event_type.replace(/^./, (c) => c.toUpperCase()) });

  // The context line.
  const date = longDate(d.cancel ? b.date : a.date);
  const range = d.cancel ? (before.all_day ? null : rangeText(b, be)) : after.all_day ? null : rangeText(a, ae);
  const place = d.cancel ? before.location : after.location;
  const context = [date, range, place ? placeName(place) : null].filter(Boolean).join(' · ');
  let body: string;
  if (d.cancel) {
    body = input.reason?.trim() ? input.reason.trim() : context;
  } else if (isSeveral) {
    const oldBits: string[] = [];
    const oldWhen = d.time ? (d.dayMoved ? `${longDate(b.date)}${d.clockMoved ? ` at ${oldTime}` : ''}` : oldTime) : null;
    const oldWhere = d.place ? (placeWas ?? 'no place') : null;
    const rest = oldWhen && oldWhere ? `${oldWhen} at ${oldWhere}` : (oldWhen ?? oldWhere);
    if (d.rename) oldBits.push(oldName);
    if (rest) oldBits.push(rest);
    body = `Was ${oldBits.join(', ')} · ${date}`;
  } else {
    body = context;
  }

  return { kind, badge, title, body, panelLine1, panelRows, was };
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function shiftPhrase(ms: number): string | null {
  const abs = Math.abs(ms);
  const dir = ms > 0 ? 'later' : 'earlier';
  if (abs >= DAY_MS && abs % DAY_MS === 0) return `${plural(abs / DAY_MS, 'day')} ${dir}`;
  if (abs >= 3_600_000 && abs % 3_600_000 === 0) return `${plural(abs / 3_600_000, 'hour')} ${dir}`;
  if (abs >= 60_000 && abs % 60_000 === 0) return `${plural(abs / 60_000, 'minute')} ${dir}`;
  return null;
}

function composeSeries(input: ChangeCopyInput): Omit<ChangeCopy, 'panelLine2' | 'feedLine' | 'liveText'> {
  const { items, timeZone: tz } = input;
  const n = items.length;
  const first = items[0]!;
  const name = eventName(first.before.title);
  const deltas = items.map((i) => deltaOf(i.before, i.after, tz));
  const dates = items.map((i) => startOf(i.after, tz).date).sort();
  const span = dates[0] === dates[dates.length - 1] ? longDate(dates[0]!) : `From ${longDate(dates[0]!)} to ${longDate(dates[dates.length - 1]!)}`;
  const place = items.every((i) => i.after.location === first.after.location) && first.after.location ? placeName(first.after.location) : null;
  const same = <T,>(f: (i: ChangeItem) => T): boolean => items.every((i) => f(i) === f(first));
  const all = (f: (d: Delta) => boolean): boolean => deltas.every(f);
  const moveOnly = (d: Delta) => d.time && !d.place && !d.rename && !d.retype && !d.cancel && !d.restore && !d.allday && !d.dayMoved;

  let title = `${name}: ${n} dates changed`;
  let body = `${span} · Open Calendar for the new times`;
  let kind: MarkKind = 'several';
  if (all((d) => d.cancel)) {
    title = `${name}: ${n} dates cancelled`;
    body = span;
    kind = 'cancel';
  } else if (all((d) => d.rename && !d.time && !d.place && !d.cancel && !d.restore) && same((i) => i.after.title)) {
    title = `${name}: ${n} dates now called ${eventName(first.after.title)}`;
    body = span;
    kind = 'rename';
  } else if (all((d) => d.place && !d.time && !d.rename && !d.cancel && !d.restore) && same((i) => i.after.location) && same((i) => i.before.location)) {
    const nowPlace = first.after.location ? placeName(first.after.location) : null;
    const wasPlace = first.before.location ? placeName(first.before.location) : null;
    title = nowPlace ? `${name}: ${n} dates moved to ${nowPlace}${wasPlace ? ` (was ${wasPlace})` : ''}` : `${name}: ${n} dates have no place set`;
    body = span;
    kind = 'place';
  } else if (all(moveOnly)) {
    const nowClock = clockText(startOf(first.after, tz));
    const wasClock = clockText(startOf(first.before, tz));
    const sameTimes = same((i) => clockText(startOf(i.after, tz))) && same((i) => clockText(startOf(i.before, tz)));
    const shifts = new Set(items.map((i) => Date.parse(i.after.start_time ?? '') - Date.parse(i.before.start_time ?? '')));
    const shift = shifts.size === 1 ? shiftPhrase([...shifts][0]!) : null;
    if (sameTimes) {
      title = `${name}: ${n} dates moved to ${nowClock} (was ${wasClock})`;
      body = [span, place].filter(Boolean).join(' · ');
      kind = 'time';
    } else if (shift) {
      title = `${name}: ${n} dates moved ${shift}`;
      body = [span, place].filter(Boolean).join(' · ');
      kind = 'time';
    }
  }
  const badge = badgeWord(kind, { time: deltas.some((d) => d.time), place: deltas.some((d) => d.place) });
  return { kind, badge, title, body, panelLine1: kind === 'cancel' ? 'Cancelled' : kind === 'several' ? 'Changed' : title.slice(name.length + 2), panelRows: [], was: {} };
}

/**
 * Every string a change shows. One item is a single event; two or more are a series edited together ("Practice: 8 dates
 * moved to 4:00 PM (was 3:00 PM)").
 */
export function composeChangeCopy(input: ChangeCopyInput): ChangeCopy {
  const base = input.items.length >= 2 ? composeSeries(input) : composeOne(input.items[0]!, input);
  const { who } = byPhrase(input.byNames, input.byMe);
  const when = whenPhrase(input.at, input.nowIso, input.timeZone);
  const panelLine2 = who ? `By ${who} · ${when}` : `Changed ${when}`;
  const paren = base.title.indexOf(' (was ');
  const liveText = paren > 0 ? `${base.title.slice(0, paren)}. It was ${base.title.slice(paren + 6).replace(/\)$/, '')}.` : `${base.title}.`;
  const [, m, d] = zonedParts(Date.parse(input.at), input.timeZone).date.split('-').map(Number);
  const atZ = zonedParts(Date.parse(input.at), input.timeZone);
  const onDate = `${DOW[atZ.dow]} ${d} ${MONTH[m! - 1]}`;
  const feedLine = `${base.panelLine1}${who && who !== 'you' ? ` by ${who}` : ''} on ${onDate}.`;
  return { ...base, panelLine2, liveText, feedLine };
}
