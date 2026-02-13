import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import type { CalendarEvent } from '@/lib/types/calendar';

/**
 * GET /api/calendar/events
 * Fetch calendar events for the authenticated user (golf_events table)
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const teamId = searchParams.get('teamId');

    // Always resolve team membership from the authenticated user's profile.
    // Even if the client supplies a teamId, we verify the user belongs to it.
    let resolvedTeamId: string | null = null;

    // Try to resolve from coach profile
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coach?.organization_id) {
      const { data: team } = await supabase
        .from('golf_teams')
        .select('id')
        .eq('organization_id', coach.organization_id)
        .maybeSingle();
      resolvedTeamId = team?.id ?? null;
    }

    if (!resolvedTeamId) {
      // Try player membership
      const { data: player } = await supabase
        .from('golf_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (player) {
        const { data: membership } = await supabase
          .from('golf_team_members')
          .select('team_id')
          .eq('player_id', player.id)
          .eq('status', 'active')
          .maybeSingle();
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as unknown as CalendarEvent[]);
  } catch {
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
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.title || !body.start_time || !body.end_time || !body.event_type) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get coach profile (created_by references golf_coaches.id)
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single();

    if (!coach || !coach.organization_id) {
      return NextResponse.json({ error: 'Coach profile not found' }, { status: 403 });
    }

    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();

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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data as unknown as CalendarEvent, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
