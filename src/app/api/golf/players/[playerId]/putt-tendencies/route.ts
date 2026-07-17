import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { PlayerPuttTendencies } from '@/lib/types/golf';
import { withRouteHandler } from '@/lib/api/with-route-handler';
import { logServerError } from '@/lib/server-error-logger';

const EMPTY_TENDENCIES: PlayerPuttTendencies = {
  playerId: '',
  fullName: 'Unknown',
  totalMissedPutts: 0,
  missByType: { low: 0, high: 0, short: 0, long: 0, pull: 0, push: 0 },
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
};

interface PuttDetailRow {
  miss_tags: string[] | null;
  break_direction: string | null;
  distance_feet: number | null;
  made: boolean;
}

export const GET = withRouteHandler(
  'golfPuttTendenciesApi.get',
  { source: 'route_handler', sport: 'golf', featureArea: 'golf_putt_tendencies' },
  async (
    request: NextRequest,
    { params }: { params: Promise<{ playerId: string }> }
  ) => {
    const { playerId } = await params;
    const supabase = await createClient();

    // Authentication check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get player info
    const { data: player } = await supabase
      .from('golf_players')
      .select('id, user_id, first_name, last_name')
      .eq('id', playerId)
      .single();

    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }

    // Authorization: must be the player or a coach on their team
    const isOwnData = player.user_id === user.id;
    let isTeamCoach = false;
    if (!isOwnData) {
      const { data: teamMembership } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', playerId)
        .limit(1)
        .single();

      if (teamMembership?.team_id) {
        const { data: coachProfile } = await supabase
          .from('golf_coaches')
          .select('organization_id')
          .eq('user_id', user.id)
          .single();

        if (coachProfile) {
          const { data: playerTeam } = await supabase
            .from('golf_team_members')
            .select('team_id, team:golf_teams(organization_id)')
            .eq('player_id', playerId)
            .eq('status', 'active')
            .limit(1)
            .single();

          isTeamCoach = playerTeam?.team?.organization_id === coachProfile.organization_id;
        }
      }
    }

    if (!isOwnData && !isTeamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Query putt_details for this player's shots via golf_shots join
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: puttRows, error } = await (supabase as any)
      .from('putt_details')
      .select('miss_tags, break_direction, distance_feet, made, shot:golf_shots!inner(player_id)')
      .eq('shot.player_id', playerId) as { data: (PuttDetailRow & { shot: { player_id: string } })[] | null; error: { message: string } | null };

    if (error) {
      await logServerError(`Putt tendencies query failed: ${error.message}`, {
        action: 'golfPuttTendenciesApi.get.query',
        route: '/api/golf/players/[playerId]/putt-tendencies',
        url: request.url,
        source: 'route_handler',
        sport: 'golf',
        featureArea: 'golf_putt_tendencies',
        userId: user.id,
        statusCode: 500,
        extra: { playerId },
      }, 'error');
      return NextResponse.json({ error: 'Failed to load putt tendencies' }, { status: 500 });
    }

    const rows = puttRows || [];
    const fullName = [player.first_name, player.last_name].filter(Boolean).join(' ') || 'Unknown';

    if (rows.length === 0) {
      return NextResponse.json({ ...EMPTY_TENDENCIES, playerId, fullName });
    }

    // Compute tendencies from raw putt data
    const missByType = { low: 0, high: 0, short: 0, long: 0, pull: 0, push: 0 };
    let totalMissedPutts = 0;

    // Distance buckets
    const inside5ft = { attempts: 0, made: 0 };
    const fiveTo10ft = { attempts: 0, made: 0 };
    const outside10ft = { attempts: 0, made: 0 };

    for (const row of rows) {
      const dist = row.distance_feet ?? 0;

      // Distance buckets
      if (dist < 5) {
        inside5ft.attempts++;
        if (row.made) inside5ft.made++;
      } else if (dist < 10) {
        fiveTo10ft.attempts++;
        if (row.made) fiveTo10ft.made++;
      } else {
        outside10ft.attempts++;
        if (row.made) outside10ft.made++;
      }

      // Miss tags (only for missed putts)
      if (!row.made && row.miss_tags && row.miss_tags.length > 0) {
        totalMissedPutts++;
        for (const tag of row.miss_tags) {
          if (tag in missByType) {
            missByType[tag as keyof typeof missByType]++;
          }
        }
      }
    }

    // Calculate percentages
    const lowMissPct = totalMissedPutts > 0 ? Math.round((missByType.low / totalMissedPutts) * 100) : 0;
    const highMissPct = totalMissedPutts > 0 ? Math.round((missByType.high / totalMissedPutts) * 100) : 0;

    // Under-read tendency: low = under-read (ball broke more than expected)
    // Balanced is 50%. >50 means more under-reads.
    const readMisses = missByType.low + missByType.high;
    const underReadTendency = readMisses > 0
      ? Math.round((missByType.low / readMisses) * 100)
      : 50;

    // Leave-short tendency: short vs long
    const speedMisses = missByType.short + missByType.long;
    const leaveShortTendency = speedMisses > 0
      ? Math.round((missByType.short / speedMisses) * 100)
      : 50;

    const pct = (made: number, attempts: number) =>
      attempts > 0 ? Math.round((made / attempts) * 100) : 0;

    const tendencies: PlayerPuttTendencies = {
      playerId,
      fullName,
      totalMissedPutts,
      missByType,
      percentages: {
        lowMissPct,
        highMissPct,
        underReadTendency,
        leaveShortTendency,
      },
      byDistance: {
        inside5ft: { ...inside5ft, pct: pct(inside5ft.made, inside5ft.attempts) },
        fiveTo10ft: { ...fiveTo10ft, pct: pct(fiveTo10ft.made, fiveTo10ft.attempts) },
        outside10ft: { ...outside10ft, pct: pct(outside10ft.made, outside10ft.attempts) },
      },
    };

    return NextResponse.json(tendencies);
  },
);
