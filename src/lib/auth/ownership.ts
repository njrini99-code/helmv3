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
export async function requireAuth() {
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
    .from('coaches')
    .select('id, user_id, coach_type, organization_id')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    throw new AuthorizationError('Coach profile not found');
  }

  return { supabase, user, coach };
}

/**
 * Get the current player profile or throw
 */
export async function requirePlayer() {
  const { supabase, user } = await requireAuth();

  const { data: player, error } = await supabase
    .from('players')
    .select('id, user_id')
    .eq('user_id', user.id)
    .single();

  if (error || !player) {
    throw new AuthorizationError('Player profile not found');
  }

  return { supabase, user, player };
}

/**
 * Get the current golf coach profile or throw
 */
export async function requireGolfCoach() {
  const { supabase, user } = await requireAuth();

  const { data: coach, error } = await supabase
    .from('golf_coaches')
    .select('id, user_id, team_id')
    .eq('user_id', user.id)
    .single();

  if (error || !coach) {
    throw new AuthorizationError('Golf coach profile not found');
  }

  return { supabase, user, coach };
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
    .from('watchlists')
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
 * Verify organization admin
 */
export async function verifyOrganizationAdmin(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<void> {
  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, admin_user_id')
    .eq('id', organizationId)
    .single();

  if (error || !org) {
    throw new NotFoundError('Organization');
  }

  // Check if user is admin or associated coach
  if (org.admin_user_id !== userId) {
    // Also check if user is a coach for this org
    const { data: coach } = await supabase
      .from('coaches')
      .select('id')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .single();

    if (!coach) {
      throw new AuthorizationError('Not organization admin');
    }
  }
}

/**
 * Verify golf team ownership
 */
export async function verifyGolfTeamOwnership(
  supabase: SupabaseClient,
  resourceId: string,
  coachTeamId: string,
  resourceTable: 'golf_events' | 'golf_players' | 'golf_rounds'
): Promise<void> {
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

/**
 * Verify team invitation and return player from current user
 */
export async function verifyTeamInvitationForCurrentUser(
  supabase: SupabaseClient,
  inviteCode: string,
  userId: string
): Promise<{ playerId: string; teamId: string }> {
  // Get current user's player profile
  const { data: player, error: playerError } = await supabase
    .from('players')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (playerError || !player) {
    throw new AuthorizationError('Player profile not found');
  }

  // Validate invitation
  const { data: invitation, error: invError } = await supabase
    .from('team_invitations')
    .select('id, team_id, expires_at, used')
    .eq('invite_code', inviteCode)
    .single();

  if (invError || !invitation) {
    throw new NotFoundError('Invitation');
  }

  if (invitation.used) {
    throw new AuthorizationError('Invitation already used');
  }

  if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
    throw new AuthorizationError('Invitation expired');
  }

  return { playerId: player.id, teamId: invitation.team_id };
}
