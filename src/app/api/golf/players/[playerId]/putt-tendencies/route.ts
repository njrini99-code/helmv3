import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { PlayerPuttTendencies } from '@/lib/types/golf';

interface PlayerPuttTendenciesRow {
  player_id: string;
  full_name: string | null;
  total_missed_putts: number | null;
  low_misses: number | null;
  high_misses: number | null;
  short_misses: number | null;
  long_misses: number | null;
  pull_misses: number | null;
  push_misses: number | null;
  low_miss_pct: number | null;
  high_miss_pct: number | null;
  under_read_tendency: number | null;
  leave_short_tendency: number | null;
  misses_inside_5ft: number | null;
  made_inside_5ft: number | null;
  misses_5_to_10ft: number | null;
  made_5_to_10ft: number | null;
  misses_outside_10ft: number | null;
  made_outside_10ft: number | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const { playerId } = await params;
    const supabase = await createClient();

    // Authentication check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization: Check if user is the player or a coach on the player's team
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, user_id, team_id')
      .eq('id', playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Check if user is the player themselves
    const isOwnData = player.user_id === user.id;

    // Check if user is a coach on the player's team
    let isTeamCoach = false;
    if (!isOwnData && player.team_id) {
      const { data: coach } = await supabase
        .from('golf_coaches')
        .select('id')
        .eq('user_id', user.id)
        .eq('team_id', player.team_id)
        .single();
      isTeamCoach = !!coach;
    }

    if (!isOwnData && !isTeamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Use type assertion to bypass TypeScript type checking for views not in generated types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('player_putt_tendencies')
      .select('*')
      .eq('player_id', playerId)
      .single() as { data: PlayerPuttTendenciesRow | null; error: { message: string } | null };
    const row = data;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({
        playerId: playerId,
        fullName: 'Unknown',
        totalMissedPutts: 0,
        missByType: {
          low: 0,
          high: 0,
          short: 0,
          long: 0,
          pull: 0,
          push: 0,
        },
        percentages: {
          lowMissPct: 0,
          highMissPct: 0,
          underReadTendency: 50,
          leaveShortTendency: 50,
        },
        byDistance: {
          inside5ft: { attempts: 0, made: 0, pct: 0 },
          fiveTo10ft: { attempts: 0, made: 0, pct: 0 },
          outside10ft: { attempts: 0, made: 0, pct: 0 },
        },
      } as PlayerPuttTendencies);
    }

    // Transform database result to PlayerPuttTendencies format
    const tendencies: PlayerPuttTendencies = {
      playerId: row.player_id,
      fullName: row.full_name || 'Unknown',
      totalMissedPutts: row.total_missed_putts || 0,
      missByType: {
        low: row.low_misses || 0,
        high: row.high_misses || 0,
        short: row.short_misses || 0,
        long: row.long_misses || 0,
        pull: row.pull_misses || 0,
        push: row.push_misses || 0,
      },
      percentages: {
        lowMissPct: row.low_miss_pct || 0,
        highMissPct: row.high_miss_pct || 0,
        underReadTendency: row.under_read_tendency || 50,
        leaveShortTendency: row.leave_short_tendency || 50,
      },
      byDistance: {
        inside5ft: {
          attempts: (row.misses_inside_5ft || 0) + (row.made_inside_5ft || 0),
          made: row.made_inside_5ft || 0,
          pct: (row.misses_inside_5ft || 0) + (row.made_inside_5ft || 0) > 0
            ? Math.round(((row.made_inside_5ft || 0) / ((row.misses_inside_5ft || 0) + (row.made_inside_5ft || 0))) * 100)
            : 0,
        },
        fiveTo10ft: {
          attempts: (row.misses_5_to_10ft || 0) + (row.made_5_to_10ft || 0),
          made: row.made_5_to_10ft || 0,
          pct: (row.misses_5_to_10ft || 0) + (row.made_5_to_10ft || 0) > 0
            ? Math.round(((row.made_5_to_10ft || 0) / ((row.misses_5_to_10ft || 0) + (row.made_5_to_10ft || 0))) * 100)
            : 0,
        },
        outside10ft: {
          attempts: (row.misses_outside_10ft || 0) + (row.made_outside_10ft || 0),
          made: row.made_outside_10ft || 0,
          pct: (row.misses_outside_10ft || 0) + (row.made_outside_10ft || 0) > 0
            ? Math.round(((row.made_outside_10ft || 0) / ((row.misses_outside_10ft || 0) + (row.made_outside_10ft || 0))) * 100)
            : 0,
        },
      },
    };

    return NextResponse.json(tendencies);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
