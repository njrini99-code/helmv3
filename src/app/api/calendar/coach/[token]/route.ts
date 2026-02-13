/**
 * Coach Calendar iCal Feed API Route
 *
 * Generates iCal feed for a coach's team events.
 * Uses token-based auth via golf_calendar_feeds — no session required,
 * so external calendar apps (Google, Apple, Outlook) can fetch via webcal://.
 *
 * The token is looked up in golf_calendar_feeds. The feed's user_id is matched
 * to a golf_coaches record to resolve the team and timezone.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCoachCalendar, convertToICalEvent } from '@/lib/calendar/ical';
import { getValidTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';
import { addMonths, format } from 'date-fns';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token || token.length < 32) {
      return new NextResponse('Invalid feed token', { status: 400 });
    }

    // Admin client bypasses RLS — the feed token IS the auth credential
    const supabase = createAdminClient();

    // Look up the feed by token
    const { data: feed, error: feedError } = await supabase
      .from('golf_calendar_feeds')
      .select('id, user_id, team_id, name, is_active')
      .eq('feed_token', token)
      .eq('is_active', true)
      .single();

    if (feedError || !feed) {
      return new NextResponse('Invalid or disabled feed', { status: 404 });
    }

    // Find the coach profile for this user
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, full_name, organization_id')
      .eq('user_id', feed.user_id)
      .single();

    if (!coach) {
      return new NextResponse('Coach profile not found', { status: 404 });
    }

    // Resolve team_id: prefer feed.team_id, fall back to coach's org → team
    let teamId = feed.team_id;
    if (!teamId && coach.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      teamId = team?.id ?? null;
    }

    // Get team timezone
    let teamTimezone = DEFAULT_TIMEZONE;
    if (teamId) {
      const { data: settings } = await supabase
        .from('golf_team_settings')
        .select('timezone')
        .eq('team_id', teamId)
        .maybeSingle();
      teamTimezone = getValidTimezone(settings?.timezone);
    }

    // Get team events (6 months range) — scoped to team, not just coach-created
    const today = new Date();
    const startDate = addMonths(today, -3);
    const endDate = addMonths(today, 3);

    let eventsQuery = supabase
      .from('golf_events')
      .select('*')
      .gte('start_time', format(startDate, 'yyyy-MM-dd'))
      .lte('start_time', format(endDate, 'yyyy-MM-dd'))
      .order('start_time', { ascending: true });

    if (teamId) {
      eventsQuery = eventsQuery.eq('team_id', teamId);
    } else {
      // Fallback: only events this coach created
      eventsQuery = eventsQuery.eq('created_by', coach.id);
    }

    const { data: events } = await eventsQuery;

    const iCalEvents = (events || []).map((event) => convertToICalEvent({
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      course_name: null,
      start_date: event.start_time,
      end_date: event.end_time,
      start_time: null,
      end_time: null,
      all_day: event.all_day,
      recurrence_rule: event.recurrence_rule,
      created_at: event.created_at,
      updated_at: event.updated_at,
    }));

    const coachName = coach.full_name || 'Coach';
    const icalContent = generateCoachCalendar(coachName, iCalEvents, teamTimezone);

    // Update last_synced_at (fire-and-forget)
    void supabase
      .from('golf_calendar_feeds')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', feed.id)
      .then(() => {});

    return new NextResponse(icalContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${coachName.replace(/[^a-z0-9]/gi, '_')}_calendar.ics"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch {
    return new NextResponse('Internal server error', { status: 500 });
  }
}
