'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PendingMigrationTable = any; // Tables that exist in migration but not yet in generated types

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
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can create lineups');

  // Verify coach has access to this team
  const { data: teamCoach } = await supabase
    .from('team_coach_staff')
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
  // @ts-expect-error - team_lineups table will exist after migration
  const { data: lineup, error: lineupError } = await (supabase.from('team_lineups') as PendingMigrationTable).insert({
    team_id: teamId,
    coach_id: coach.id,
    name: name || 'Untitled Lineup',
  }).select().single();

  if (lineupError) throw lineupError;

  // Insert positions
  const positionsData = positions.map(pos => ({
    lineup_id: lineup.id,
    batting_order: pos.order,
    player_id: pos.playerId,
  }));

  // @ts-expect-error - lineup_positions table will exist after migration
  const { error: positionsError } = await (supabase.from('lineup_positions') as PendingMigrationTable).insert(positionsData);

  if (positionsError) {
    // Rollback: delete the lineup if positions insert failed
    // @ts-expect-error - team_lineups table will exist after migration
    await (supabase.from('team_lineups') as PendingMigrationTable).delete().eq('id', lineup.id);
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
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can update lineups');

  // Verify coach owns this lineup
  // @ts-expect-error - team_lineups table will exist after migration
  const { data: lineup } = await (supabase.from('team_lineups') as PendingMigrationTable).select('id, coach_id').eq('id', lineupId).single();

  if (!lineup) throw new Error('Lineup not found');
  if (lineup.coach_id !== coach.id) {
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
  // @ts-expect-error - team_lineups table will exist after migration
  const { error: updateError } = await (supabase.from('team_lineups') as PendingMigrationTable).update({ name }).eq('id', lineupId);

  if (updateError) throw updateError;

  // Delete existing positions
  // @ts-expect-error - lineup_positions table will exist after migration
  const { error: deleteError } = await (supabase.from('lineup_positions') as PendingMigrationTable).delete().eq('lineup_id', lineupId);

  if (deleteError) throw deleteError;

  // Insert new positions
  const positionsData = positions.map(pos => ({
    lineup_id: lineupId,
    batting_order: pos.order,
    player_id: pos.playerId,
  }));

  // @ts-expect-error - lineup_positions table will exist after migration
  const { error: insertError } = await (supabase.from('lineup_positions') as PendingMigrationTable).insert(positionsData);

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
    .from('coaches')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!coach) throw new Error('Only coaches can delete lineups');

  // Verify coach owns this lineup
  // @ts-expect-error - team_lineups table will exist after migration
  const { data: lineup } = await (supabase.from('team_lineups') as PendingMigrationTable).select('id, coach_id').eq('id', lineupId).single();

  if (!lineup) throw new Error('Lineup not found');
  if (lineup.coach_id !== coach.id) {
    throw new Error('You can only delete your own lineups');
  }

  // Delete lineup (positions will cascade)
  // @ts-expect-error - team_lineups table will exist after migration
  const { error } = await (supabase.from('team_lineups') as PendingMigrationTable).delete().eq('id', lineupId);

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
  // @ts-expect-error - team_lineups table will exist after migration
  const { data: lineups, error } = await (supabase.from('team_lineups') as PendingMigrationTable)
    .select(`
      id,
      name,
      created_at,
      updated_at,
      lineup_positions (
        batting_order,
        player:players (
          id,
          first_name,
          last_name,
          primary_position,
          jersey_number,
          avatar_url
        )
      )
    `)
    .eq('team_id', teamId)
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return lineups || [];
}
