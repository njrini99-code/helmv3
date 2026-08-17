/**
 * Timezone utilities for displaying dates/times in a team's timezone.
 *
 * Contract tests: `./__tests__/timezone.test.ts`. Read the header there before
 * changing `getTodayRangeForTz` — the obvious correction breaks 44 rows.
 */

/**
 * Today's calendar DATE in the given timezone, stamped as a floating
 * `YYYY-MM-DDT00:00:00` / `…T23:59:59` pair with no offset and no `Z`.
 *
 * NOT the instants that open and close that zone's day, despite how the pair
 * reads. Every consumer passes these straight to PostgREST as a filter on
 * `golf_events.start_time` (`timestamptz`), and Postgres casts a zone-less
 * literal in the SESSION zone — UTC here. So the window the database applies is
 * the UTC day. All ten production teams are `America/New_York`, so it opens at
 * 8pm the previous evening and closes at 7:59:59pm.
 *
 * DO NOT "fix" that by emitting real local-day instants. An all-day
 * `golf_event` is persisted at UTC midnight and its UTC-written date IS the
 * intended calendar date (see `eventCalendarDay` in `@/lib/calendar/timezone`);
 * 44 such rows sit exactly on the boundary a re-zone would move, and every one
 * of them would shift a day. Correcting the timed-event window is a semantics
 * decision about all-day rows, tracked with #1496's coach half — the same
 * window is also the `p_today_start`/`p_today_end` pair of
 * `get_coach_today_schedule`, which declares them `timestamptz` and does no
 * re-zoning of its own.
 *
 * The date half IS correct for the given zone, and callers that only need the
 * day (`todayStart.split('T')[0]`, the task-overdue comparison) are unaffected.
 */
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

/**
 * Get the current decimal hour (e.g. 14.5 for 2:30 PM) in the given timezone.
 *
 * Consumers position a now-line from this, so the result has to stay in
 * `[0, 24)`. `hour12: false` on `en-US` has an engine-dependent history of
 * answering "24" for midnight (hourCycle h24 vs h23) — Node 22 answers "00" and
 * nothing has been observed misbehaving, but the range is pinned by a contract
 * test rather than assumed.
 */
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
