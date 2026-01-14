'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// TYPES
// ============================================================================

interface RosterActionResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// ROSTER OPERATIONS
// ============================================================================

/**
 * Removes a player from the team by setting their team_id to null.
 * Does NOT delete the player account, just removes them from the team.
 *
 * Authorization:
 * - Must be authenticated
 * - Must be a coach
 * - Coach must have a team
 * - Player must be on coach's team
 */
export async function removePlayerFromTeam(playerId: string): Promise<RosterActionResult> {
  const supabase = await createClient();

  // 1. Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // 2. Verify user is a coach with a team
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Only coaches can remove players' };
  }

  if (!coach.team_id) {
    return { success: false, error: 'You must have a team to remove players' };
  }

  // 3. Verify player exists and is on coach's team
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, team_id, first_name, last_name')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return { success: false, error: 'Player not found' };
  }

  if (player.team_id !== coach.team_id) {
    return { success: false, error: 'Player is not on your team' };
  }

  // 4. Remove player from team (set team_id to null, don't delete account)
  const { error: updateError } = await supabase
    .from('golf_players')
    .update({
      team_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', playerId);

  if (updateError) {
    console.error('Failed to remove player from team:', updateError);
    return { success: false, error: 'Failed to remove player. Please try again.' };
  }

  // 5. Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');

  return { success: true };
}

/**
 * Get all players on the coach's team
 *
 * Authorization:
 * - Must be authenticated
 * - Must be a coach with a team
 */
export async function getTeamPlayers(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    status: string | null;
    handicap: number | null;
    avatar_url: string | null;
  }>;
  error?: string;
}> {
  const supabase = await createClient();

  // 1. Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // 2. Verify user is a coach with a team
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  if (!coach.team_id) {
    return { success: true, data: [] };
  }

  // 3. Get all players on the team
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, email, status, handicap, avatar_url')
    .eq('team_id', coach.team_id)
    .order('last_name', { ascending: true });

  if (playersError) {
    console.error('Failed to fetch team players:', playersError);
    return { success: false, error: 'Failed to load roster' };
  }

  return { success: true, data: players || [] };
}

// NOTE: updatePlayerStatus is in golf.ts
// import { updatePlayerStatus } from '@/app/golf/actions/golf';
