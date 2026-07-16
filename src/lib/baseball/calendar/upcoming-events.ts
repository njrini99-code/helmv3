// =============================================================================
// src/lib/baseball/calendar/upcoming-events.ts
//
// Team-timezone-correct "upcoming events" summary for the Calendar page's
// event-summary strip (headline count + per-type badges).
//
// THE GAP THIS CLOSES
//   `calendar/page.tsx` previously derived "today" from
//   `new Date(now.getFullYear(), now.getMonth(), now.getDate())` — the
//   SERVER RUNTIME's own local date. Vercel serverless functions run in UTC,
//   so in the evening Eastern hours (after ~8pm ET / 00:00 UTC) this silently
//   promotes tomorrow (UTC) to "today," excluding every one of the team's
//   own-day events from the "N upcoming events" headline and the per-type
//   badges below it. Same Gap-1 class of bug the Daily Contract closed for
//   lifting (`src/lib/baseball/daily-contract/contract-day.ts`) — this reuses
//   that exact fix (team-owned IANA timezone as the single source of truth
//   for "today," never the runtime's own clock).
//
// Pure, environment-free, and unit-testable in isolation from the async
// `resolveTeamTimezone` DB read and the Next.js server-component page shell.
// =============================================================================

import { todayIsoInTz, localDayBoundsUtc } from '@/lib/baseball/daily-contract/contract-day';

/** The minimal event shape this summary needs — a structural subset of `CalendarEvent`. */
export interface UpcomingEventsInput {
  start_time?: string | null;
  start_date?: string | null;
  event_type?: string | null;
}

export interface UpcomingEventsSummary {
  upcomingEvents: number;
  eventTypeCounts: Record<string, number>;
}

/**
 * "Upcoming" = event start time at or after TEAM-LOCAL midnight today (not
 * the exact `now` instant, and never the runtime's own UTC midnight) — an
 * event scheduled earlier today still counts as upcoming for the rest of the
 * team's day.
 *
 * Both the headline count and the per-type badges are derived from filtering
 * the SAME list once, so (per `calendar/page.tsx`'s own longstanding
 * invariant) the two numbers can never disagree.
 *
 * `teamTimezone` should come from `resolveTeamTimezone()` — an empty/invalid
 * value degrades honestly to the UTC boundary via `todayIsoInTz`/
 * `localDayBoundsUtc`'s own fallback, never throws.
 */
export function computeUpcomingEventsSummary(
  events: UpcomingEventsInput[],
  teamTimezone: string,
  now: Date = new Date(),
): UpcomingEventsSummary {
  const todayIso = todayIsoInTz(teamTimezone, now);
  const { startUtcIso } = localDayBoundsUtc(todayIso, teamTimezone);
  const startOfToday = new Date(startUtcIso);

  const upcomingEventsList = events.filter((e) => {
    const start = e.start_time || e.start_date;
    return Boolean(start) && new Date(start as string) >= startOfToday;
  });

  const eventTypeCounts = upcomingEventsList.reduce<Record<string, number>>((acc, e) => {
    const t = e.event_type || 'other';
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return { upcomingEvents: upcomingEventsList.length, eventTypeCounts };
}
