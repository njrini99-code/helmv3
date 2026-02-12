/**
 * Timezone utilities for displaying dates/times in a team's timezone.
 */

/** Format an ISO date string using team timezone with custom options. */
export function formatInTeamTz(
  iso: string,
  tz: string,
  opts?: Intl.DateTimeFormatOptions
): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).format(
    new Date(iso)
  );
}

/** Get the start and end of "today" in the given timezone as local ISO strings. */
export function getTodayRangeForTz(tz: string): { start: string; end: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year')!.value;
  const month = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  const dateStr = `${year}-${month}-${day}`;
  return { start: `${dateStr}T00:00:00`, end: `${dateStr}T23:59:59` };
}

/** Format an ISO date string as a time (e.g. "2:30 PM") in the given timezone. */
export function formatTimeInTz(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/** Get the current decimal hour (e.g. 14.5 for 2:30 PM) in the given timezone. */
export function getCurrentDecimalHourInTz(tz: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  return hour + minute / 60;
}

/** Convert an ISO date string to decimal hours in the given timezone. */
export function toDecimalHourInTz(iso: string, tz: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(d);
  const hour = parseInt(parts.find((p) => p.type === 'hour')!.value, 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')!.value, 10);
  return hour + minute / 60;
}
