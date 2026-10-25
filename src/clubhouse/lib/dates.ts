import { plural } from './plural';

/**
 * CONS-16: dates, the clock and relative time, from one place. The date locale (en-GB "Tuesday 14 October", the
 * recorded P015 D4, vs the en-US majority) waits on the owner, so the day formatters are not here yet; the rest is.
 */

const ISO_DAY = new Map<string, Intl.DateTimeFormat>();

/** The calendar day of an instant as `YYYY-MM-DD`, in `timeZone` (the runtime's own when absent). A key, not a label. */
export function isoDay(at: Date | number | string, timeZone?: string): string {
  const key = timeZone ?? '';
  let fmt = ISO_DAY.get(key);
  if (!fmt) {
    // en-CA orders the parts year-month-day.
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    ISO_DAY.set(key, fmt);
  }
  return fmt.format(at instanceof Date ? at : new Date(at));
}

/** The wall-clock day and decimal hour of an instant in `timeZone`, as the calendar loader reads it: a key, not a label. */
export function zonedWallTime(at: Date | number | string, timeZone: string): { date: string; hour: number } {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at instanceof Date ? at : new Date(at))) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: (Number(p.hour) % 24) + Number(p.minute) / 60 };
}

/** The one clock: "3:30 PM". */
export function formatClock(at: Date | number | string, timeZone?: string): string {
  return new Date(at).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' });
}

/** A local "HH:MM" wall time on the same clock, with the minutes dropped on the hour: "7 AM", "7:30 PM". */
export function formatWallClock(hhmm: string): string {
  const [hs = '0', m = '00'] = hhmm.split(':');
  const h = Number(hs);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`;
}

const shortDate = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * How long ago, in one of two lengths:
 * - `short`, for dense lists: Now, 9m, 2h, 3d, then the date (Oct 14).
 * - `long`, for a sentence: Just now, 5 minutes ago, 2 hours ago, Yesterday, then the date.
 * Empty for a time that doesn't parse.
 */
export function relativeTime(at: Date | number | string, style: 'short' | 'long', now: number = Date.now()): string {
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(t)) return '';
  const mins = Math.max(0, Math.round((now - t) / 60000));
  const hrs = Math.round(mins / 60);
  const days = Math.round(hrs / 24);
  if (style === 'short') {
    if (mins < 1) return 'Now';
    if (mins < 60) return `${mins}m`;
    if (hrs < 24) return `${hrs}h`;
    if (days < 7) return `${days}d`;
    return shortDate(t);
  }
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${plural(mins, 'minute')} ago`;
  if (hrs < 24) return `${plural(hrs, 'hour')} ago`;
  if (days <= 1) return 'Yesterday';
  return shortDate(t);
}
