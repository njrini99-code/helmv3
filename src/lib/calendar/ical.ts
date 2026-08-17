/**
 * iCal Generation Library (RFC 5545)
 *
 * Generates .ics (iCalendar) format for calendar subscriptions
 * Compatible with Google Calendar, Apple Calendar, Outlook, etc.
 *
 * Timezone handling:
 * - All internal dates should be stored in UTC
 * - iCal files include VTIMEZONE components for proper display
 * - Events can be output in UTC (with Z suffix) or with TZID
 */

import { parseISO } from 'date-fns';
import {
  getValidTimezone,
} from './timezone';

// NOTE ON date-fns `format`: it is deliberately NOT imported here. Every date
// this file emits lands in a UTC-typed iCal property — a `VALUE=DATE` day or a
// `…Z` instant — and `format` reads the RUNTIME zone's calendar fields. The two
// helpers at the bottom of this file read UTC fields directly instead. See the
// comment on `formatDateTime` for what that cost before it was fixed.

// ============================================================================
// TYPES
// ============================================================================

export interface ICalEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  /**
   * The event's end, in the INCLUSIVE convention this product uses everywhere
   * else: for an all-day event this is the last day the event runs, matching
   * what `golf_events.end_time` stores and what the editor's "Sep 3 → Sep 6"
   * span summary shows the coach. `generateEvent` converts it to iCal's
   * exclusive `DTEND` on the way out — do not pre-shift it here.
   */
  endDate?: Date;
  allDay?: boolean;
  recurrenceRule?: string; // RRULE string
  organizer?: {
    name: string;
    email?: string;
  };
  attendees?: Array<{
    name: string;
    email?: string;
    status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION';
  }>;
  createdAt?: Date;
  updatedAt?: Date;
}

interface ICalCalendar {
  name: string;
  description?: string;
  timezone?: string;
  events: ICalEvent[];
  productId?: string; // Product identifier
  refreshInterval?: number; // Minutes
}

// CalendarEventRow uses snake_case fields matching database schema
// Note: golf_events table uses start_time/end_time, not start_date/end_date
interface CalendarEventRow {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  course_name?: string | null; // May not exist in all tables, use location as fallback
  start_date: string; // ISO date string (mapped from start_time in golf_events)
  end_date?: string | null; // ISO date string (mapped from end_time in golf_events)
  start_time?: string | null; // Time component if separate from date
  end_time?: string | null; // Time component if separate from date
  all_day?: boolean | null;
  recurrence_rule?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

// ============================================================================
// ICAL GENERATION
// ============================================================================

/**
 * Generate complete iCal file content
 */
function generateICalendar(calendar: ICalCalendar): string {
  const lines: string[] = [];

  // Calendar header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push(`PRODID:-//Helm Golf//Calendar ${calendar.productId || 'v1.0'}//EN`);
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeText(calendar.name)}`);

  if (calendar.description) {
    lines.push(`X-WR-CALDESC:${escapeText(calendar.description)}`);
  }

  if (calendar.timezone) {
    lines.push(`X-WR-TIMEZONE:${calendar.timezone}`);
  }

  if (calendar.refreshInterval) {
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:PT${calendar.refreshInterval}M`);
    lines.push(`X-PUBLISHED-TTL:PT${calendar.refreshInterval}M`);
  }

  // Add events
  for (const event of calendar.events) {
    lines.push(...generateEvent(event));
  }

  // Calendar footer
  lines.push('END:VCALENDAR');

  return lines.join('\r\n') + '\r\n';
}

/**
 * Generate single event in iCal format
 */
function generateEvent(event: ICalEvent): string[] {
  const lines: string[] = [];

  lines.push('BEGIN:VEVENT');

  // UID (must be unique and stable)
  lines.push(`UID:${event.id}@helm.golf`);

  // Timestamps
  const now = formatDateTime(new Date());
  lines.push(`DTSTAMP:${now}`);

  if (event.createdAt) {
    lines.push(`CREATED:${formatDateTime(event.createdAt)}`);
  }

  if (event.updatedAt) {
    lines.push(`LAST-MODIFIED:${formatDateTime(event.updatedAt)}`);
  }

  // Title and description
  lines.push(`SUMMARY:${escapeText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeText(event.location)}`);
  }

  // Start and end times
  if (event.allDay) {
    // All-day event.
    //
    // `DTEND` for a DATE value is EXCLUSIVE (RFC 5545 §3.8.2.2) — it names the
    // first day NOT in the event, and it "MUST be later in time than the value
    // of the DTSTART property". `golf_events` stores the opposite convention:
    // `end_time` is the last day the event runs (golf.ts writes the coach's
    // End Date field verbatim, and the editor renders it back as an inclusive
    // "Sep 3 → Sep 6"). Passing that through unshifted published every
    // multi-day tournament one day short — the Transylvania Invite's final
    // round, the last day of the NCAA Championship — and made every single-day
    // all-day event a zero-length span that clients recover from differently.
    //
    // A missing endDate falls back to the start day, so the event still gets a
    // well-formed one-day span rather than relying on the client's default.
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(nextUtcDay(event.endDate ?? event.startDate))}`);
  } else {
    // Timed event
    lines.push(`DTSTART:${formatDateTime(event.startDate)}`);
    if (event.endDate) {
      lines.push(`DTEND:${formatDateTime(event.endDate)}`);
    }
  }

  // Recurrence rule
  if (event.recurrenceRule) {
    // Remove RRULE: prefix if present
    const rrule = event.recurrenceRule.replace(/^RRULE:/i, '');
    lines.push(`RRULE:${rrule}`);
  }

  // Organizer
  if (event.organizer) {
    let organizerLine = 'ORGANIZER';
    if (event.organizer.email) {
      organizerLine += `;CN=${escapeText(event.organizer.name)}:MAILTO:${event.organizer.email}`;
    } else {
      organizerLine += `:${escapeText(event.organizer.name)}`;
    }
    lines.push(organizerLine);
  }

  // Attendees
  if (event.attendees) {
    for (const attendee of event.attendees) {
      let attendeeLine = 'ATTENDEE';
      attendeeLine += `;ROLE=REQ-PARTICIPANT`;
      attendeeLine += `;PARTSTAT=${attendee.status || 'NEEDS-ACTION'}`;
      attendeeLine += `;CN=${escapeText(attendee.name)}`;
      if (attendee.email) {
        attendeeLine += `:MAILTO:${attendee.email}`;
      }
      lines.push(attendeeLine);
    }
  }

  // Status
  lines.push('STATUS:CONFIRMED');

  // Transparency (show as busy)
  lines.push('TRANSP:OPAQUE');

  lines.push('END:VEVENT');

  return lines;
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/**
 * The UTC midnight after `date`'s UTC day — iCal's exclusive `DTEND`.
 *
 * `Date.UTC` rather than `+ 86400000` so the result is a clean UTC midnight
 * even when the input carries a time of day, and so the intent survives a
 * reader who wonders about DST (UTC has none, but the arithmetic shouldn't
 * require knowing that).
 */
function nextUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  );
}

/**
 * Format date as YYYYMMDD, reading UTC fields.
 *
 * An all-day event is persisted at UTC midnight and the date AS WRITTEN IN UTC
 * is the intended calendar date — the same doctrine `eventCalendarDay` in
 * ./timezone.ts states at length, written for the Guilford report of all-day
 * events landing one cell early. Reading local fields off that instant repeats
 * that bug in the subscription feed for every runtime west of Greenwich.
 */
function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/**
 * Format datetime as YYYYMMDDTHHmmssZ (UTC).
 *
 * The trailing `Z` is a promise that the digits before it are UTC, so the
 * fields have to be read with the UTC getters. This previously read
 * `format(new Date(date.toISOString()), "yyyyMMdd'T'HHmmss'Z'")` — the
 * round-trip through `toISOString()` returns the very same instant, so it
 * converted nothing while reading as though it did, and `format` then took the
 * runtime zone's fields. Vercel runs UTC so production was right by accident;
 * under TZ=Pacific/Midway a 14:00Z practice published as `20260903T030000Z`,
 * eleven hours early in every subscribed calendar.
 */
function formatDateTime(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * Escape special characters in iCal text fields
 */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\') // Backslash
    .replace(/;/g, '\\;') // Semicolon
    .replace(/,/g, '\\,') // Comma
    .replace(/\n/g, '\\n') // Newline
    .replace(/\r/g, ''); // Remove carriage returns
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate iCal feed for coach's calendar
 *
 * @param coachName - Name of the coach for calendar title
 * @param events - Array of calendar events
 * @param timezone - IANA timezone string (defaults to DEFAULT_TIMEZONE)
 */
export function generateCoachCalendar(
  coachName: string,
  events: ICalEvent[],
  timezone?: string
): string {
  return generateICalendar({
    name: `${coachName} - Coaching Calendar`,
    description: `Coaching calendar for ${coachName}`,
    timezone: getValidTimezone(timezone),
    events,
    productId: 'COACH',
    refreshInterval: 30, // Coaches refresh more frequently
  });
}



/**
 * Convert database event to ICalEvent
 */
export function convertToICalEvent(dbEvent: CalendarEventRow): ICalEvent {
  const startDate = parseISO(dbEvent.start_date);
  let endDate: Date | undefined;

  if (dbEvent.end_date) {
    endDate = parseISO(dbEvent.end_date);
  } else if (dbEvent.start_time && dbEvent.end_time) {
    // LANDMINE — READ BEFORE WIRING A NEW CALLER.
    //
    // `setHours` resolves in the RUNTIME zone, and `formatDateTime` below emits
    // `yyyyMMdd'T'HHmmss'Z'` — a UTC instant. Local getter, UTC consumer, in one
    // path: a 09:00 event would be published to the subscriber's calendar as
    // 09:00Z, which is 05:00 Eastern.
    //
    // This branch is UNREACHABLE today, which is the only reason it is not a
    // live bug. Its single caller — the coach feed at
    // `api/calendar/coach/[token]/route.ts` — passes `start_time: null` and
    // `end_time: null`, so the guard above always takes the `parseISO(end_date)`
    // path, which IS zone-correct. The player feed does not call this function
    // at all.
    //
    // A caller that populates start_time/end_time silently ships wrong times to
    // every subscribed calendar. Fix it with `wallClockInZone` from
    // `@/lib/golf/timezone` and the team's zone (see `availability.ts`) BEFORE
    // wiring one, not after.
    const [startHour, startMin] = (dbEvent.start_time || '00:00').split(':');
    const [endHour, endMin] = (dbEvent.end_time || '00:00').split(':');

    startDate.setHours(parseInt(startHour || '0'), parseInt(startMin || '0'));
    endDate = new Date(startDate);
    endDate.setHours(parseInt(endHour || '0'), parseInt(endMin || '0'));
  }

  return {
    id: dbEvent.id,
    title: dbEvent.title,
    description: dbEvent.description ?? undefined,
    location: dbEvent.location ?? dbEvent.course_name ?? undefined,
    startDate,
    endDate,
    allDay: dbEvent.all_day || false,
    recurrenceRule: dbEvent.recurrence_rule ?? undefined,
    createdAt: dbEvent.created_at ? parseISO(dbEvent.created_at) : undefined,
    updatedAt: dbEvent.updated_at ? parseISO(dbEvent.updated_at) : undefined,
  };
}
