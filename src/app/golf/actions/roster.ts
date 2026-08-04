'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath, updateTag } from 'next/cache';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// TYPES
// ============================================================================

interface RosterActionResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team_id for a coach via organization lookup.
 * Note: golf_coaches doesn't have team_id directly - we get it from golf_teams via organization_id.
 * Delegates to the shared deterministic resolver (never throws on orgs with >1 team).
 */
async function getCoachTeamId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string | null,
  coachId: string | null
): Promise<string | null> {
  // Cookie-aware: honours the program head's golf_active_team selection
  // (validated server-side) so coach WRITES target the toggled team.
  return resolveCoachTeamIdWithCookie(supabase, organizationId, coachId);
}

// ============================================================================
// ROSTER OPERATIONS
// ============================================================================

/**
 * Removes a player from the team by deleting their golf_team_members record.
 * Does NOT delete the player account, just removes them from the team.
 *
 * Authorization:
 * - Must be authenticated
 * - Must be a coach
 * - Coach must have a team
 * - Player must be on coach's team
 */
async function removePlayerFromTeamImpl(playerId: string): Promise<RosterActionResult> {
  const supabase = await createClient();

  // 1. Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // 2. Verify user is a coach and get team_id via organization
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Only coaches can remove players' };
  }

  const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (!teamId) {
    return { success: false, error: 'You must have a team to remove players' };
  }

  // 3. Verify player is on coach's team via golf_team_members
  const { data: membership, error: memberError } = await supabase
    .from('golf_team_members')
    .select('id')
    .eq('player_id', playerId)
    .eq('team_id', teamId)
    .maybeSingle();

  if (memberError || !membership) {
    return { success: false, error: 'Player is not on your team' };
  }

  // 4. Remove player from team (delete team membership)
  const { error: deleteError } = await supabase
    .from('golf_team_members')
    .delete()
    .eq('player_id', playerId)
    .eq('team_id', teamId);

  if (deleteError) {
    await logServerError(`Failed to remove player from team: ${describeError(deleteError)}`, { action: 'roster.removePlayerFromTeam' });
    return { success: false, error: 'Failed to remove player. Please try again.' };
  }

  // 5. Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');
  updateTag(CACHE_TAGS.DASHBOARD);
  updateTag(CACHE_TAGS.ROSTER);

  return { success: true };
}

const observedRemovePlayerFromTeam = withAdminObserved(
  'removePlayerFromTeam',
  { demoSafe: true, sport: 'golf', feature: 'roster_management' },
  removePlayerFromTeamImpl,
);

export async function removePlayerFromTeam(playerId: string): Promise<RosterActionResult> {
  return observedRemovePlayerFromTeam(playerId);
}

/**
 * Get all players on the coach's team
 *
 * Authorization:
 * - Must be authenticated
 * - Must be a coach with a team
 */
async function getTeamPlayersImpl(): Promise<{
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

  // 2. Verify user is a coach and get team_id via organization
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const teamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (!teamId) {
    return { success: true, data: [] };
  }

  // 3. Get all players on the team via golf_team_members
  const { data: teamMembers, error: membersError } = await supabase
    .from('golf_team_members')
    .select('player_id, status')
    .eq('team_id', teamId);

  if (membersError) {
    await logServerError(`Failed to fetch team members: ${describeError(membersError)}`, { action: 'roster.getTeamPlayers' });
    return { success: false, error: 'Failed to load roster' };
  }

  if (!teamMembers || teamMembers.length === 0) {
    return { success: true, data: [] };
  }

  // 4. Get player details
  const playerIds = teamMembers.map(m => m.player_id);
  const { data: players, error: playersError } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, email, handicap, avatar_url')
    .in('id', playerIds)
    .order('last_name', { ascending: true });

  if (playersError) {
    await logServerError(`Failed to fetch team players: ${describeError(playersError)}`, { action: 'roster.getTeamPlayers' });
    return { success: false, error: 'Failed to load roster' };
  }

  // 5. Merge player data with membership status
  const memberStatusMap = new Map(teamMembers.map(m => [m.player_id, m.status]));
  const result = (players || []).map(player => ({
    ...player,
    status: memberStatusMap.get(player.id) ?? null,
  }));

  return { success: true, data: result };
}

const observedGetTeamPlayers = withAdminObserved(
  'getTeamPlayers',
  { sport: 'golf', feature: 'roster_management' },
  getTeamPlayersImpl,
);

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
  return observedGetTeamPlayers();
}

// NOTE: updatePlayerStatus is in golf.ts
// import { updatePlayerStatus } from '@/app/golf/actions/golf';
