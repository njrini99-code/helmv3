/**
 * The quick chat's week card, on the team's calendar: a practice at 8 PM Eastern on Tuesday is a Wednesday in UTC, and a Monday-to-Sunday week
 * of UTC days drew it on the wrong day and at the wrong hour. Pure, so the server action and the card both use it (a 'use server' file can
 * only export async functions).
 */
export interface QuickChatWeekRow {
  title: string;
  start_time: string;
  end_time: string | null;
}

export interface QuickChatWeek {
  days: Array<{ date: string; hasEvent: boolean }>;
  items: Array<{ title: string; start: string; end: string | null }>;
  /** The zone `days` and the hours are in; absent on fixtures, whose times read as written (UTC). */
  timeZone?: string;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A date's Monday-to-Sunday week. */
export function quickChatWeekDays(date: string): string[] {
  const monday = addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Bounds wide enough for the week in any zone (a local date is at most a day from the UTC date); `quickChatWeekOf` trims to the week. */
export function quickChatWeekBounds(days: readonly string[]): { from: string; to: string } {
  return { from: `${addDays(days[0]!, -1)}T00:00:00Z`, to: `${addDays(days[6]!, 1)}T23:59:59Z` };
}

/** The calendar date of an instant in `tz`, as YYYY-MM-DD. */
export function localDateIn(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** The clock of an instant in `tz`, 24-hour. */
export function clockIn(iso: string, tz: string): { hours: number; minutes: number } {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).split(':');
  return { hours: Number(h), minutes: Number(m) };
}

export function quickChatWeekOf(date: string, rows: readonly QuickChatWeekRow[], tz: string): QuickChatWeek {
  const local = rows.map((r) => ({ r, day: localDateIn(r.start_time, tz) }));
  return {
    days: quickChatWeekDays(date).map((d) => ({ date: d, hasEvent: local.some((x) => x.day === d) })),
    items: local.filter((x) => x.day === date).map(({ r }) => ({ title: r.title, start: r.start_time, end: r.end_time })),
    timeZone: tz,
  };
}
