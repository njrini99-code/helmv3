import { addDays, hhmmToHour, type ChCalEvent } from '../screens/calendar/model';
import { tripBack, tripTitle, type ChHomeTripRow } from './home-trips';

/**
 * The team's trips on the Calendar (prod audit 2026-11-15, N13P-24). Team Hub's Plan trip makes the calendar event optional, so a
 * trip can stand alone; Calendar read golf_events only, so the team trip was missing from Week, Month and List while the Week legend
 * listed Travel, and the rail said nothing was on the team calendar on a travel day. Home reads trips the same way (home-trips.ts,
 * F-0001). Pure (no server-only), so the loader and the tests share it.
 */

/** The window read: a trip that ends on or after the window's first day and leaves on or before its last. */
export function tripsInWindowFilter(from: string): string {
  return `return_date.gte.${from},and(return_date.is.null,departure_date.gte.${from})`;
}

/**
 * One all-day Travel row per day of each trip in the window, as an all-day event spans (`span` on each day's entry). A trip whose
 * event is on the calendar is drawn once, as that event (the event's detail links the trip, `LinkedTrip`); a test trip never shows.
 * Read-only on the calendar: it is planned, moved and cancelled in Team Hub's Travel.
 */
export function calendarTripRows(trips: readonly ChHomeTripRow[], eventIds: ReadonlySet<string>, range: { from: string; to: string }): ChCalEvent[] {
  const out: ChCalEvent[] = [];
  for (const t of trips) {
    const back = tripBack(t);
    if (!back || !t.departure_date || t.is_test === true) continue;
    if (t.event_id && eventIds.has(t.event_id)) continue;
    if (back < range.from || t.departure_date > range.to) continue;
    const from = t.departure_date;
    const base: Omit<ChCalEvent, 'date'> = {
      id: `trip-${t.id}`,
      type: 'travel',
      title: tripTitle(t),
      start: null,
      end: null,
      allDay: true,
      // As Home: the destination is the place when the trip has its own name; otherwise it is already the title.
      location: t.event_name ? t.destination : null,
      notes: null,
      recurring: null,
      people: [],
      rsvp: {},
      rsvpRequired: false,
      owner: null,
      busyOnly: false,
      instructor: null,
      pattern: null,
      canEdit: false,
      cancelled: false,
      seriesId: null,
      startIso: `${from}T00:00:00Z`,
      span: from === back ? null : { from, to: back },
      trip: { id: t.id, leaves: hhmmToHour(t.departure_time), returns: t.return_date ? hhmmToHour(t.return_time) : null },
    };
    for (let d = from < range.from ? range.from : from, n = 0; d <= back && n < 62; d = addDays(d, 1), n++) {
      if (d > range.to) break;
      out.push({ ...base, date: d });
    }
  }
  return out;
}
