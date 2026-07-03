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

import { format, parseISO } from 'date-fns';
import {
  getValidTimezone,
} from './timezone';

// ============================================================================
// TYPES
// ============================================================================

export interface ICalEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
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
    // All-day event
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.startDate)}`);
    if (event.endDate) {
      lines.push(`DTEND;VALUE=DATE:${formatDate(event.endDate)}`);
    }
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

/**
 * Format date as YYYYMMDD
 */
function formatDate(date: Date): string {
  return format(date, 'yyyyMMdd');
}

/**
 * Format datetime as YYYYMMDDTHHmmssZ (UTC)
 */
function formatDateTime(date: Date): string {
  const utc = new Date(date.toISOString());
  return format(utc, "yyyyMMdd'T'HHmmss'Z'");
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
    // Same day event with start/end times
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
