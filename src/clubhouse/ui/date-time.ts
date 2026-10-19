/**
 * Dates and times for DateField and TimeField, as the strings the forms already hold: `yyyy-mm-dd` and `HH:mm`.
 *
 * Every calendar day is handled as its parts, or as UTC noon, never as `new Date('yyyy-mm-dd')` (that is UTC midnight,
 * the evening before in the Americas) and never through `toISOString()` for "today". `today` is passed in, so a
 * caller (and a test) decides what day it is; nothing here reads the clock but `localToday`.
 *
 * The app's voice is English and 12-hour with Sunday first (screens/calendar/model.ts: fmtHour, weekStart); Settings
 * has no clock or week preference, so these follow the calendar rather than the browser's locale.
 */

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DOW_LONG = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3).toLowerCase());

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

// ---------------------------------------------------------------------------------------------------- calendar days

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

export function toIso({ y, m, d }: Ymd): string {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** The parts of a real `yyyy-mm-dd`, or null: 2026-02-30 is not a day. */
export function parseIso(value: string | null | undefined): Ymd | null {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!hit) return null;
  return validYmd(Number(hit[1]), Number(hit[2]), Number(hit[3]));
}

function validYmd(y: number, m: number, d: number): Ymd | null {
  if (y < 1000 || y > 9999 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

const noon = ({ y, m, d }: Ymd) => new Date(Date.UTC(y, m - 1, d, 12));
const isoOfDate = (dt: Date) => toIso({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() });

/** Today on the device's own calendar (not UTC's). */
export function localToday(now: Date = new Date()): string {
  return toIso({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() });
}

export function addDays(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const dt = noon(p);
  dt.setUTCDate(dt.getUTCDate() + n);
  return isoOfDate(dt);
}

/** `n` months on, keeping the day when the month has it and the month's last day when it doesn't (31 Jan + 1 = 28 Feb). */
export function addMonths(iso: string, n: number): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const idx = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return toIso({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

/** 0 for Sunday. */
export function dayOfWeek(iso: string): number {
  const p = parseIso(iso);
  return p ? noon(p).getUTCDay() : 0;
}

/** "Thu 15 Oct 2026"; "Thu 15 Oct" with `omitYear` (a field showing a date in this year, as iOS does, so a half-width field keeps the day). */
export function formatDate(iso: string | null | undefined, { omitYear = false }: { omitYear?: boolean } = {}): string {
  const p = parseIso(iso);
  if (!p) return '';
  const day = `${DOW_SHORT[dayOfWeek(toIso(p))]} ${p.d} ${MONTHS_SHORT[p.m - 1]!.replace(/^./, (c) => c.toUpperCase())}`;
  return omitYear ? day : `${day} ${p.y}`;
}

/** "October 2026". */
export function formatMonth(iso: string): string {
  const p = parseIso(iso);
  return p ? `${MONTHS_LONG[p.m - 1]} ${p.y}` : '';
}

/** Whether `iso` is outside `min` and `max` (either may be empty). */
export function outOfRange(iso: string, min?: string, max?: string): boolean {
  return (!!min && iso < min) || (!!max && iso > max);
}

/** Pulls `iso` back to the nearest allowed day. */
export function clampDate(iso: string, min?: string, max?: string): string {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

export interface MonthCell {
  date: string;
  /** In the shown month; the cells before and after it are the neighbours that fill the first and last week. */
  inMonth: boolean;
}

/** The weeks of the month holding `iso`, `weekStart` (0 Sunday) first, padded to whole weeks. */
export function monthGrid(iso: string, weekStart = 0): MonthCell[][] {
  const p = parseIso(iso);
  if (!p) return [];
  const first = toIso({ ...p, d: 1 });
  const lead = (dayOfWeek(first) - weekStart + 7) % 7;
  const days = daysInMonth(p.y, p.m);
  const total = Math.ceil((lead + days) / 7) * 7;
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < total; i++) {
    if (i % 7 === 0) weeks.push([]);
    const date = addDays(first, i - lead);
    weeks[weeks.length - 1]!.push({ date, inMonth: date.slice(0, 7) === first.slice(0, 7) });
  }
  return weeks;
}

/**
 * Where a key takes the focused day in the grid, kept inside `min` and `max`: arrows by day and week, Home and End to the
 * week's ends, PageUp and PageDown by month (with Shift, by year). Null for any other key.
 */
export function moveDay(iso: string, key: string, opts: { min?: string; max?: string; shift?: boolean; weekStart?: number } = {}): string | null {
  const weekStart = opts.weekStart ?? 0;
  let next: string;
  switch (key) {
    case 'ArrowLeft': next = addDays(iso, -1); break;
    case 'ArrowRight': next = addDays(iso, 1); break;
    case 'ArrowUp': next = addDays(iso, -7); break;
    case 'ArrowDown': next = addDays(iso, 7); break;
    case 'Home': next = addDays(iso, -((dayOfWeek(iso) - weekStart + 7) % 7)); break;
    case 'End': next = addDays(iso, 6 - ((dayOfWeek(iso) - weekStart + 7) % 7)); break;
    case 'PageUp': next = addMonths(iso, opts.shift ? -12 : -1); break;
    case 'PageDown': next = addMonths(iso, opts.shift ? 12 : 1); break;
    default: return null;
  }
  return clampDate(next, opts.min, opts.max);
}

// ------------------------------------------------------------------------------------------------- typed dates

/**
 * Reads what someone typed into a date field, or null when it is not a date.
 *
 *   "2026-10-15", "10/15", "10/15/26", "10-15-2026"   month first, as the app writes dates; "15/10" when the first
 *                                                       number can only be a day
 *   "oct 15", "15 oct", "October 15, 2026", "Thu 15 Oct 2026"   (the field's own words read back)
 *   "today", "tomorrow", "yesterday"
 *   "fri", "friday", "next fri"   the next one after today; the one before today when `max` rules the next out
 *                                  (a round can't be dated ahead, so "fri" is last Friday there)
 *
 * With no year, the year is today's, or the nearest of next year and last year that `min` and `max` allow ("1/5" typed in
 * October for a due date is next January). Range does not reject: an out-of-range day still parses and the form's own
 * message speaks. Only text that is not a date at all returns null.
 */
export function parseDateInput(text: string, opts: { today: string; min?: string; max?: string }): string | null {
  const raw = text.trim().toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ');
  if (!raw) return null;
  const today = parseIso(opts.today);
  if (!today) return null;

  const word = raw.replace(/\.$/, '');
  if (word === 'today' || word === 'tod') return opts.today;
  if (word === 'tomorrow' || word === 'tom' || word === 'tmrw') return addDays(opts.today, 1);
  if (word === 'yesterday') return addDays(opts.today, -1);

  const day = /^(?:next |this |last )?([a-z]{3,9})$/.exec(word);
  if (day) {
    const dow = DOW_LONG.findIndex((n) => n === day[1] || (day[1]!.length >= 3 && n.startsWith(day[1]!)));
    if (dow >= 0) {
      const ahead = ((dow - dayOfWeek(opts.today) + 6) % 7) + 1; // 1 to 7: never today
      const forward = addDays(opts.today, ahead);
      const back = addDays(opts.today, ahead - 7);
      if (word.startsWith('last ')) return back;
      return opts.max && forward > opts.max && back <= opts.max ? back : forward;
    }
  }

  // The field's own format leads with a weekday: "thu 15 oct 2026". It is decoration; the date is what follows.
  const bare = raw.replace(/^(?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\.? /, '');

  const fit = (m: number, d: number, year: number | null): string | null => {
    if (year !== null) {
      const y = year < 100 ? 2000 + year : year;
      const ok = validYmd(y, m, d);
      return ok ? toIso(ok) : null;
    }
    const tries = [today.y, today.y + 1, today.y - 1].map((y) => validYmd(y, m, d)).filter((v): v is Ymd => !!v).map(toIso);
    if (!tries.length) return null; // 29 Feb in none of the three
    return tries.find((iso) => !outOfRange(iso, opts.min, opts.max)) ?? tries[0]!;
  };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(bare);
  if (iso) return fit(Number(iso[2]), Number(iso[3]), Number(iso[1]));

  const num = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(bare);
  if (num) {
    let m = Number(num[1]);
    let d = Number(num[2]);
    if (m > 12 && d <= 12) [m, d] = [d, m];
    return fit(m, d, num[3] ? Number(num[3]) : null);
  }

  const monthIdx = (name: string) => {
    if (name.length < 3) return -1;
    return MONTHS_LONG.findIndex((full) => full.toLowerCase().startsWith(name) || (name === 'sept' && full === 'September'));
  };
  const mdy = /^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(bare);
  if (mdy) {
    const m = monthIdx(mdy[1]!);
    if (m >= 0) return fit(m + 1, Number(mdy[2]), mdy[3] ? Number(mdy[3]) : null);
  }
  const dmy = /^(\d{1,2})(?:st|nd|rd|th)? ?([a-z]{3,9})\.?(?: (\d{4}))?$/.exec(bare);
  if (dmy) {
    const m = monthIdx(dmy[2]!);
    if (m >= 0) return fit(m + 1, Number(dmy[1]), dmy[3] ? Number(dmy[3]) : null);
  }
  return null;
}

// ------------------------------------------------------------------------------------------------------- times

/** Minutes after midnight for an `HH:mm`, or null. 24:00 is not a time. */
export function parseHm(value: string | null | undefined): number | null {
  const hit = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((value ?? '').trim());
  if (!hit) return null;
  const h = Number(hit[1]);
  const m = Number(hit[2]);
  return h > 23 || m > 59 ? null : h * 60 + m;
}

export function toHm(minutes: number): string {
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** `HH:mm` moved on by `minutes`, or undefined when `value` isn't a time or the result is past the day's end (for an end time's `min`). */
export function addMinutes(value: string | null | undefined, minutes: number): string | undefined {
  const t = parseHm(value);
  if (t === null || t + minutes > 23 * 60 + 59) return undefined;
  return toHm(t + minutes);
}

/** "3:30 PM", the calendar's own wording (fmtHour). Empty for no value. */
export function formatTime(value: string | null | undefined): string {
  const t = parseHm(value);
  if (t === null) return '';
  const h = Math.floor(t / 60);
  return `${((h + 11) % 12) + 1}:${pad(t % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * Reads what someone typed into a time field as `HH:mm`, or null when it is not a time.
 *
 *   "3:30 pm", "3:30p", "3p", "3 PM", "12a"   as said (12a is midnight, 12p noon)
 *   "15:30", "1530", "07:30", "0730"           24-hour: four digits, an hour past 12, or a leading zero
 *   "noon", "midnight"
 *
 * With no am or pm, an hour from 7 to 11 is morning and 1 to 6 is afternoon, the hours a tee sheet runs (the calendar's
 * day is 7 AM to 8 PM); 12 is noon. "930" is 9:30 AM and "330" is 3:30 PM.
 */
export function parseTimeInput(text: string): string | null {
  const raw = text.trim().toLowerCase().replace(/\./g, '');
  if (!raw) return null;
  if (raw === 'noon') return '12:00';
  if (raw === 'midnight') return '00:00';
  const hit = /^(\d{1,4})(?::(\d{2}))?(?::\d{2})? ?(?:([ap])m?)?$/.exec(raw);
  if (!hit) return null;
  const digits = hit[1]!;
  let h: number;
  let mm: number;
  if (hit[2] !== undefined) {
    if (digits.length > 2) return null;
    h = Number(digits);
    mm = Number(hit[2]);
  } else if (digits.length <= 2) {
    h = Number(digits);
    mm = 0;
  } else {
    h = Number(digits.slice(0, digits.length - 2));
    mm = Number(digits.slice(-2));
  }
  if (mm > 59) return null;
  const meridiem = hit[3];
  if (meridiem) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (meridiem === 'p' ? 12 : 0);
  } else {
    const typed24 = digits.length === 4 || (digits.length === 2 && digits.startsWith('0')) || (digits.length === 3 && digits.startsWith('0')) || h >= 13 || h === 0;
    if (!typed24 && h >= 1 && h <= 6) h += 12;
  }
  return h > 23 ? null : `${pad(h)}:${pad(mm)}`;
}

/** The times a list offers: every `step` minutes of the day. A value off the grid (15:05) is added in its place so it still shows as chosen. */
export function timeSlots(step = 15, current?: string): string[] {
  const out: string[] = [];
  for (let t = 0; t < 1440; t += step) out.push(toHm(t));
  const at = parseHm(current);
  if (current && at !== null && at % step !== 0) {
    const i = out.findIndex((s) => (parseHm(s) ?? 0) > at);
    out.splice(i < 0 ? out.length : i, 0, toHm(at));
  }
  return out;
}
