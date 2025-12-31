'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

/**
 * Removes a player from the team by setting their team_id to null.
 * Does NOT delete the player account, just removes them from the team.
 */
export async function removePlayerFromTeam(playerId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can remove players');

  // Verify player is on coach's team
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('id', playerId)
    .single();

  if (!player) throw new Error('Player not found');
  if (player.team_id !== coach.team_id) {
    throw new Error('Player is not on your team');
  }

  // Remove player from team (set team_id to null, don't delete account)
  const { error } = await supabase
    .from('golf_players')
    .update({
      team_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', playerId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/roster');
  return { success: true };
}

/**
 * Updates a player's status (active, inactive, redshirt, etc.)
 */
export async function updatePlayerStatus(
  playerId: string,
  status: 'active' | 'injured' | 'redshirt' | 'inactive'
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Verify user is a coach
  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id, team_id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can update player status');

  // Verify player is on coach's team
  const { data: player } = await supabase
    .from('golf_players')
    .select('id, team_id')
    .eq('id', playerId)
    .single();

  if (!player) throw new Error('Player not found');
  if (player.team_id !== coach.team_id) {
    throw new Error('Player is not on your team');
  }

  const { error } = await supabase
    .from('golf_players')
    .update({
      status,
      updated_at: new Date().toISOString()
    })
    .eq('id', playerId);

  if (error) throw error;

  revalidatePath('/golf/dashboard/roster');
  return { success: true };
}
