import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

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
 */

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
function generateVEvent(event: any): string {
  const lines: string[] = [];

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${event.id}@helm-golf`);
  lines.push(`DTSTAMP:${formatICalDate(new Date().toISOString())}`);
  lines.push(`DTSTART:${formatICalDate(event.start_time || event.start_date)}`);
  lines.push(`DTEND:${formatICalDate(event.end_time || event.end_date || event.start_time || event.start_date)}`);
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
function generateICal(events: any[], feedName: string): string {
  const lines: string[] = [];

  // iCal header
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Helm Sports//Golf Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalText(feedName)}`);
  lines.push('X-WR-TIMEZONE:UTC');
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
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json({ error: 'Feed token required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Look up the feed by token
    const { data: feed, error: feedError } = await supabase
      .from('golf_calendar_feeds')
      .select('*')
      .eq('feed_token', token)
      .eq('is_active', true)
      .single();

    if (feedError || !feed) {
      return NextResponse.json({ error: 'Invalid or inactive feed' }, { status: 404 });
    }

    // Update last_synced_at
    await supabase
      .from('golf_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', feed.id);

    // Build events query based on feed type
    let eventsQuery = supabase
      .from('golf_events')
      .select('*')
      .order('start_date', { ascending: true });

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

    // Only include confirmed and draft events (not cancelled)
    eventsQuery = eventsQuery.neq('status', 'cancelled');

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('Error fetching events:', eventsError);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    // Generate iCal content
    const feedName = feed.name || 'Helm Golf Calendar';
    const icalContent = generateICal(events || [], feedName);

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
