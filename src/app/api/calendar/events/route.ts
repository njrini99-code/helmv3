import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { CalendarEvent } from '@/lib/types/calendar';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { attributeClassEvents, type ClassOwnerIndex } from '@/lib/calendar/class-events';

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
    // Who is asking. Needed for class-event scoping below — a coach sees the
    // whole squad's class blocks, a player sees only their own.
    let isCoachViewer = false;
    let viewerPlayerId: string | null = null;

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

    isCoachViewer = Boolean(coach?.organization_id);

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
        viewerPlayerId = player.id;
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

    // Academic class meetings are personal data sitting on a TEAM row.
    //
    // `golf_events` has no player_id, no visibility column, and `created_by` is
    // NULL on every synced class row, so there is no database-level way to
    // scope them — and `golf_events_select_team` positively grants every
    // rostered player SELECT on all of them. On Shenandoah's women's team that
    // is 323 rows belonging to three players: their full semester timetable,
    // where they are and when, readable by all five teammates.
    //
    // The calendar page has always filtered this (attributeClassEvents). This
    // route returned `select('*')` scoped only by team, so the same data was
    // one authenticated fetch away. Same filter, same owner index, same
    // fail-closed-for-players semantics as the page.
    const events = (data ?? []) as unknown as CalendarEvent[];

    const { data: classOwnerRows, error: classOwnersError } = await supabase
      .from('golf_player_classes')
      .select('id, player_id, player:golf_players(first_name, last_name)')
      .eq('team_id', resolvedTeamId)
      .limit(1000);

    if (classOwnersError) {
      await logServerError(`Calendar events GET class-owner lookup failed: ${classOwnersError.message}`, {
        action: 'calendarEventsApi.get.classOwners',
        source: 'route_handler',
        featureArea: 'calendar',
        route: '/api/calendar/events',
        url: request.url,
        userId,
        userEmail,
        errorCode: classOwnersError.code,
        extra: { resolvedTeamId },
      }, 'warning');
    }

    // RLS already scopes this read (a coach reads the roster's classes, a
    // player only their own), so the index is viewer-correct before the filter
    // runs. `ownersResolved` distinguishes "nobody owns classes" from "the
    // lookup failed", which is what stops a failed read from either hiding a
    // coach's own calendar or publishing a player's.
    const classOwners: ClassOwnerIndex = {};
    for (const row of classOwnerRows ?? []) {
      if (!row?.id || !row?.player_id) continue;
      // The embed comes back as an object or a single-element array depending
      // on how PostgREST resolves the relationship; normalise before reading.
      const embedded = row.player as unknown;
      const owner = Array.isArray(embedded) ? embedded[0] : embedded;
      const named = (owner ?? null) as { first_name?: string | null; last_name?: string | null } | null;
      classOwners[row.id] = {
        playerId: row.player_id,
        firstName: named?.first_name ?? null,
        lastName: named?.last_name ?? null,
      };
    }

    const visible = attributeClassEvents(events, classOwners, {
      isCoach: isCoachViewer,
      playerId: viewerPlayerId,
      ownersResolved: !classOwnersError,
    });

    return NextResponse.json(visible as unknown as CalendarEvent[]);
  } catch (error) {
    await logServerError(`Calendar events GET unexpected failure: ${describeError(error)}`, {
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
    await logServerError(`Calendar events POST unexpected failure: ${describeError(error)}`, {
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
