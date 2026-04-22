import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Custom error for authorization failures
 */
export class AuthorizationError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

/**
 * Custom error for resource not found
 */
export class NotFoundError extends Error {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

/**
 * Get the current authenticated user or throw
 */
async function requireAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthorizationError('Not authenticated');
  }

  return { supabase, user };
}

/**
 * Get the current coach profile or throw
 */
export async function requireCoach() {
  const { supabase, user } = await requireAuth();

  const { data: coach, error } = await supabase
    .from('baseball_coaches')
    .select('id, user_id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    throw new AuthorizationError('Coach profile not found');
  }

  return { supabase, user, coach };
}

/**
 * Get the current golf coach profile or throw
 * Note: golf_coaches doesn't have team_id - we look it up via organization_id -> golf_teams
 */
export async function requireGolfCoach() {
  const { supabase, user } = await requireAuth();

  const { data: coach, error } = await supabase
    .from('golf_coaches')
    .select('id, user_id, organization_id')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    throw new AuthorizationError('Golf coach profile not found');
  }

  // Look up team_id from golf_teams via organization_id
  let teamId: string | null = null;
  if (coach.organization_id) {
    const { data: team } = await supabase
      .from('golf_teams')
      .select('id')
      .eq('organization_id', coach.organization_id)
      .maybeSingle();
    teamId = team?.id ?? null;
  }

  return { supabase, user, coach: { ...coach, team_id: teamId } };
}

/**
 * Verify watchlist ownership
 */
export async function verifyWatchlistOwnership(
  supabase: SupabaseClient,
  watchlistId: string,
  coachId: string
): Promise<void> {
  const { data: watchlist, error } = await supabase
    .from('baseball_watchlists')
    .select('id, coach_id')
    .eq('id', watchlistId)
    .single();

  if (error || !watchlist) {
    throw new NotFoundError('Watchlist');
  }

  if (watchlist.coach_id !== coachId) {
    throw new AuthorizationError('Not your watchlist');
  }
}

/**
 * Verify golf team ownership
 * Note: golf_players doesn't have team_id - we look it up via golf_team_members
 */
export async function verifyGolfTeamOwnership(
  supabase: SupabaseClient,
  resourceId: string,
  coachTeamId: string,
  resourceTable: 'golf_events' | 'golf_players' | 'golf_rounds'
): Promise<void> {
  // golf_players doesn't have team_id, need to check via golf_team_members
  if (resourceTable === 'golf_players') {
    const { data: membership, error } = await supabase
      .from('golf_team_members')
      .select('player_id, team_id')
      .eq('player_id', resourceId)
      .eq('team_id', coachTeamId)
      .maybeSingle();

    if (error || !membership) {
      throw new AuthorizationError('Not your player');
    }
    return;
  }

  // For other tables that have team_id
  const { data: resource, error } = await supabase
    .from(resourceTable)
    .select('id, team_id')
    .eq('id', resourceId)
    .single();

  if (error || !resource) {
    throw new NotFoundError(resourceTable.replace('golf_', '').replace('_', ' '));
  }

  if (resource.team_id !== coachTeamId) {
    throw new AuthorizationError(`Not your ${resourceTable.replace('golf_', '')}`);
  }
}

