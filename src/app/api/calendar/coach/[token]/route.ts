/**
 * Coach Calendar iCal Feed API Route
 *
 * Generates iCal feed for a coach's team events.
 * Uses token-based auth via golf_calendar_feeds — no session required,
 * so external calendar apps (Google, Apple, Outlook) can fetch via webcal://.
 *
 * The token is looked up in golf_calendar_feeds. The feed's team_id MUST be
 * coach-staffed by feed.user_id (verified via golf_team_coach_staff). Player
 * memberships do NOT satisfy this endpoint — those go through /api/calendar/feeds.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateCoachCalendar, convertToICalEvent } from '@/lib/calendar/ical';
import { getValidTimezone, DEFAULT_TIMEZONE } from '@/lib/calendar/timezone';
import { addMonths, format } from 'date-fns';
import { logServerException } from '@/lib/server-error-logger';

interface CoachTeamAuthRpcClient {
  rpc(
    name: 'verify_coach_owns_team',
    args: { p_team_id: string; p_user_id: string },
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
}

interface CoachStaffRow {
  coach: { id: string; full_name: string | null; organization_id: string | null } | null;
}

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

    let coach: { id: string; full_name: string | null; organization_id: string | null } | null = null;

    if (feed.team_id) {
      // Coach feed REQUIRES the feed owner to be coach staff on this team.
      // verify_coach_owns_team only returns true for golf_team_coach_staff rows;
      // active players on the team do NOT satisfy it.
      const { data: authorized, error: authError } = await (supabase as unknown as CoachTeamAuthRpcClient).rpc('verify_coach_owns_team', {
        p_team_id: feed.team_id,
        p_user_id: feed.user_id,
      });

      if (authError || authorized !== true) {
        return new NextResponse('Invalid or disabled feed', { status: 404 });
      }

      // Resolve the SPECIFIC coach row staffing this team. For users with
      // multiple coach profiles (multi-org), this picks the one matched via
      // golf_team_coach_staff for the verified team, not an arbitrary row.
      const { data: staffRow } = await supabase
        .from('golf_team_coach_staff')
        .select('coach:golf_coaches!inner(id, full_name, organization_id)')
        .eq('team_id', feed.team_id)
        .eq('coach.user_id', feed.user_id)
        .maybeSingle<CoachStaffRow>();

      coach = staffRow?.coach ?? null;
    } else {
      // No team_id on feed: fall back to coach lookup by user_id.
      // .maybeSingle is intentional — for multi-org users with multiple coach
      // rows, falling back to org-derived team is best-effort only.
      const { data: anyCoach } = await supabase
        .from('golf_coaches')
        .select('id, full_name, organization_id')
        .eq('user_id', feed.user_id)
        .maybeSingle();
      coach = anyCoach;
    }

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
  } catch (error) {
    // NO `url: request.url` here. The feed token is a live, non-expiring
    // bearer credential carried in the URL PATH, and server-error-logger
    // persists context.url verbatim to error_logs.url, admin_events.url and
    // the Sentry `server_trace` context. The static `route` below is the safe
    // value and is what buildUrl() falls back to.
    await logServerException(error, {
      action: 'calendarCoachFeedApi.get',
      route: '/api/calendar/coach/[token]',
      source: 'route_handler',
      sport: 'golf',
      featureArea: 'calendar',
      handled: false,
      statusCode: 500,
    });
    return new NextResponse('Internal server error', { status: 500 });
  }
}
