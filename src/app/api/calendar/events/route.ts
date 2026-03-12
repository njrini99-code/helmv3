import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { CalendarEvent } from '@/lib/types/calendar';
import { logServerError } from '@/lib/server-error-logger';

/**
 * GET /api/calendar/events
 * Fetch calendar events for the authenticated user (golf_events table)
 */
export async function GET(request: Request) {
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email ?? null;

    // Parse query params
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const teamId = searchParams.get('teamId');

    // Always resolve team membership from the authenticated user's profile.
    // Even if the client supplies a teamId, we verify the user belongs to it.
    let resolvedTeamId: string | null = null;

    // Try to resolve from coach profile
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coachError) {
      await logServerError(`Calendar events GET coach lookup failed: ${coachError.message}`, {
        action: 'calendarEventsApi.get.coachLookup',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: coachError.code,
        errorHint: coachError.hint,
        errorDetails: coachError.details,
      }, 'warning');
    }

    if (coach?.organization_id) {
      const { data: team, error: teamError } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      if (teamError) {
        await logServerError(`Calendar events GET team lookup failed: ${teamError.message}`, {
          action: 'calendarEventsApi.get.teamLookup',
          source: 'route_handler',
          featureArea: 'calendar',
          route: '/api/calendar/events',
          url: request.url,
          userId,
          userEmail,
          errorCode: teamError.code,
          errorHint: teamError.hint,
          errorDetails: teamError.details,
          extra: {
            organizationId: coach.organization_id,
          },
        }, 'warning');
      }
      resolvedTeamId = team?.id ?? null;
    }

    if (!resolvedTeamId) {
      // Try player membership
      const { data: player, error: playerError } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (playerError) {
        await logServerError(`Calendar events GET player lookup failed: ${playerError.message}`, {
          action: 'calendarEventsApi.get.playerLookup',
          source: 'route_handler',
          featureArea: 'calendar',
          route: '/api/calendar/events',
          url: request.url,
          userId,
          userEmail,
          errorCode: playerError.code,
          errorHint: playerError.hint,
          errorDetails: playerError.details,
        }, 'warning');
      }

      if (player) {
        const { data: membership, error: membershipError } = await supabase
          .from('golf_team_members')
          .select('team_id')
          .eq('player_id', player.id)
          .eq('status', 'active')
          .maybeSingle();
        if (membershipError) {
          await logServerError(`Calendar events GET membership lookup failed: ${membershipError.message}`, {
            action: 'calendarEventsApi.get.membershipLookup',
            source: 'route_handler',
            featureArea: 'calendar',
            route: '/api/calendar/events',
            url: request.url,
            userId,
            userEmail,
            errorCode: membershipError.code,
            errorHint: membershipError.hint,
            errorDetails: membershipError.details,
            extra: {
              playerId: player.id,
            },
          }, 'warning');
        }
        resolvedTeamId = membership?.team_id ?? null;
      }
    }

    // If client supplied a teamId, verify it matches the user's team
    if (teamId && resolvedTeamId !== teamId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!resolvedTeamId) {
      return NextResponse.json([] as CalendarEvent[]);
    }

    // Build query scoped to the user's team
    let query = supabase
      .from('golf_events')
      .select('*')
      .eq('team_id', resolvedTeamId)
      .order('start_time', { ascending: true });

    // Filter by date range
    if (startDate) {
      query = query.gte('start_time', startDate);
    }
    if (endDate) {
      query = query.lte('start_time', endDate);
    }

    const { data, error } = await query;

    if (error) {
      await logServerError(`Calendar events GET query failed: ${error.message}`, {
        action: 'calendarEventsApi.get.query',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
        extra: {
          resolvedTeamId,
          startDate,
          endDate,
        },
      }, 'critical');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as unknown as CalendarEvent[]);
  } catch (error) {
    await logServerError(`Calendar events GET unexpected failure: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'calendarEventsApi.get',
      source: 'route_handler',
      featureArea: 'calendar',
      route: '/api/calendar/events',
      url: request.url,
      userId,
      userEmail,
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, 'critical');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/events
 * Create a new calendar event
 */
export async function POST(request: Request) {
  let userId: string | null = null;
  let userEmail: string | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
    userEmail = user.email ?? null;

    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.start_time || !body.end_time || !body.event_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get coach profile (created_by references golf_coaches.id)
    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (coachError) {
      await logServerError(`Calendar events POST coach lookup failed: ${coachError.message}`, {
        action: 'calendarEventsApi.post.coachLookup',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: coachError.code,
        errorHint: coachError.hint,
        errorDetails: coachError.details,
      }, 'error');
    }

    if (!coach || !coach.organization_id) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 403 });
    }

    const { data: team, error: teamError } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

    if (teamError) {
      await logServerError(`Calendar events POST team lookup failed: ${teamError.message}`, {
        action: 'calendarEventsApi.post.teamLookup',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: teamError.code,
        errorHint: teamError.hint,
        errorDetails: teamError.details,
        extra: {
          organizationId: coach.organization_id,
        },
      }, 'error');
    }

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    // Create event — golf_events columns: created_by (FK→golf_coaches.id), all_day (not is_all_day), no notes column
    const { title, description, event_type, start_time, end_time, location, all_day } = body;
    const { data, error } = await supabase
      .from('golf_events')
      .insert({
        title,
        description,
        event_type,
        start_time,
        end_time,
        location,
        all_day: all_day ?? false,
        team_id: team.id,
        created_by: coach.id,
      })
      .select()
      .single();

    if (error) {
      await logServerError(`Calendar events POST insert failed: ${error.message}`, {
        action: 'calendarEventsApi.post.insert',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
        extra: {
          teamId: team.id,
          eventType: event_type,
          title,
          start_time,
          end_time,
        },
      }, 'critical');
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as unknown as CalendarEvent, { status: 201 });
  } catch (error) {
    await logServerError(`Calendar events POST unexpected failure: ${error instanceof Error ? error.message : String(error)}`, {
      action: 'calendarEventsApi.post',
      source: 'route_handler',
      featureArea: 'calendar',
      route: '/api/calendar/events',
      url: request.url,
      userId,
      userEmail,
      extra: {
        stack: error instanceof Error ? error.stack : undefined,
      },
    }, 'critical');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
