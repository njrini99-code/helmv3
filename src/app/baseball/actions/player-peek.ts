'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { notifyProfileView } from '@/lib/notifications';
import { logServerError } from '@/lib/server-error-logger';

export interface PlayerPeekData {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  primaryPosition: string | null;
  secondaryPosition: string | null;
  gradYear: number | null;
  highSchoolName: string | null;
  city: string | null;
  state: string | null;
  heightFeet: number | null;
  heightInches: number | null;
  weightLbs: number | null;
  bats: string | null;
  throws: string | null;
  gpa: number | null;
  playerType: string | null;
  hasVideo: boolean;
  stats: {
    pitchVelo: number | null;
    exitVelo: number | null;
    sixtyTime: number | null;
    popTime: number | null;
  };
  isOnWatchlist: boolean;
  watchlistId: string | null;
  pipelineStage: string | null;
  lastActivity: string | null;
}

/**
 * Fetch player data for the peek panel preview.
 * Returns essential info for quick view without full profile load.
 * SEMGREP-ALLOW: read endpoint; engagement-event insert is fire-and-forget telemetry, no UI cache to invalidate
 */
export async function getPlayerPeekData(playerId: string): Promise<{
  success: boolean;
  data?: PlayerPeekData;
  error?: string;
}> {
  const supabase = await createClient();

  try {
    // Get authenticated user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get player data
    const { data: player, error: playerError } = await supabase
      .from('baseball_players')
      .select(`
        id,
        first_name,
        last_name,
        avatar_url,
        primary_position,
        secondary_position,
        grad_year,
        high_school_name,
        city,
        state,
        height_feet,
        height_inches,
        weight_lbs,
        bats,
        throws,
        gpa,
        player_type,
        has_video,
        pitch_velo,
        exit_velo,
        sixty_time,
        pop_time,
        updated_at
      `)
      .eq('id', playerId)
      .single();

    if (playerError || !player) {
      return { success: false, error: 'Player not found' };
    }

    // Get coach data and watchlist status
    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id, full_name, organization_id')
      .eq('user_id', user.id)
      .single() as { data: { id: string; full_name: string | null; organization_id: string | null } | null };

    let isOnWatchlist = false;
    let watchlistId: string | null = null;
    let pipelineStage: string | null = null;

    if (coach) {
      const { data: watchlist } = await supabase
        .from('baseball_watchlists')
        .select('id, pipeline_stage')
        .eq('coach_id', coach.id)
        .eq('player_id', playerId)
        .maybeSingle();

      if (watchlist) {
        isOnWatchlist = true;
        watchlistId = watchlist.id;
        pipelineStage = watchlist.pipeline_stage;
      }

      // Log profile view engagement
      await fromUntyped(supabase, 'baseball_player_engagement_events')
        .insert({
          player_id: playerId,
          coach_id: coach.id,
          engagement_type: 'profile_view',
          is_anonymous: false,
          metadata: { source: 'peek_panel' },
        });

      // Notify the player of the profile view (fire-and-forget)
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: playerRow } = await supabase.from('baseball_players' as any)
          .select('user_id').eq('id', playerId).single() as { data: { user_id: string } | null };

        if (playerRow?.user_id) {
          const { data: userRow } = await supabase.from('users')
            .select('email').eq('id', playerRow.user_id).single();

          let schoolName = 'a program';
          if (coach.organization_id) {
            const { data: org } = await supabase.from('organizations')
              .select('name').eq('id', coach.organization_id).single();
            if (org?.name) schoolName = org.name;
          }

          const viewerInfo = coach.full_name?.trim()
            ? `${coach.full_name} from ${schoolName}`
            : `A coach from ${schoolName}`;

          if (userRow?.email) {
            await notifyProfileView(playerRow.user_id, userRow.email, viewerInfo);
          }
        }
      } catch (notifErr) {
        await logServerError(`[playerPeek] Notification error (non-fatal): ${notifErr instanceof Error ? notifErr.message : String(notifErr)}`, { action: 'player_peek.getPlayerPeekData' });
      }
    }

    return {
      success: true,
      data: {
        id: player.id,
        firstName: player.first_name || '',
        lastName: player.last_name || '',
        avatarUrl: player.avatar_url,
        primaryPosition: player.primary_position,
        secondaryPosition: player.secondary_position,
        gradYear: player.grad_year,
        highSchoolName: player.high_school_name,
        city: player.city,
        state: player.state,
        heightFeet: player.height_feet,
        heightInches: player.height_inches,
        weightLbs: player.weight_lbs,
        bats: player.bats,
        throws: player.throws,
        gpa: player.gpa,
        playerType: player.player_type,
        hasVideo: player.has_video || false,
        stats: {
          pitchVelo: player.pitch_velo,
          exitVelo: player.exit_velo,
          sixtyTime: player.sixty_time,
          popTime: player.pop_time,
        },
        isOnWatchlist,
        watchlistId,
        pipelineStage,
        lastActivity: player.updated_at,
      },
    };
  } catch (error) {
    await logServerError(`Error fetching player peek data: ${error instanceof Error ? error.message : String(error)}`, { action: 'player_peek.getPlayerPeekData' });
    return { success: false, error: 'Failed to load player data' };
  }
}
