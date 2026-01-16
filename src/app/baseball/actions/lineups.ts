'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

interface LineupPosition {
  order: number;
  playerId: string;
}

interface SaveLineupParams {
  teamId: string;
  name: string;
  positions: LineupPosition[];
}

/**
 * Save a new lineup for a team
 */
export async function saveLineup({ teamId, name, positions }: SaveLineupParams) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach record
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can create lineups');

  // Verify coach has access to this team
  const { data: teamCoach } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .single();

  if (!teamCoach) throw new Error('You do not have access to this team');

  // Validate lineup (must have positions, no duplicates)
  if (!positions || positions.length === 0) {
    throw new Error('Lineup must have at least one player');
  }

  if (positions.length > 9) {
    throw new Error('Lineup cannot have more than 9 players');
  }

  // Check for duplicate orders
  const orders = positions.map(p => p.order);
  if (new Set(orders).size !== orders.length) {
    throw new Error('Lineup cannot have duplicate batting orders');
  }

  // Check for duplicate players
  const playerIds = positions.map(p => p.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Lineup cannot have the same player in multiple positions');
  }

  // Create lineup
  const { data: lineup, error: lineupError } = await supabase
    .from('baseball_team_lineups')
    .insert({
      team_id: teamId,
      created_by_coach_id: coach.id,
      name: name || 'Untitled Lineup',
    })
    .select()
    .single();

  if (lineupError) throw lineupError;

  // Insert positions
  const positionsData = positions.map(pos => ({
    lineup_id: lineup.id,
    batting_order: pos.order,
    player_id: pos.playerId,
  }));

  const { error: positionsError } = await supabase
    .from('baseball_lineup_positions')
    .insert(positionsData);

  if (positionsError) {
    // Rollback: delete the lineup if positions insert failed
    await supabase.from('baseball_team_lineups').delete().eq('id', lineup.id);
    throw positionsError;
  }

  revalidatePath('/baseball/dashboard/roster');
  return { success: true, lineupId: lineup.id };
}

/**
 * Update an existing lineup
 */
export async function updateLineup(
  lineupId: string,
  { name, positions }: { name: string; positions: LineupPosition[] }
) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach record
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can update lineups');

  // Verify coach owns this lineup
  const { data: lineup } = await supabase
    .from('baseball_team_lineups')
    .select('id, created_by_coach_id')
    .eq('id', lineupId)
    .single();

  if (!lineup) throw new Error('Lineup not found');
  if (lineup.created_by_coach_id !== coach.id) {
    throw new Error('You can only update your own lineups');
  }

  // Validate positions
  if (!positions || positions.length === 0) {
    throw new Error('Lineup must have at least one player');
  }

  if (positions.length > 9) {
    throw new Error('Lineup cannot have more than 9 players');
  }

  // Check for duplicates
  const orders = positions.map(p => p.order);
  if (new Set(orders).size !== orders.length) {
    throw new Error('Lineup cannot have duplicate batting orders');
  }

  const playerIds = positions.map(p => p.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error('Lineup cannot have the same player in multiple positions');
  }

  // Update lineup name
  const { error: updateError } = await supabase
    .from('baseball_team_lineups')
    .update({ name })
    .eq('id', lineupId);

  if (updateError) throw updateError;

  // Delete existing positions
  const { error: deleteError } = await supabase
    .from('baseball_lineup_positions')
    .delete()
    .eq('lineup_id', lineupId);

  if (deleteError) throw deleteError;

  // Insert new positions
  const positionsData = positions.map(pos => ({
    lineup_id: lineupId,
    batting_order: pos.order,
    player_id: pos.playerId,
  }));

  const { error: insertError } = await supabase
    .from('baseball_lineup_positions')
    .insert(positionsData);

  if (insertError) throw insertError;

  revalidatePath('/baseball/dashboard/roster');
  return { success: true };
}

/**
 * Delete a lineup
 */
export async function deleteLineup(lineupId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get coach record
  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can delete lineups');

  // Verify coach owns this lineup
  const { data: lineup } = await supabase
    .from('baseball_team_lineups')
    .select('id, created_by_coach_id')
    .eq('id', lineupId)
    .single();

  if (!lineup) throw new Error('Lineup not found');
  if (lineup.created_by_coach_id !== coach.id) {
    throw new Error('You can only delete your own lineups');
  }

  // Delete lineup (positions will cascade)
  const { error } = await supabase
    .from('baseball_team_lineups')
    .delete()
    .eq('id', lineupId);

  if (error) throw error;

  revalidatePath('/baseball/dashboard/roster');
  return { success: true };
}

/**
 * Get all lineups for a team
 */
export async function getTeamLineups(teamId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Get lineups with positions
  const { data: lineups, error } = await supabase
    .from('baseball_team_lineups')
    .select(`
      id,
      name,
      created_at,
      updated_at,
      baseball_lineup_positions (
        batting_order,
        player:baseball_players (
          id,
          first_name,
          last_name,
          primary_position,
          avatar_url
        )
      )
    `)
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return lineups || [];
}
