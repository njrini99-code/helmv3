'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { BaseballCapabilityError, requireBaseballCapability } from '@/lib/baseball/capabilities';
import {
  withBaseballAction,
  BaseballUnauthorizedError,
  BaseballNoActiveTeamError,
  BaseballActionError,
} from '@/lib/baseball/with-baseball-action';

const ROSTER_PATH = '/baseball/dashboard/roster';

interface LineupPosition {
  order: number;
  playerId: string;
}

interface SaveLineupParams {
  teamId: string;
  name: string;
  positions: LineupPosition[];
}

function mapLineupActionError(error: unknown): { success: false; error: string } {
  if (error instanceof BaseballUnauthorizedError) {
    return { success: false, error: 'Not authenticated' };
  }
  if (error instanceof BaseballNoActiveTeamError) {
    return { success: false, error: 'Coach or team not found' };
  }
  if (error instanceof BaseballCapabilityError) {
    return { success: false, error: 'You do not have permission to manage lineups' };
  }
  if (error instanceof BaseballActionError) {
    return { success: false, error: 'Could not complete the lineup action. Please try again.' };
  }
  if (error instanceof Error) {
    return { success: false, error: error.message };
  }
  return { success: false, error: 'An unexpected error occurred' };
}

function validateLineupPositions(positions: LineupPosition[]): string | null {
  if (!positions || positions.length === 0) {
    return 'Lineup must have at least one player';
  }
  if (positions.length > 9) {
    return 'Lineup cannot have more than 9 players';
  }
  const orders = positions.map((p) => p.order);
  if (new Set(orders).size !== orders.length) {
    return 'Lineup cannot have duplicate batting orders';
  }
  const playerIds = positions.map((p) => p.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    return 'Lineup cannot have the same player in multiple positions';
  }
  return null;
}

const saveLineupAction = withBaseballAction(
  'saveLineup',
  {
    featureArea: 'baseball-lineups',
    requiredCapability: 'can_manage_lineups',
    teamFrom: (params: SaveLineupParams) => params.teamId,
  },
  async (ctx, { teamId, name, positions }: SaveLineupParams) => {
    const supabase = await createClient();
    const coachId = ctx.activeCoachId;
    if (!coachId) return { success: false, error: 'Coach profile not found' };

    if (teamId !== ctx.activeTeamId) {
      await requireBaseballCapability(teamId, 'can_manage_lineups');
    }

    const validationError = validateLineupPositions(positions);
    if (validationError) return { success: false, error: validationError };

    const { data: lineup, error: lineupError } = await supabase
      .from('baseball_team_lineups')
      .insert({
        team_id: teamId,
        created_by_coach_id: coachId,
        name: name || 'Untitled Lineup',
      })
      .select()
      .single();

    if (lineupError) throw lineupError;

    const positionsData = positions.map((pos) => ({
      lineup_id: lineup.id,
      batting_order: pos.order,
      player_id: pos.playerId,
    }));

    const { error: positionsError } = await supabase
      .from('baseball_lineup_positions')
      .insert(positionsData);

    if (positionsError) {
      await supabase.from('baseball_team_lineups').delete().eq('id', lineup.id);
      throw positionsError;
    }

    revalidatePath(ROSTER_PATH);
    return { success: true as const, lineupId: lineup.id };
  },
);

/**
 * Save a new lineup for a team
 */
export async function saveLineup(params: SaveLineupParams) {
  try {
    return await saveLineupAction(params);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_lineups.saveLineup', featureArea: 'baseball-lineups' },
    );
    return mapLineupActionError(error);
  }
}

const updateLineupAction = withBaseballAction(
  'updateLineup',
  { featureArea: 'baseball-lineups' },
  async (
    _ctx,
    lineupId: string,
    { name, positions }: { name: string; positions: LineupPosition[] },
  ) => {
    const supabase = await createClient();

    const { data: lineup } = await supabase
      .from('baseball_team_lineups')
      .select('id, team_id')
      .eq('id', lineupId)
      .single();

    if (!lineup) return { success: false, error: 'Lineup not found' };

    await requireBaseballCapability(lineup.team_id, 'can_manage_lineups');

    const validationError = validateLineupPositions(positions);
    if (validationError) return { success: false, error: validationError };

    const { error: updateError } = await supabase
      .from('baseball_team_lineups')
      .update({ name })
      .eq('id', lineupId);

    if (updateError) throw updateError;

    const { error: deleteError } = await supabase
      .from('baseball_lineup_positions')
      .delete()
      .eq('lineup_id', lineupId);

    if (deleteError) throw deleteError;

    const positionsData = positions.map((pos) => ({
      lineup_id: lineupId,
      batting_order: pos.order,
      player_id: pos.playerId,
    }));

    const { error: insertError } = await supabase
      .from('baseball_lineup_positions')
      .insert(positionsData);

    if (insertError) throw insertError;

    revalidatePath(ROSTER_PATH);
    return { success: true as const };
  },
);

/**
 * Update an existing lineup
 */
export async function updateLineup(
  lineupId: string,
  { name, positions }: { name: string; positions: LineupPosition[] },
) {
  try {
    return await updateLineupAction(lineupId, { name, positions });
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_lineups.updateLineup', featureArea: 'baseball-lineups' },
    );
    return mapLineupActionError(error);
  }
}

const deleteLineupAction = withBaseballAction(
  'deleteLineup',
  { featureArea: 'baseball-lineups' },
  async (_ctx, lineupId: string) => {
    const supabase = await createClient();

    const { data: lineup } = await supabase
      .from('baseball_team_lineups')
      .select('id, team_id')
      .eq('id', lineupId)
      .single();

    if (!lineup) return { success: false, error: 'Lineup not found' };

    await requireBaseballCapability(lineup.team_id, 'can_manage_lineups');

    const { error } = await supabase
      .from('baseball_team_lineups')
      .delete()
      .eq('id', lineupId);

    if (error) throw error;

    revalidatePath(ROSTER_PATH);
    return { success: true as const };
  },
);

/**
 * Delete a lineup
 */
export async function deleteLineup(lineupId: string) {
  try {
    return await deleteLineupAction(lineupId);
  } catch (error) {
    await logServerError(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      { action: 'baseball_lineups.deleteLineup', featureArea: 'baseball-lineups' },
    );
    return mapLineupActionError(error);
  }
}

/**
 * Get all lineups for a team
 */
export async function getTeamLineups(teamId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

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
