import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { getValidTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';

/**
 * Calendar Feed API Route
 *
 * Generates iCalendar (.ics) format feeds for calendar subscription.
 * Uses token-based auth (no session required) so external calendar apps
 * (Google Calendar, Apple Calendar, Outlook) can fetch via webcal:// protocol.
 *
 * SECURITY: Uses admin client to bypass RLS because calendar apps cannot
 * send session cookies. The feed_token IS the auth — validated against
 * golf_calendar_feeds table. Tokens are 256-bit random hex strings.
 */

// ============================================================================
// RATE LIMITING
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 60;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);

  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetAt) {
        rateLimitMap.delete(key);
      }
    }
  }

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(token, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// ============================================================================
// TYPES
// ============================================================================

interface CalendarFeed {
  id: string;
  feed_token: string;
  feed_type: string;
  team_id: string | null;
  user_id: string;
  name: string | null;
  is_active: boolean;
  last_synced_at: string | null;
}

interface CalendarFeedEvent {
  id: string;
  start_time: string;
  end_time: string | null;
  title: string;
  description: string | null;
  location: string | null;
  event_type: string | null;
  all_day: boolean | null;
  status: string | null;
}

interface TeamAuthRpcClient {
  rpc(
    name: 'is_user_on_team',
    args: { p_user_id: string; p_team_id: string },
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
}

// ============================================================================
// ICAL GENERATION
// ============================================================================

function formatICalDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatICalDateOnly(dateStr: string): string {
  const date = new Date(dateStr);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function escapeICalText(text: string | null): string {
  if (!text) return '';
  return text.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

function generateVEvent(event: CalendarFeedEvent): string {
  const lines: string[] = [];

  lines.push('BEGIN:VEVENT');
  lines.push(`UID:${event.id}@helm-golf`);
  lines.push(`DTSTAMP:${formatICalDate(new Date().toISOString())}`);

  if (event.all_day) {
    lines.push(`DTSTART;VALUE=DATE:${formatICalDateOnly(event.start_time)}`);
    if (event.end_time) {
      lines.push(`DTEND;VALUE=DATE:${formatICalDateOnly(event.end_time)}`);
    }
  } else {
    lines.push(`DTSTART:${formatICalDate(event.start_time)}`);
    lines.push(`DTEND:${formatICalDate(event.end_time || event.start_time)}`);
  }

  lines.push(`SUMMARY:${escapeICalText(event.title)}`);

  if (event.description) {
    lines.push(`DESCRIPTION:${escapeICalText(event.description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICalText(event.location)}`);
  }

  if (event.status) {
    const icalStatus = event.status === 'confirmed' ? 'CONFIRMED' :
                       event.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE';
    lines.push(`STATUS:${icalStatus}`);
  }

  if (event.event_type) {
    lines.push(`CATEGORIES:${escapeICalText(event.event_type)}`);
  }

  lines.push('END:VEVENT');

  return lines.join('\r\n');
}

function generateICal(events: CalendarFeedEvent[], feedName: string, timezone: string): string {
  const lines: string[] = [];

  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//Helm Sports//Golf Calendar//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push('METHOD:PUBLISH');
  lines.push(`X-WR-CALNAME:${escapeICalText(feedName)}`);
  lines.push(`X-WR-TIMEZONE:${timezone}`);
  lines.push('X-WR-CALDESC:Helm Sports Golf Calendar Feed');
  lines.push('REFRESH-INTERVAL;VALUE=DURATION:PT60M');
  lines.push('X-PUBLISHED-TTL:PT60M');

  for (const event of events) {
    lines.push(generateVEvent(event));
  }

  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return new NextResponse('Invalid feed token', { status: 400 });
    }

    if (!checkRateLimit(token)) {
      return new NextResponse('Rate limit exceeded', { status: 429 });
    }

    // Use admin client to bypass RLS — calendar apps have no session.
    // The feed_token IS the authentication credential.
    const supabase = createAdminClient();

    // Look up the feed by token
    const { data: feed, error: feedError } = await supabase
      .from('golf_calendar_feeds')
      .select('id, feed_token, feed_type, team_id, user_id, name, is_active, last_synced_at')
      .eq('feed_token', token)
      .eq('is_active', true)
      .single();

    if (feedError || !feed) {
      return new NextResponse('Invalid or inactive feed', { status: 404 });
    }

    const typedFeed = feed as unknown as CalendarFeed;

    if (typedFeed.team_id) {
      // Generated Supabase types lag this hotfix migration until db:types runs.
      const { data: authorized, error: authError } = await (supabase as unknown as TeamAuthRpcClient).rpc('is_user_on_team', {
        p_user_id: typedFeed.user_id,
        p_team_id: typedFeed.team_id,
      });

      if (authError || authorized !== true) {
        return new NextResponse('Invalid or inactive feed', { status: 404 });
      }
    }

    // Update last_synced_at (fire-and-forget, don't block response)
    void supabase
      .from('golf_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', typedFeed.id)
      .then(() => {});

    // Build events query scoped to the feed's team
    let eventsQuery = supabase
      .from('golf_events')
      .select('id, title, description, location, event_type, start_time, end_time, all_day, status')
      .order('start_time', { ascending: true });

    // All feed types must be scoped to a team for security
    if (typedFeed.team_id) {
      eventsQuery = eventsQuery.eq('team_id', typedFeed.team_id);
    } else {
      // No team_id means we can't scope events — return empty calendar
      const emptyContent = generateICal([], typedFeed.name || 'Helm Golf Calendar', DEFAULT_TIMEZONE);
      return new NextResponse(emptyContent, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    }

    // Additional filtering by feed type
    if (typedFeed.feed_type === 'tournaments' || typedFeed.feed_type === 'tournament') {
      eventsQuery = eventsQuery.eq('event_type', 'tournament');
    } else if (typedFeed.feed_type === 'practices') {
      eventsQuery = eventsQuery.eq('event_type', 'practice');
    } else if (typedFeed.feed_type === 'qualifying') {
      eventsQuery = eventsQuery.eq('event_type', 'qualifying');
    }
    // 'all_events' — no additional filter needed

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      return new NextResponse('Failed to fetch events', { status: 500 });
    }

    // Get team timezone
    let feedTimezone = DEFAULT_TIMEZONE;
    const { data: teamSettings } = await supabase
      .from('golf_team_settings')
      .select('timezone')
      .eq('team_id', typedFeed.team_id)
      .maybeSingle();

    feedTimezone = getValidTimezone(teamSettings?.timezone);

    const feedName = typedFeed.name || 'Helm Golf Calendar';
    const icalContent = generateICal((events || []) as CalendarFeedEvent[], feedName, feedTimezone);

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="helm-golf-calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new NextResponse('Internal server error', { status: 500 });
  }
}
