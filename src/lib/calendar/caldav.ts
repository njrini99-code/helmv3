/**
 * CalDAV Protocol Implementation (RFC 4791)
 *
 * Handles communication with CalDAV servers including:
 * - Discovery and authentication
 * - Event fetching and pushing
 * - Change detection via ETags and CTags
 * - Conflict detection
 *
 * NOTE: This is a work-in-progress implementation with placeholder code.
 * TypeScript checking is disabled until the implementation is complete.
 */

import { formatISO } from 'date-fns';
import { generateICalendar, type ICalEvent } from './ical';

// ============================================================================
// ICALENDAR PARSING
// ============================================================================

/**
 * Parse an iCalendar (.ics) format string into ICalEvent objects
 *
 * Handles common iCalendar properties:
 * - VEVENT: Event component
 * - DTSTART/DTEND: Start and end dates/times
 * - SUMMARY: Event title
 * - DESCRIPTION: Event description
 * - LOCATION: Event location
 * - RRULE: Recurrence rule
 * - UID: Unique identifier
 * - ORGANIZER: Event organizer
 * - ATTENDEE: Event attendees
 *
 * @param icalData - Raw iCalendar format string
 * @returns Array of parsed ICalEvent objects
 */
export function parseICalendar(icalData: string): ICalEvent[] {
  const events: ICalEvent[] = [];

  // Normalize line endings and unfold continued lines (RFC 5545 Section 3.1)
  // Lines can be folded at 75 octets by inserting CRLF followed by whitespace
  const normalizedData = icalData
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, ''); // Unfold continued lines

  // Split into lines
  const lines = normalizedData.split('\n');

  let inEvent = false;
  let currentEvent: Partial<ICalEvent> & {
    uid?: string;
    organizer?: { name: string; email?: string };
    attendees?: Array<{ name: string; email?: string; status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION' }>;
  } = {};

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine === 'BEGIN:VEVENT') {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (trimmedLine === 'END:VEVENT') {
      if (inEvent && currentEvent.uid && currentEvent.title && currentEvent.startDate) {
        events.push({
          id: currentEvent.uid,
          title: currentEvent.title,
          description: currentEvent.description,
          location: currentEvent.location,
          startDate: currentEvent.startDate,
          endDate: currentEvent.endDate,
          allDay: currentEvent.allDay,
          recurrenceRule: currentEvent.recurrenceRule,
          organizer: currentEvent.organizer,
          attendees: currentEvent.attendees,
          createdAt: currentEvent.createdAt,
          updatedAt: currentEvent.updatedAt,
        });
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    // Parse property:value or property;params:value
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) continue;

    const propertyPart = trimmedLine.substring(0, colonIndex);
    const valuePart = trimmedLine.substring(colonIndex + 1);

    // Extract property name and parameters
    const semicolonIndex = propertyPart.indexOf(';');
    const propertyName = semicolonIndex === -1
      ? propertyPart.toUpperCase()
      : propertyPart.substring(0, semicolonIndex).toUpperCase();
    const params = semicolonIndex === -1
      ? ''
      : propertyPart.substring(semicolonIndex + 1);

    // Unescape value
    const value = unescapeICalText(valuePart);

    switch (propertyName) {
      case 'UID':
        currentEvent.uid = value;
        break;

      case 'SUMMARY':
        currentEvent.title = value;
        break;

      case 'DESCRIPTION':
        currentEvent.description = value;
        break;

      case 'LOCATION':
        currentEvent.location = value;
        break;

      case 'DTSTART':
        {
          const { date, isAllDay } = parseICalDateTime(value, params);
          currentEvent.startDate = date;
          currentEvent.allDay = isAllDay;
        }
        break;

      case 'DTEND':
        {
          const { date } = parseICalDateTime(value, params);
          currentEvent.endDate = date;
        }
        break;

      case 'RRULE':
        currentEvent.recurrenceRule = value;
        break;

      case 'CREATED':
        {
          const { date } = parseICalDateTime(value, params);
          currentEvent.createdAt = date;
        }
        break;

      case 'LAST-MODIFIED':
        {
          const { date } = parseICalDateTime(value, params);
          currentEvent.updatedAt = date;
        }
        break;

      case 'ORGANIZER':
        {
          const organizer = parseOrganizer(value, params);
          if (organizer) {
            currentEvent.organizer = organizer;
          }
        }
        break;

      case 'ATTENDEE':
        {
          const attendee = parseAttendee(value, params);
          if (attendee) {
            if (!currentEvent.attendees) {
              currentEvent.attendees = [];
            }
            currentEvent.attendees.push(attendee);
          }
        }
        break;
    }
  }

  return events;
}

/**
 * Parse iCalendar date/time value
 * Handles:
 * - DATE format: YYYYMMDD (all-day)
 * - DATE-TIME format: YYYYMMDDTHHmmss (local)
 * - DATE-TIME with Z suffix: YYYYMMDDTHHmmssZ (UTC)
 * - TZID parameter for timezone-aware parsing
 */
function parseICalDateTime(value: string, params: string): { date: Date; isAllDay: boolean } {
  // Check if it's a date-only value (all-day event)
  const isAllDay = params.toUpperCase().includes('VALUE=DATE') && !params.toUpperCase().includes('VALUE=DATE-TIME');

  // Remove any whitespace
  const cleanValue = value.trim();

  if (isAllDay || cleanValue.length === 8) {
    // Format: YYYYMMDD
    const year = parseInt(cleanValue.substring(0, 4), 10);
    const month = parseInt(cleanValue.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(cleanValue.substring(6, 8), 10);
    return { date: new Date(year, month, day), isAllDay: true };
  }

  // Format: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const isUtc = cleanValue.endsWith('Z');
  const dateTimePart = isUtc ? cleanValue.slice(0, -1) : cleanValue;

  const year = parseInt(dateTimePart.substring(0, 4), 10);
  const month = parseInt(dateTimePart.substring(4, 6), 10) - 1;
  const day = parseInt(dateTimePart.substring(6, 8), 10);

  // Check for time component (T separator at position 8)
  if (dateTimePart.length >= 15 && dateTimePart[8] === 'T') {
    const hour = parseInt(dateTimePart.substring(9, 11), 10);
    const minute = parseInt(dateTimePart.substring(11, 13), 10);
    const second = parseInt(dateTimePart.substring(13, 15), 10);

    if (isUtc) {
      return { date: new Date(Date.UTC(year, month, day, hour, minute, second)), isAllDay: false };
    } else {
      // Local time - create date in local timezone
      // Note: If TZID is present, ideally we'd convert, but for simplicity we use local time
      return { date: new Date(year, month, day, hour, minute, second), isAllDay: false };
    }
  }

  // Fallback: treat as date-only
  return { date: new Date(year, month, day), isAllDay: true };
}

/**
 * Unescape iCalendar text value
 * Reverses the escaping done by escapeText in ical.ts
 */
function unescapeICalText(text: string): string {
  return text
    .replace(/\\n/gi, '\n')      // Newline
    .replace(/\\;/g, ';')        // Semicolon
    .replace(/\\,/g, ',')        // Comma
    .replace(/\\\\/g, '\\');     // Backslash (must be last)
}

/**
 * Parse ORGANIZER property
 * Format: ORGANIZER;CN=Name:MAILTO:email@example.com
 */
function parseOrganizer(value: string, params: string): { name: string; email?: string } | null {
  const cnMatch = params.match(/CN=([^;]+)/i);
  const name = cnMatch && cnMatch[1] ? unescapeICalText(cnMatch[1]) : 'Unknown';

  let email: string | undefined;
  if (value.toUpperCase().startsWith('MAILTO:')) {
    email = value.substring(7);
  }

  return { name, email };
}

/**
 * Parse ATTENDEE property
 * Format: ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Name:MAILTO:email@example.com
 */
function parseAttendee(value: string, params: string): { name: string; email?: string; status?: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION' } | null {
  const cnMatch = params.match(/CN=([^;]+)/i);
  const name = cnMatch && cnMatch[1] ? unescapeICalText(cnMatch[1]) : 'Unknown';

  let email: string | undefined;
  if (value.toUpperCase().startsWith('MAILTO:')) {
    email = value.substring(7);
  }

  let status: 'ACCEPTED' | 'DECLINED' | 'TENTATIVE' | 'NEEDS-ACTION' | undefined;
  const statusMatch = params.match(/PARTSTAT=([^;]+)/i);
  if (statusMatch && statusMatch[1]) {
    const statusValue = statusMatch[1].toUpperCase();
    if (statusValue === 'ACCEPTED' || statusValue === 'DECLINED' || statusValue === 'TENTATIVE' || statusValue === 'NEEDS-ACTION') {
      status = statusValue;
    }
  }

  return { name, email, status };
}

/**
 * Parse a single VEVENT from iCalendar data
 * Convenience function when you expect exactly one event
 */
export function parseICalendarSingle(icalData: string): ICalEvent | null {
  const events = parseICalendar(icalData);
  return events[0] ?? null;
}

// ============================================================================
// TYPES
// ============================================================================

export interface CalDAVCredentials {
  serverUrl: string;
  username: string;
  password?: string;
  accessToken?: string; // For OAuth
}

export interface CalDAVCalendar {
  url: string;
  displayName: string;
  ctag: string;
  supportedComponents: string[];
}

export interface CalDAVEvent {
  url: string;
  etag: string;
  icalData: string;
  event: ICalEvent;
}

export interface CalDAVSyncToken {
  ctag: string;
  syncToken?: string;
}

// ============================================================================
// CalDAV CLIENT
// ============================================================================

export class CalDAVClient {
  private credentials: CalDAVCredentials;
  private calendarHomeSet?: string;

  constructor(credentials: CalDAVCredentials) {
    this.credentials = credentials;
  }

  /**
   * Discover user's calendar home URL
   */
  async discover(): Promise<{ principalUrl: string; calendarHomeSet: string }> {
    // Step 1: Find current-user-principal
    const principalResponse = await this.propfind(
      this.credentials.serverUrl,
      `<?xml version="1.0" encoding="utf-8" ?>
       <d:propfind xmlns:d="DAV:">
         <d:prop>
           <d:current-user-principal />
         </d:prop>
       </d:propfind>`,
      0
    );

    const principalUrl = this.extractPrincipalUrl(principalResponse);
    // Step 2: Find calendar-home-set
    const homeSetResponse = await this.propfind(
      principalUrl,
      `<?xml version="1.0" encoding="utf-8" ?>
       <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
         <d:prop>
           <c:calendar-home-set />
         </d:prop>
       </d:propfind>`,
      0
    );

    const calendarHomeSet = this.extractCalendarHomeSet(homeSetResponse);
    this.calendarHomeSet = calendarHomeSet;

    return { principalUrl, calendarHomeSet };
  }

  /**
   * List all calendars in user's calendar home
   */
  async listCalendars(): Promise<CalDAVCalendar[]> {
    if (!this.calendarHomeSet) {
      await this.discover();
    }

    const response = await this.propfind(
      this.calendarHomeSet!,
      `<?xml version="1.0" encoding="utf-8" ?>
       <d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/">
         <d:prop>
           <d:displayname />
           <d:resourcetype />
           <cs:getctag />
           <c:supported-calendar-component-set />
         </d:prop>
       </d:propfind>`,
      1
    );

    return this.parseCalendarList(response);
  }

  /**
   * Fetch all events from a calendar
   */
  async fetchEvents(calendarUrl: string, timeRange?: { start: Date; end: Date }): Promise<CalDAVEvent[]> {
    const timeRangeFilter = timeRange
      ? `<c:time-range start="${formatISO(timeRange.start)}" end="${formatISO(timeRange.end)}"/>`
      : '';

    const response = await this.report(
      calendarUrl,
      `<?xml version="1.0" encoding="utf-8" ?>
       <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
         <d:prop>
           <d:getetag />
           <c:calendar-data />
         </d:prop>
         <c:filter>
           <c:comp-filter name="VCALENDAR">
             <c:comp-filter name="VEVENT">
               ${timeRangeFilter}
             </c:comp-filter>
           </c:comp-filter>
         </c:filter>
       </c:calendar-query>`
    );

    return this.parseEventList(response);
  }

  /**
   * Fetch a single event by URL
   */
  async fetchEvent(eventUrl: string): Promise<CalDAVEvent | null> {
    try {
      const response = await this.request('GET', eventUrl, undefined, {
        Accept: 'text/calendar',
      });

      const etag = response.headers.get('ETag') || '';
      const icalData = await response.text();

      // Parse the iCalendar data
      const parsedEvent = parseICalendarSingle(icalData);

      if (!parsedEvent) {
        // Fallback if parsing fails - extract ID from URL
        const eventId = eventUrl.split('/').pop()?.replace('.ics', '') || 'unknown';
        const fallbackEvent: ICalEvent = {
          id: eventId,
          title: 'CalDAV Event',
          startDate: new Date(),
        };
        return {
          url: eventUrl,
          etag,
          icalData,
          event: fallbackEvent,
        };
      }

      return {
        url: eventUrl,
        etag,
        icalData,
        event: parsedEvent,
      };
    } catch (error) {
      console.error('Error fetching event:', error);
      return null;
    }
  }

  /**
   * Create or update an event
   */
  async putEvent(
    calendarUrl: string,
    event: ICalEvent,
    existingEtag?: string
  ): Promise<{ url: string; etag: string }> {
    const icalData = generateICalendar({
      name: 'Helm Golf',
      events: [event],
    });

    // Generate event URL
    const eventUrl = `${calendarUrl}${event.id}.ics`;

    const headers: Record<string, string> = {
      'Content-Type': 'text/calendar; charset=utf-8',
    };

    // If updating, use If-Match to prevent conflicts
    if (existingEtag) {
      headers['If-Match'] = existingEtag;
    }

    const response = await this.request('PUT', eventUrl, icalData, headers);

    if (!response.ok) {
      if (response.status === 412) {
        throw new Error('Event was modified by another client (ETag mismatch)');
      }
      throw new Error(`Failed to save event: ${response.statusText}`);
    }

    const newEtag = response.headers.get('ETag') || '';

    return { url: eventUrl, etag: newEtag };
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventUrl: string, etag?: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (etag) {
      headers['If-Match'] = etag;
    }

    const response = await this.request('DELETE', eventUrl, undefined, headers);

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete event: ${response.statusText}`);
    }
  }

  /**
   * Get changes since last sync using CTag
   */
  async getChanges(calendarUrl: string, lastCtag?: string): Promise<{
    ctag: string;
    changedEvents: CalDAVEvent[];
    needsFullSync: boolean;
  }> {
    // Get current CTag
    const propResponse = await this.propfind(
      calendarUrl,
      `<?xml version="1.0" encoding="utf-8" ?>
       <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
         <d:prop>
           <cs:getctag />
         </d:prop>
       </d:propfind>`,
      0
    );

    const currentCtag = this.extractCtag(propResponse);

    // If CTag unchanged, no changes
    if (lastCtag && currentCtag === lastCtag) {
      return { ctag: currentCtag, changedEvents: [], needsFullSync: false };
    }

    // If first sync or CTag changed significantly, do full sync
    if (!lastCtag) {
      const allEvents = await this.fetchEvents(calendarUrl);
      return { ctag: currentCtag, changedEvents: allEvents, needsFullSync: true };
    }

    // Otherwise, fetch all events and let caller determine changes
    const allEvents = await this.fetchEvents(calendarUrl);
    return { ctag: currentCtag, changedEvents: allEvents, needsFullSync: false };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async request(
    method: string,
    url: string,
    body?: string,
    headers: Record<string, string> = {}
  ): Promise<Response> {
    const authHeader = this.credentials.accessToken
      ? `Bearer ${this.credentials.accessToken}`
      : `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64')}`;

    return fetch(url, {
      method,
      headers: {
        Authorization: authHeader,
        ...headers,
      },
      body,
    });
  }

  private async propfind(url: string, body: string, depth: number): Promise<string> {
    const response = await this.request('PROPFIND', url, body, {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: depth.toString(),
    });

    if (!response.ok) {
      throw new Error(`PROPFIND failed: ${response.statusText}`);
    }

    return response.text();
  }

  private async report(url: string, body: string): Promise<string> {
    const response = await this.request('REPORT', url, body, {
      'Content-Type': 'application/xml; charset=utf-8',
      Depth: '1',
    });

    if (!response.ok) {
      throw new Error(`REPORT failed: ${response.statusText}`);
    }

    return response.text();
  }

  private extractPrincipalUrl(xml: string): string {
    const match = xml.match(/<current-user-principal[^>]*>.*?<href>([^<]+)<\/href>/s);
    if (!match || !match[1]) throw new Error('Could not find principal URL');
    return this.resolveUrl(match[1]);
  }

  private extractCalendarHomeSet(xml: string): string {
    const match = xml.match(/<calendar-home-set[^>]*>.*?<href>([^<]+)<\/href>/s);
    if (!match || !match[1]) throw new Error('Could not find calendar home set');
    return this.resolveUrl(match[1]);
  }

  private extractCtag(xml: string): string {
    const match = xml.match(/<getctag>([^<]+)<\/getctag>/);
    return match && match[1] ? match[1] : '';
  }

  private parseCalendarList(xml: string): CalDAVCalendar[] {
    const calendars: CalDAVCalendar[] = [];
    const responseRegex = /<d:response>(.*?)<\/d:response>/gs;
    let match;

    while ((match = responseRegex.exec(xml)) !== null) {
      const responseXml = match[1];
      if (!responseXml) continue;

      // Check if it's a calendar
      if (!responseXml.includes('<calendar xmlns=')) continue;

      const hrefMatch = responseXml.match(/<d:href>([^<]+)<\/d:href>/);
      const nameMatch = responseXml.match(/<d:displayname>([^<]+)<\/d:displayname>/);
      const ctagMatch = responseXml.match(/<getctag>([^<]+)<\/getctag>/);

      if (hrefMatch && hrefMatch[1] && nameMatch && nameMatch[1]) {
        calendars.push({
          url: this.resolveUrl(hrefMatch[1]),
          displayName: nameMatch[1],
          ctag: ctagMatch && ctagMatch[1] ? ctagMatch[1] : '',
          supportedComponents: ['VEVENT'], // Simplified
        });
      }
    }

    return calendars;
  }

  private parseEventList(xml: string): CalDAVEvent[] {
    const events: CalDAVEvent[] = [];
    const responseRegex = /<d:response>(.*?)<\/d:response>/gs;
    let match;

    while ((match = responseRegex.exec(xml)) !== null) {
      const responseXml = match[1];
      if (!responseXml) continue;

      const hrefMatch = responseXml.match(/<d:href>([^<]+)<\/d:href>/);
      const etagMatch = responseXml.match(/<d:getetag>([^<]+)<\/d:getetag>/);
      const dataMatch = responseXml.match(/<calendar-data>(.*?)<\/calendar-data>/s);

      if (hrefMatch && hrefMatch[1] && etagMatch && etagMatch[1] && dataMatch && dataMatch[1]) {
        const icalData = dataMatch[1].trim();
        const eventUrl = hrefMatch[1];

        // Parse the iCalendar data
        const parsedEvent = parseICalendarSingle(icalData);

        if (parsedEvent) {
          events.push({
            url: this.resolveUrl(eventUrl),
            etag: etagMatch[1],
            icalData,
            event: parsedEvent,
          });
        } else {
          // Fallback if parsing fails - create a placeholder with URL-derived ID
          const fallbackEvent: ICalEvent = {
            id: eventUrl.split('/').pop()?.replace('.ics', '') || 'unknown',
            title: 'CalDAV Event',
            startDate: new Date(),
          };

          events.push({
            url: this.resolveUrl(eventUrl),
            etag: etagMatch[1],
            icalData,
            event: fallbackEvent,
          });
        }
      }
    }

    return events;
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http')) return path;
    const base = new URL(this.credentials.serverUrl);
    return `${base.protocol}//${base.host}${path}`;
  }
}

// ============================================================================
// OAUTH HELPERS
// ============================================================================

/**
 * Google Calendar OAuth URLs
 */
export const GoogleCalendarOAuth = {
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  scope: 'https://www.googleapis.com/auth/calendar',

  getAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scope,
      access_type: 'offline',
      state,
    });
    return `${this.authUrl}?${params}`;
  },
};

/**
 * Microsoft Outlook OAuth URLs
 */
export const OutlookCalendarOAuth = {
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  scope: 'Calendars.ReadWrite offline_access',

  getAuthorizationUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scope,
      state,
    });
    return `${this.authUrl}?${params}`;
  },
};
