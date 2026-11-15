import { zonedWallTimeToInstant } from '@/lib/golf/message-polls';
import { formatWith, weekdayShortUtc } from '../lib/dates';

/**
 * The team's trips on Home (F-0001, audit 2026-11-13). Team Hub's Plan trip makes the calendar event optional, so a trip
 * can stand alone; Home read only events, and on a travel day said "No events scheduled" while Team Hub said the team
 * was on the road. Pure (no server-only), so the loader and the tests share it.
 */

/** What Home reads of a trip (golf_travel_itineraries). */
export const HOME_TRIP_COLUMNS = 'id, event_id, event_name, destination, departure_date, departure_time, return_date, return_time, is_test';

export type ChHomeTripRow = {
  id: string;
  event_id: string | null;
  event_name: string | null;
  destination: string | null;
  departure_date: string | null;
  departure_time: string | null;
  return_date: string | null;
  return_time: string | null;
  is_test?: boolean | null;
};

/** Team Hub's name for a trip (`trip` in hub.ts), so both pages call it the same. */
export function tripTitle(t: Pick<ChHomeTripRow, 'event_name' | 'destination'>): string {
  return t.event_name || t.destination || 'Team trip';
}

/** The last day of a trip, inclusive: its return day, or its departure day when it has none (or one before it). */
export function tripBack(t: Pick<ChHomeTripRow, 'departure_date' | 'return_date'>): string | null {
  if (!t.departure_date) return null;
  return t.return_date && t.return_date >= t.departure_date ? t.return_date : t.departure_date;
}

/** The departure as an instant on the team's clock; null with no time saved (or one that doesn't parse). */
export function tripLeaves(t: Pick<ChHomeTripRow, 'departure_date' | 'departure_time'>, tz: string): string | null {
  if (!t.departure_date || !t.departure_time) return null;
  return zonedWallTimeToInstant(t.departure_date, t.departure_time.slice(0, 5), tz)?.at ?? null;
}

// Calendar dates already in the team's zone (YYYY-MM-DD), read at UTC noon so no zone moves them.
const at = (ymd: string) => new Date(`${ymd}T12:00:00Z`);
const weekdayDay = (ymd: string) => `${weekdayShortUtc(at(ymd))} ${Number(ymd.slice(8, 10))}`;
const month = (ymd: string) => formatWith(at(ymd), { timeZone: 'UTC', month: 'short' });

/** "Tue 17 Nov", as Home names a day (Latest rounds' "Wed 21 Oct"). */
export function dayMonth(ymd: string): string {
  return `${weekdayDay(ymd)} ${month(ymd)}`;
}

/** "Fri 13 – Sun 15 Nov", "Sat 31 Oct – Mon 2 Nov", "Fri 13 Nov". */
export function tripDates(from: string, to: string): string {
  if (from === to) return dayMonth(from);
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  return `${weekdayDay(from)}${sameMonth ? '' : ` ${month(from)}`} – ${dayMonth(to)}`;
}
