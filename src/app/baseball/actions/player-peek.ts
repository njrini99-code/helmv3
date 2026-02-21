'use server';

import { createClient } from '@/lib/supabase/server';

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
      .select('id')
      .eq('user_id', user.id)
      .single();

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
      await supabase
        .from('baseball_player_engagement_events')
        .insert({
          player_id: playerId,
          coach_id: coach.id,
          engagement_type: 'profile_view',
          engagement_date: new Date().toISOString(),
          is_anonymous: false,
          metadata: { source: 'peek_panel' },
        });
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
    console.error('Error fetching player peek data:', error);
    return { success: false, error: 'Failed to load player data' };
  }
}
