import type { ChClock } from '../../lib/clock-cookie';

/**
 * A date formatter is expensive to build (it resolves the zone), and a thread builds one per bubble, a rail one per row, so each
 * kind is built once per locale and zone and reused (F-0010: the first frame after a route switch). `kind` names the options, so a
 * key never has to serialise them; an unknown zone throws here, as it always did, and is not stored.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();
export function zoneFormat(locale: string, timeZone: string, kind: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${kind}`;
  let fmt = FORMATTERS.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { timeZone, ...options });
    FORMATTERS.set(key, fmt);
  }
  return fmt;
}

export function parts(iso: string, timeZone: string) {
  const p: Record<string, string> = {};
  for (const x of zoneFormat('en-US', timeZone, 'ymd', { year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

export function clock(iso: string, timeZone: string, hours: ChClock = '12'): string {
  const fmt = hours === '24' ? zoneFormat('en-US', timeZone, 'clock24', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : zoneFormat('en-US', timeZone, 'clock12', { hour: 'numeric', minute: '2-digit' });
  return fmt.format(new Date(iso));
}

/** "Saturday": the weekday of an instant, in full. */
const weekdayLong = (iso: string, timeZone: string) => zoneFormat('en-US', timeZone, 'weekdayLong', { weekday: 'long' }).format(new Date(iso));
/** "Sat": the weekday of an instant, short (the rail's). */
export const weekdayShort = (iso: string, timeZone: string) => zoneFormat('en-US', timeZone, 'weekdayShort', { weekday: 'short' }).format(new Date(iso));
/** "Oct 8": the month and day of an instant. */
export const monthDay = (iso: string, timeZone: string) => zoneFormat('en-US', timeZone, 'monthDay', { month: 'short', day: 'numeric' }).format(new Date(iso));

/** Day separators in a thread: "Today", "Yesterday", "Saturday", "Oct 8". */
export function dayLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return weekdayLong(iso, timeZone);
  return monthDay(iso, timeZone);
}

/**
 * A future day, for "Muted until …": "today", "tomorrow", "Friday" within the week, then "Oct 25". A week from now is a
 * date, never a weekday: that weekday is also today's.
 */
export function untilLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(iso, timeZone), parts(now, timeZone));
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return weekdayLong(iso, timeZone);
  return monthDay(iso, timeZone);
}

export function sectionOf(iso: string | null, now: string, timeZone: string): 'today' | 'week' | 'earlier' {
  if (!iso) return 'earlier';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  return d <= 0 ? 'today' : d < 7 ? 'week' : 'earlier';
}
