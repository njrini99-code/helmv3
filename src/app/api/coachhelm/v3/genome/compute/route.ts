/**
 * v3 Player Genome — one-shot compute trigger (W33-pt1).
 *
 * POST { player_id } → runs the orchestrator for one player.
 *
 * Caller must be the player themselves OR a coach of the player's
 * team. The nightly cron + bulk backfill that runs across all players
 * lives at /api/cron/v3/genome-nightly (W33-pt2).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { computeGenomeForPlayer } from '@/lib/coachhelm/v3/genome/orchestrator';

const Body = z.object({
  player_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const json = await req.json();
    const parsed = Body.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    const { player_id } = parsed.data;

    // Authorization: player themselves OR coach of their team.
    const { data: ownPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .eq('id', player_id)
      .maybeSingle();
    let authorized = !!ownPlayer;
    if (!authorized) {
      const { data: membership } = await supabase
        .from('golf_team_members')
        .select('team_id')
        .eq('player_id', player_id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (membership?.team_id) {
        const team = await verifyTeamAccess(membership.team_id, user.id, supabase);
        authorized = team.allowed;
      }
    }
    if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await computeGenomeForPlayer(player_id);
    return NextResponse.json(result);
  } catch (err) {
    await logServerError(
      `genome/compute failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.genome.compute.route' },
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
