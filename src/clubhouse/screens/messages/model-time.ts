import type { ChClock } from '../../lib/clock-cookie';

export function parts(iso: string, timeZone: string) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

export function clock(iso: string, timeZone: string, hours: ChClock = '12'): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, hour: hours === '24' ? '2-digit' : 'numeric', minute: '2-digit', ...(hours === '24' ? { hourCycle: 'h23' as const } : {}) }).format(new Date(iso));
}

/** Day separators in a thread: "Today", "Yesterday", "Saturday", "Oct 8". */
export function dayLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

/**
 * A future day, for "Muted until …": "today", "tomorrow", "Friday" within the week, then "Oct 25". A week from now is a
 * date, never a weekday: that weekday is also today's.
 */
export function untilLabel(iso: string, now: string, timeZone: string): string {
  const d = dayDiff(parts(iso, timeZone), parts(now, timeZone));
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d < 7) return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(iso));
}

export function sectionOf(iso: string | null, now: string, timeZone: string): 'today' | 'week' | 'earlier' {
  if (!iso) return 'earlier';
  const d = dayDiff(parts(now, timeZone), parts(iso, timeZone));
  return d <= 0 ? 'today' : d < 7 ? 'week' : 'earlier';
}
