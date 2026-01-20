import { createClient } from '@/lib/supabase/server';
import type { GolfEvent } from '@/lib/types/golf';
import { NextRequest, NextResponse } from 'next/server';
import { getValidTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';

/**
 * Calendar Feed API Route
 *
 * Generates iCalendar (.ics) format feeds for calendar subscription
 * Supports webcal:// protocol for universal calendar app compatibility
 *
 * Feed types:
 * - team: All team events
 * - personal: User's personal events
 * - tournament: Tournament events only
 * - all: All events user has access to
 *
 * NOTE: This feature requires the golf_calendar_feeds table to be created.
 * The table schema should include: id, feed_token, feed_type, team_id, name, is_active, last_synced_at
 */

// ============================================================================
// RATE LIMITING
// ============================================================================

// Simple in-memory rate limiting (resets on server restart)
// For production, consider using Redis or a similar persistent store
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60; // requests per minute per token
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute

/**
 * Check if request should be rate limited
 * @param token - The feed token being requested
 * @returns true if request is allowed, false if rate limited
 */
function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);

  // Clean up old entries periodically (every 100th check)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }

  // New token or expired window - allow and start fresh
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  // Check if over limit
  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  // Increment and allow
  entry.count++;
  return true;
}

// Type for calendar feed (not yet in database types)
interface CalendarFeed {
  id: string;
  feed_token: string;
  feed_type: 'team' | 'personal' | 'tournament' | 'all';
  team_id: string | null;
  name: string | null;
  is_active: boolean;
  last_synced_at: string | null;
}

// CalendarFeedEvent type - using fields that actually exist in golf_events
// Note: golf_events has start_time/end_time, not start_date/end_date
type CalendarFeedEvent = Pick<
  GolfEvent,
  | 'id'
  | 'start_time'
  | 'end_time'
  | 'title'
  | 'description'
  | 'location'
  | 'event_type'
> & {
  status?: string | null;
};

// Helper to format date for iCal (YYYYMMDDTHHMMSSZ format)
function formatICalDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Helper to escape iCal text
function escapeICalText(text: string | null): string {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

// Generate iCal VEVENT component
function generateVEvent(event: CalendarFeedEvent): string {
  const lines: string[] = [];

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${event.id}@helm-golf`);
  lines.push(`DTSTAMP:${formatICalDate(new Date().toISOString())}`);
  lines.push(`DTSTART:${formatICalDate(event.start_time)}`);
  lines.push(`DTEND:${formatICalDate(event.end_time || event.start_time)}`);
  lines.push(`SUMMARY:${escapeICalText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  // Add status if available
  if (event.status) {
    const icalStatus = event.status === 'confirmed' ? 'CONFIRMED' :
                       event.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE';
    lines.push(`STATUS:${icalStatus}`);
  }

  // Add event type as category
  if (event.event_type) {
    lines.push(`CATEGORIES:${escapeICalText(event.event_type)}`);
  }

  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

// Generate complete iCal document
function generateICal(events: CalendarFeedEvent[], feedName: string, timezone: string): string {
  const lines: string[] = [];

  // iCal header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Helm Sports//Golf Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalText(feedName)}`);
  lines.push(`X-WR-TIMEZONE:${timezone}`);
  lines.push('X-WR-CALDESC:Helm Sports Golf Calendar Feed');

  // Add all events
  events.forEach(event => {
    lines.push(generateVEvent(event));
  });

  // iCal footer
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json({ error: 'Feed token required' }, { status: 400 });
    }

    // Rate limit check
    if (!checkRateLimit(token)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      );
    }

    const supabase = await createClient();

    // Look up the feed by token
    // Note: golf_calendar_feeds table may not exist yet - using type cast
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: feedData, error: feedError } = await (supabase as any)
      .from('golf_calendar_feeds')
      .select('*')
      .eq('feed_token', token)
      .eq('is_active', true)
      .single();

    const feed = feedData as CalendarFeed | null;

    if (feedError || !feed) {
      return NextResponse.json({ error: 'Invalid or inactive feed' }, { status: 404 });
    }

    // Update last_synced_at
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', feed.id);

    // Build events query based on feed type
    // Note: golf_events uses start_time, not start_date
    let eventsQuery = supabase
      .from('golf_events')
      .select('*')
      .order('start_time', { ascending: true });

    switch (feed.feed_type) {
      case 'team':
        if (!feed.team_id) {
          return NextResponse.json({ error: 'Team feed requires team_id' }, { status: 400 });
        }
        eventsQuery = eventsQuery.eq('team_id', feed.team_id);
        break;

      case 'personal':
        // Personal events would need additional filtering logic
        // For now, filter by user's team
        if (feed.team_id) {
          eventsQuery = eventsQuery.eq('team_id', feed.team_id);
        }
        break;

      case 'tournament':
        eventsQuery = eventsQuery
          .eq('event_type', 'tournament')
          .eq('team_id', feed.team_id || '');
        break;

      case 'all':
        // All events the user has access to
        if (feed.team_id) {
          eventsQuery = eventsQuery.eq('team_id', feed.team_id);
        }
        break;
    }

    // Note: golf_events doesn't have a status column, so we fetch all events
    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Get team timezone from team settings
    let feedTimezone = DEFAULT_TIMEZONE;
    if (feed.team_id) {
      const { data: teamSettings } = await supabase
        .from('golf_team_settings')
        .select('timezone')
        .eq('team_id', feed.team_id)
        .maybeSingle();

      feedTimezone = getValidTimezone(teamSettings?.timezone);
    }

    // Generate iCal content with proper timezone
    const feedName = feed.name || 'Helm Golf Calendar';
    const icalContent = generateICal((events || []) as unknown as CalendarFeedEvent[], feedName, feedTimezone);

    // Return iCal file with appropriate headers
    return new NextResponse(icalContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${feed.feed_type}-calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Calendar feed error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
