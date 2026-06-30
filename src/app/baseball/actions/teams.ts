'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import {
  formatSafeErrorResponse,
  logSecurityEvent
} from '@/lib/validation/server-action-validator';
import { TeamSchemas } from '@/lib/validation/action-schemas';
import { logServerError } from '@/lib/server-error-logger';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';

// ============================================================================
// TYPES
// ============================================================================

interface TeamInfo {
  id: string;
  name: string;
  team_type: string;
}

interface TeamMembershipWithTeam {
  team_id: string;
  baseball_teams: TeamInfo;
}

export interface TeamValidationResult {
  canJoin: boolean;
  reason?: string;
  currentTeams?: TeamInfo[];
}

/**
 * Validates whether a player can join a specific team based on multi-team rules:
 * - HS Player: 1 HS team + 1 Showcase team
 * - Showcase Player: 1 Showcase team + 1 HS team
 * - JUCO Player: 1 JUCO team only
 * - College Player: 1 College team only
 */
export async function validatePlayerCanJoinTeam(
  playerId: string,
  teamId: string
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Fetch all required data in parallel (3 queries → 1 round trip)
  const [playerResult, teamResult, membershipsResult] = await Promise.all([
    supabase
      .from('baseball_players')
      .select('player_type')
      .eq('id', playerId)
      .single(),
    supabase
      .from('baseball_teams')
      .select('id, name, team_type')
      .eq('id', teamId)
      .single(),
    supabase
      .from('baseball_team_members')
      .select(`
        team_id,
        baseball_teams!inner (
          id,
          name,
          team_type
        )
      `)
      .eq('player_id', playerId),
  ]);

  const { data: player, error: playerError } = playerResult;
  const { data: targetTeam, error: teamError } = teamResult;
  const { data: currentMemberships } = membershipsResult;

  if (playerError || !player) {
    return {
      canJoin: false,
      reason: 'Player not found',
    };
  }

  if (teamError || !targetTeam) {
    return {
      canJoin: false,
      reason: 'Team not found',
    };
  }

  const currentTeams: TeamInfo[] = (currentMemberships as TeamMembershipWithTeam[] || []).map((m) => ({
    id: m.baseball_teams.id,
    name: m.baseball_teams.name,
    team_type: m.baseball_teams.team_type,
  }));

  // Check if already on this team
  if (currentTeams.some((t) => t.id === teamId)) {
    return {
      canJoin: false,
      reason: 'You are already a member of this team',
      currentTeams,
    };
  }

  // JUCO players can only be on 1 JUCO team
  if (player.player_type === 'juco') {
    if (currentTeams.length >= 1) {
      return {
        canJoin: false,
        reason: 'JUCO players can only be on one team',
        currentTeams,
      };
    }
    if (targetTeam.team_type !== 'juco') {
      return {
        canJoin: false,
        reason: 'JUCO players can only join JUCO teams',
        currentTeams,
      };
    }
  }

  // College players can only be on 1 college team
  if (player.player_type === 'college') {
    if (currentTeams.length >= 1) {
      return {
        canJoin: false,
        reason: 'College players can only be on one team',
        currentTeams,
      };
    }
    if (targetTeam.team_type !== 'college') {
      return {
        canJoin: false,
        reason: 'College players can only join college teams',
        currentTeams,
      };
    }
  }

  // HS players: 1 HS team + 1 Showcase team max
  if (player.player_type === 'high_school') {
    if (currentTeams.length >= 2) {
      return {
        canJoin: false,
        reason: 'High school players can only be on two teams (1 HS + 1 Showcase)',
        currentTeams,
      };
    }

    // Check team type compatibility
    if (targetTeam.team_type === 'high_school') {
      const hasHSTeam = currentTeams.some((t) => t.team_type === 'high_school');
      if (hasHSTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a high school team',
          currentTeams,
        };
      }
    } else if (targetTeam.team_type === 'showcase') {
      const hasShowcaseTeam = currentTeams.some((t) => t.team_type === 'showcase');
      if (hasShowcaseTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a showcase team',
          currentTeams,
        };
      }
    } else {
      return {
        canJoin: false,
        reason: 'High school players can only join HS or Showcase teams',
        currentTeams,
      };
    }
  }

  // Showcase players: 1 Showcase team + 1 HS team max
  if (player.player_type === 'showcase') {
    if (currentTeams.length >= 2) {
      return {
        canJoin: false,
        reason: 'Showcase players can only be on two teams (1 Showcase + 1 HS)',
        currentTeams,
      };
    }

    // Check team type compatibility
    if (targetTeam.team_type === 'showcase') {
      const hasShowcaseTeam = currentTeams.some((t) => t.team_type === 'showcase');
      if (hasShowcaseTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a showcase team',
          currentTeams,
        };
      }
    } else if (targetTeam.team_type === 'high_school') {
      const hasHSTeam = currentTeams.some((t) => t.team_type === 'high_school');
      if (hasHSTeam) {
        return {
          canJoin: false,
          reason: 'You are already on a high school team',
          currentTeams,
        };
      }
    } else {
      return {
        canJoin: false,
        reason: 'Showcase players can only join Showcase or HS teams',
        currentTeams,
      };
    }
  }

  // Validation passed
  return {
    canJoin: true,
    currentTeams,
  };
}

/**
 * Add a player to a team with validation
 * JUCO teams automatically enable recruiting for players
 */
export async function joinTeam(playerId: string, teamId: string) {
  const supabase = await createClient();

  // SECURITY: Verify authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      success: false,
      error: 'Not authenticated',
    };
  }

  // SECURITY: Verify the caller owns this player profile (IDOR protection)
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (!player) {
    return {
      success: false,
      error: 'Player not found',
    };
  }

  if (player.user_id !== user.id) {
    // Log security event for potential IDOR attack
    await logSecurityEvent({
      event: 'idor_attempt',
      action: 'team_join',
      userId: user.id,
      metadata: {
        attemptedPlayerId: playerId,
        teamId,
        actualPlayerUserId: player.user_id
      },
    });
    return {
      success: false,
      error: 'You can only join teams with your own player profile',
    };
  }

  // Validate first
  const validation = await validatePlayerCanJoinTeam(playerId, teamId);

  if (!validation.canJoin) {
    return {
      success: false,
      error: validation.reason || 'Cannot join this team',
    };
  }

  // Get team type to check if JUCO (auto-enable recruiting)
  const { data: team } = await supabase
    .from('baseball_teams')
    .select('team_type')
    .eq('id', teamId)
    .single();

  if (team?.team_type === 'juco') {
    const { data: playerRow } = await supabase
      .from('baseball_players')
      .select('player_type')
      .eq('id', playerId)
      .maybeSingle();

    if (playerRow?.player_type === 'college') {
      return {
        success: false,
        error: 'College players cannot activate recruiting through team join.',
      };
    }
  }

  // Add player to team
  const { error } = await supabase
    .from('baseball_team_members')
    .insert({
      team_id: teamId,
      player_id: playerId,
      joined_at: new Date().toISOString(),
    });

  if (error) {
    await logServerError(`Error joining team: ${error instanceof Error ? error.message : String(error)}`, { action: 'teams.joinTeam' });
    return {
      success: false,
      error: 'Failed to join team. Please try again.',
    };
  }

  // JUCO teams auto-enable recruiting for players
  // This is because JUCO players are automatically discoverable for transfer recruiting
  if (team?.team_type === 'juco') {
    // Check if player has settings that disable profile visibility
    const { data: settings } = await supabase
      .from('baseball_player_settings')
      .select('profile_visibility')
      .eq('player_id', playerId)
      .single();

    // Only auto-enable if they haven't explicitly turned it off
    // (settings not found means no explicit preference, so we enable)
    // profile_visibility: 'public' | 'coaches_only' | 'private'
    const shouldAutoEnable = !settings || settings.profile_visibility !== 'private';

    if (shouldAutoEnable) {
      await supabase
        .from('baseball_players')
        .update({
          recruiting_activated: true,
          recruiting_activated_at: new Date().toISOString(),
        })
        .eq('id', playerId);

      // Also ensure player_settings has profile_visibility = 'public'
      await supabase
        .from('baseball_player_settings')
        .upsert({
          player_id: playerId,
          profile_visibility: 'public',
        }, { onConflict: 'player_id' });
    }
  }

  // Revalidate relevant paths
  revalidatePath('/baseball/dashboard/command-center');
  revalidatePath('/baseball/dashboard/roster');

  return {
    success: true,
  };
}

/**
 * Process a team invitation code
 */
export async function processTeamInvitation(inviteCode: string, playerId: string) {
  try {
    const supabase = await createClient();

    // Validate input with centralized schema
    const validatedData = TeamSchemas.join.parse({
      invite_code: inviteCode,
      player_id: playerId
    });

    // SECURITY: Verify authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }

    // SECURITY: Verify the caller owns this player profile (IDOR protection)
    const { data: playerOwnership } = await supabase
      .from('baseball_players')
      .select('user_id')
      .eq('id', validatedData.player_id)
      .single();

    if (!playerOwnership || playerOwnership.user_id !== user.id) {
      await logSecurityEvent({
        event: 'idor_attempt',
        action: 'team_invitation_process',
        userId: user.id,
        metadata: {
          attemptedPlayerId: validatedData.player_id,
          inviteCode: validatedData.invite_code
        },
      });
      return {
        success: false,
        error: 'You can only join teams with your own player profile',
      };
    }

    // Log security event
    await logSecurityEvent({
      event: 'team_join_attempt',
      action: 'team_invitation_process',
      userId: user.id,
      metadata: { inviteCode: validatedData.invite_code, playerId: validatedData.player_id },
    });

    // Find the invitation
    const { data: invitation, error: inviteError } = await supabase
      .from('baseball_team_invitations')
      .select(`
        id,
        team_id,
        expires_at,
        is_active,
        max_uses,
        used_count,
        baseball_teams!inner (
          id,
          name,
          team_type
        )
      `)
      .eq('code', validatedData.invite_code)
      .single();

    if (inviteError || !invitation) {
      console.warn('[Security] Invalid team invitation attempt:', { inviteCode: validatedData.invite_code, playerId: validatedData.player_id });
      return {
        success: false,
        error: 'Invalid invitation code',
      };
    }

    // Check if invitation is active
    if (!invitation.is_active) {
      return {
        success: false,
        error: 'This invitation is no longer active',
      };
    }

    // Check if invitation has expired
    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return {
        success: false,
        error: 'This invitation has expired',
      };
    }

    // Check max uses via invitation redemption count (not roster size).
    if (invitation.max_uses) {
      const redemptionCount = invitation.used_count ?? 0;
      if (redemptionCount >= invitation.max_uses) {
        return {
          success: false,
          error: 'This invitation has reached its maximum number of uses',
        };
      }
    }

    // Reserve redemption atomically before creating membership (#395).
    let redeemQuery = fromUntyped(supabase, 'baseball_team_invitations')
      .update({ used_count: (invitation.used_count ?? 0) + 1 } as Record<string, unknown>)
      .eq('id', invitation.id)
      .eq('is_active', true)
      .select('id');

    if (invitation.max_uses != null) {
      redeemQuery = redeemQuery.lt('used_count', invitation.max_uses);
    }

    const { data: redeemed } = await redeemQuery.maybeSingle();
    if (!redeemed) {
      return {
        success: false,
        error: 'This invitation has reached its maximum number of uses',
      };
    }

    // Join the team
    const joinResult = await joinTeam(validatedData.player_id, invitation.team_id);
    if (!joinResult.success) {
      await fromUntyped(supabase, 'baseball_team_invitations')
        .update({ used_count: invitation.used_count ?? 0 } as Record<string, unknown>)
        .eq('id', invitation.id);
      return joinResult;
    }

    return joinResult;
  } catch (err) {
    return formatSafeErrorResponse(err);
  }
}

// ============================================================================
// INVITE CODE MANAGEMENT (for College/JUCO Coaches Team Management)
// ============================================================================

/**
 * Generate a readable invite code
 * Uses uppercase letters and numbers, excluding ambiguous characters (O, 0, I, 1, L)
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const MAX_JOIN_CODE_ATTEMPTS = 5;

type TeamWithJoinCode = {
  id: string;
  name: string;
  organization_id: string | null;
  join_code: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  const message = (error as { message?: string })?.message?.toLowerCase() ?? '';
  return code === '23505' || message.includes('duplicate key') || message.includes('unique constraint');
}

async function persistUniqueJoinCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<{ code: string } | { error: string }> {
  for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
    const inviteCode = generateInviteCode();
    const { error: updateError } = await fromUntyped(supabase, 'baseball_teams')
      .update({ join_code: inviteCode } as Record<string, unknown>)
      .eq('id', teamId);

    if (!updateError) {
      return { code: inviteCode };
    }

    if (isUniqueViolation(updateError)) {
      continue;
    }

    await logServerError(
      `Failed to persist join code: ${updateError instanceof Error ? updateError.message : String(updateError)}`,
      { action: 'teams.persistUniqueJoinCode' },
    );
    return { error: 'Failed to generate invite code. Please try again.' };
  }

  return { error: 'Failed to generate a unique invite code. Please try again.' };
}

export interface TeamInviteResult {
  success: boolean;
  data?: {
    inviteCode: string;
    inviteLink: string;
    teamName: string;
  };
  error?: string;
}

/**
 * Generate or retrieve an invite code for a coach's team
 * Used by College and JUCO coaches for team management
 */
export const generateTeamInviteCode = withBaseballAction(
  'generateTeamInviteCode',
  {
    featureArea: 'baseball-settings',
    requiredCapability: 'can_manage_settings',
    teamFrom: (teamId: string) => teamId,
  },
  async (ctx, teamId: string): Promise<TeamInviteResult> => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id, coach_type, organization_id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
      return { success: false, error: 'Only college and JUCO coaches can manage teams' };
    }

    const { data: team, error: teamError } = await supabase
      .from('baseball_teams')
      .select('id, name, organization_id, join_code')
      .eq('id', teamId)
      .single() as { data: TeamWithJoinCode | null; error: unknown };

    if (teamError || !team) {
      return { success: false, error: 'Team not found' };
    }

    if (team.organization_id !== coach.organization_id) {
      return { success: false, error: 'You can only manage teams in your organization' };
    }

    if (team.join_code) {
      return {
        success: true,
        data: {
          inviteCode: team.join_code,
          inviteLink: `/baseball/join/${team.join_code}`,
          teamName: team.name,
        },
      };
    }

    const persisted = await persistUniqueJoinCode(supabase, teamId);
    if ('error' in persisted) {
      return { success: false, error: persisted.error };
    }

    revalidatePath('/baseball/dashboard/command-center');
    revalidatePath('/baseball/dashboard/roster');

    return {
      success: true,
      data: {
        inviteCode: persisted.code,
        inviteLink: `/baseball/join/${persisted.code}`,
        teamName: team.name,
      },
    };
  },
);

/**
 * Regenerate team invite code (invalidates old code)
 */
export const regenerateTeamInviteCode = withBaseballAction(
  'regenerateTeamInviteCode',
  {
    featureArea: 'baseball-settings',
    requiredCapability: 'can_manage_settings',
    teamFrom: (teamId: string) => teamId,
  },
  async (ctx, teamId: string): Promise<TeamInviteResult> => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id, coach_type, organization_id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    type TeamBasic = { id: string; name: string; organization_id: string | null };
    const { data: team, error: teamError } = await supabase
      .from('baseball_teams')
      .select('id, name, organization_id')
      .eq('id', teamId)
      .single() as { data: TeamBasic | null; error: unknown };

    if (teamError || !team) {
      return { success: false, error: 'Team not found' };
    }

    if (team.organization_id !== coach.organization_id) {
      return { success: false, error: 'You can only manage teams in your organization' };
    }

    const persisted = await persistUniqueJoinCode(supabase, teamId);
    if ('error' in persisted) {
      return { success: false, error: persisted.error };
    }

    revalidatePath('/baseball/dashboard/command-center');
    revalidatePath('/baseball/dashboard/roster');

    return {
      success: true,
      data: {
        inviteCode: persisted.code,
        inviteLink: `/baseball/join/${persisted.code}`,
        teamName: team.name,
      },
    };
  },
);

/**
 * Get the coach's team for team management
 */
export const getCoachTeamForManagement = withBaseballAction(
  'getCoachTeamForManagement',
  { featureArea: 'baseball-settings' },
  async (ctx) => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id, coach_type, organization_id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found' };
    }

    if (coach.coach_type !== 'college' && coach.coach_type !== 'juco') {
      return { success: false, error: 'Only college and JUCO coaches can manage teams' };
    }

    if (!coach.organization_id) {
      return { success: false, error: 'No organization linked to your profile' };
    }

    type TeamFullWithJoinCode = {
      id: string;
      name: string;
      team_type: string;
      join_code: string | null;
      organization_id: string | null;
    };
    const { data: team, error: teamError } = await supabase
      .from('baseball_teams')
      .select('id, name, team_type, join_code, organization_id')
      .eq('id', ctx.activeTeamId)
      .maybeSingle() as { data: TeamFullWithJoinCode | null; error: unknown };

    if (teamError || !team || team.organization_id !== coach.organization_id) {
      return { success: true, data: null };
    }

    return {
      success: true,
      data: {
        id: team.id,
        name: team.name,
        teamType: team.team_type,
        inviteCode: team.join_code,
        organizationId: team.organization_id,
      },
    };
  },
);

/**
 * Process team join via direct invite code (for baseball)
 * This is for the simpler code-based join (like golf) vs the invitation table
 */
export async function joinTeamByCode(inviteCode: string, playerId: string) {
  const supabase = await createClient();

  type TeamByCode = { id: string; name: string; team_type: string };
  const { data: team, error: teamError } = await fromUntyped(supabase, 'baseball_teams')
    .select('id, name, team_type')
    .eq('join_code', inviteCode)
    .maybeSingle() as { data: TeamByCode | null; error: unknown };

  if (teamError || !team) {
    return { success: false, error: 'Invalid invite code' };
  }

  // Use existing join logic with validation
  return await joinTeam(playerId, team.id);
}

// ============================================================================
// DECISION ROOM + STAFF SETTINGS — re-exports
//
// NOTE: Staff Decision Room + Staff Settings symbols (getDecisionRoomData,
// getStaffSettingsData, the meeting-item mutations, and all DecisionRoom*/Staff*
// types) live in the sibling './decision-room' module. Consumers import them
// from '@/app/baseball/actions/decision-room' DIRECTLY — a 'use server' file
// cannot re-export values (Next.js: only inline `export async function`).
