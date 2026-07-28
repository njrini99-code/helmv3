'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { revalidatePath } from 'next/cache';
import { randomInt } from 'crypto';
import {
  formatSafeErrorResponse,
  logSecurityEvent
} from '@/lib/validation/server-action-validator';
import { TeamSchemas } from '@/lib/validation/action-schemas';
import { logServerError } from '@/lib/server-error-logger';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { requireBaseballCapability } from '@/lib/baseball/capabilities';
import type { Database } from '@/lib/types/database';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Extracts a human-readable message from an unknown thrown/returned error.
 * `err instanceof Error ? err.message : String(err)` mishandles Supabase's
 * `PostgrestError` — a plain object, never an `Error` instance — which falls
 * through to `String(err)` and logs the useless `[object Object]`. Checking
 * for a `message` property directly (regardless of prototype) covers both
 * real `Error`s and PostgrestError-shaped plain objects.
 */
function errorMessage(err: unknown): string {
  return err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message)
    : String(err);
}

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
async function validatePlayerCanJoinTeamImpl(
  playerId: string,
  teamId: string
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Every exported server action must gate on auth before touching Supabase
  // (helmv3-server-action-missing-auth-check). RLS already backstops the reads
  // below, but an unauthenticated caller has no business probing membership.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { canJoin: false, reason: 'Not authenticated' };
  }

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
async function joinTeamImpl(playerId: string, teamId: string) {
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

  // Get team type + join policy to check if JUCO (auto-enable recruiting) and
  // to enforce the team's join policy (invite_policy / require_coach_approval).
  // SECURITY: the team lookup error is captured and checked (not discarded) —
  // a schema mismatch (e.g. migration 20260624000095 not yet applied) must fail
  // closed rather than silently falling through with team === undefined.
  const { data: team, error: teamError } = await supabase
    .from('baseball_teams')
    .select('team_type, invite_policy, require_coach_approval')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    await logServerError(
      `Error resolving team for join policy check: ${describeError(teamError)}`,
      { action: 'teams.joinTeam' },
    );
    return {
      success: false,
      error: 'Unable to verify this team right now. Please try again.',
    };
  }

  // SECURITY: Enforce team join policy (#502).
  // COALESCE-style defaults guard against the policy columns not being present
  // yet on some environment: invite_policy defaults to 'invite_only' and
  // require_coach_approval defaults to true — matching the column DEFAULTs in
  // migration 20260624000095, and matching the fail-closed posture (approval
  // required unless a coach has explicitly turned it off).
  const invitePolicy = team.invite_policy ?? 'invite_only';
  if (invitePolicy === 'closed') {
    await logSecurityEvent({
      event: 'team_join_denied_closed_roster',
      action: 'team_join',
      userId: user.id,
      metadata: { teamId, playerId },
    });
    return {
      success: false,
      error: 'This roster is closed and is not accepting new members.',
    };
  }
  const requiresApproval = team.require_coach_approval !== false;
  const memberStatus: 'active' | 'pending' = requiresApproval ? 'pending' : 'active';

  if (team.team_type === 'juco') {
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
      status: memberStatus,
      joined_at: new Date().toISOString(),
    });

  if (error) {
    await logServerError(`Error joining team: ${describeError(error)}`, { action: 'teams.joinTeam' });
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
      // Trigger 20260709010200 blocks authenticated-role writes to
      // recruiting_activated (BEFORE UPDATE OF recruiting_activated,
      // player_type on public.baseball_players), so this write must go
      // through the service-role client, matching activateRecruitingExposure
      // / deactivateRecruitingExposure in player-access.ts. Eligibility
      // (JUCO team type, non-'private' profile_visibility) is already
      // verified above via the regular RLS-scoped client.
      const admin = createAdminClient();

      // Multi-team JUCO / prior self-activation guard: a player can already
      // be recruiting_activated=true before THIS join (a second JUCO team,
      // or a prior manual self-activation). Read current state first so the
      // revert-on-upsert-failure logic below only ever undoes a flip THIS
      // call performed — reverting a pre-existing activation would
      // incorrectly deactivate a player this call never touched.
      const { data: currentPlayer } = await admin
        .from('baseball_players')
        .select('recruiting_activated')
        .eq('id', playerId)
        .maybeSingle();
      const wasAlreadyActivated = currentPlayer?.recruiting_activated === true;

      let activateFailed = false;
      if (!wasAlreadyActivated) {
        const { error: activateError } = await admin
          .from('baseball_players')
          .update({
            recruiting_activated: true,
            recruiting_activated_at: new Date().toISOString(),
          })
          .eq('id', playerId);

        if (activateError) {
          activateFailed = true;
          await logServerError(
            `Error auto-enabling recruiting for JUCO join: ${errorMessage(activateError)}`,
            { action: 'teams.joinTeam' },
          );
          // Do NOT proceed to the profile_visibility upsert below — leaving it
          // unset keeps state consistent (no public visibility promised while
          // recruiting_activated failed to flip).
        }
      }

      if (!activateFailed) {
        // Also ensure player_settings has profile_visibility = 'public'.
        // Runs regardless of whether THIS call flipped recruiting_activated
        // (an already-activated player joining another JUCO team still gets
        // visibility synced), best-effort.
        const { error: settingsError } = await supabase
          .from('baseball_player_settings')
          .upsert({
            player_id: playerId,
            profile_visibility: 'public',
          }, { onConflict: 'player_id' });

        if (settingsError) {
          await logServerError(
            `Error upserting profile_visibility for JUCO join: ${errorMessage(settingsError)}`,
            { action: 'teams.joinTeam' },
          );

          // Torn state guard: only revert if THIS call performed the
          // false->true flip above. Reverting an activation that was already
          // true before this join (multi-team JUCO or prior self-activation)
          // would deactivate a player this call never touched. The join
          // itself already committed, so this failure does not affect the
          // success response below — activation is a best-effort side-effect
          // of joining.
          if (!wasAlreadyActivated) {
            const { error: revertError } = await admin
              .from('baseball_players')
              .update({
                recruiting_activated: false,
                recruiting_activated_at: null,
              })
              .eq('id', playerId);

            if (revertError) {
              await logServerError(
                `Error reverting recruiting_activated after failed profile_visibility upsert: ${errorMessage(revertError)}`,
                { action: 'teams.joinTeam' },
              );
            }
          }
        }
      }
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
async function processTeamInvitationImpl(inviteCode: string, playerId: string) {
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
      // The code wasn't found in baseball_team_invitations, but it may be a
      // persistent team join_code (baseball_teams.join_code) rather than an
      // invitation-table code. Mirror the dual-lookup the /baseball/join/[code]
      // page does server-side, so a valid join_code typed into onboarding or the
      // teamless-player widget (which call processTeamInvitation directly) still
      // joins the team instead of failing with "Invalid invitation code".
      // Auth + player-ownership are already verified above; joinTeamByCode →
      // joinTeam re-validates the join independently.
      const fallback = await joinTeamByCode(validatedData.invite_code, validatedData.player_id);
      if (fallback.success) {
        return fallback;
      }

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
    const { data: redeemed, error: redeemError } = (await supabase.rpc(
      'try_redeem_baseball_team_invitation' as never,
      { p_invitation_id: invitation.id } as never,
    )) as { data: boolean | null; error: unknown };

    if (redeemError || !redeemed) {
      return {
        success: false,
        error: 'This invitation has reached its maximum number of uses',
      };
    }

    // Join the team
    const joinResult = await joinTeam(validatedData.player_id, invitation.team_id);
    if (!joinResult.success) {
      await supabase.rpc(
        'release_baseball_team_invitation_redemption' as never,
        { p_invitation_id: invitation.id } as never,
      );
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
 *
 * HARDENED: backed by crypto.randomInt (CSPRNG with built-in rejection
 * sampling), not Math.random(). The alphabet has 31 entries, so a plain
 * `byte % 31` would bias A–H (256 % 31 ≠ 0); randomInt draws uniformly
 * for any bound. Math.random() is neither cryptographically secure nor
 * safe against collisions under concurrent generation; every call site
 * pairs this with an insert/update retry-on-collision loop
 * (isUniqueViolation) rather than trusting uniqueness up front.
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomInt(chars.length));
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
      `Failed to persist join code: ${describeError(updateError)}`,
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
async function joinTeamByCodeImpl(inviteCode: string, playerId: string) {
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
// TEAM CRUD + STAFF SELF-SERVICE (Showcase "Teams" management page)
//
// Backs src/app/baseball/(dashboard)/dashboard/teams/TeamsClient.tsx. Every
// mutation below routes through withBaseballAction (auth + Sentry + sanitized
// errors) and returns a `{ success, error? }` result object rather than
// throwing on expected failure paths, matching the established
// generateTeamInviteCode / regenerateTeamInviteCode pattern above.
// ============================================================================

type BaseballTeamRow = Database['public']['Tables']['baseball_teams']['Row'];
type BaseballTeamInvitationRow = Database['public']['Tables']['baseball_team_invitations']['Row'];

export interface TeamMutationResult {
  success: boolean;
  data?: BaseballTeamRow;
  error?: string;
}

export interface TeamInvitationMutationResult {
  success: boolean;
  data?: BaseballTeamInvitationRow;
  error?: string;
}

export interface TeamActionResult {
  success: boolean;
  error?: string;
}

/**
 * Create a new team for the current coach (Showcase coaches manage multiple
 * teams from this page). No active-team context is required — this is a
 * first-write flow just like onboarding, so `requireActiveContext: false`.
 *
 * Uses the admin/service-role client for the two-step team + primary-staff-row
 * insert, mirroring completeCoachOnboarding: the staff INSERT's RLS check
 * (`is_baseball_primary_coach`) requires a primary staff row to ALREADY exist
 * for the team, which is a chicken-and-egg problem for the very first staff
 * row on a brand-new team — the request-scoped (RLS-on) client cannot do this
 * two-step insert atomically. Auth is still fully enforced above via
 * withBaseballAction resolving `ctx.user` before this body ever runs.
 */
export const createTeam = withBaseballAction(
  'createTeam',
  { featureArea: 'baseball-teams', requireActiveContext: false },
  async (
    ctx,
    input: {
      name: string;
      description?: string | null;
      primary_color?: string | null;
      secondary_color?: string | null;
    },
  ): Promise<TeamMutationResult> => {
    let validated: ReturnType<typeof TeamSchemas.create.parse>;
    try {
      validated = TeamSchemas.create.parse(input);
    } catch {
      return { success: false, error: 'Please provide a valid team name and colors.' };
    }

    const supabase = await createClient();
    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id, organization_id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found.' };
    }

    const admin = createAdminClient();

    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const joinCode = generateInviteCode();
      const { data: team, error: teamError } = await admin
        .from('baseball_teams')
        .insert({
          name: validated.name,
          team_type: 'showcase',
          description: validated.description ?? null,
          primary_color: validated.primary_color ?? '#16A34A',
          secondary_color: validated.secondary_color ?? null,
          join_code: joinCode,
          organization_id: coach.organization_id ?? null,
          created_by: coach.id,
        })
        .select()
        .single();

      if (teamError) {
        if (isUniqueViolation(teamError)) {
          continue;
        }
        await logServerError(
          `Failed to create team: ${describeError(teamError)}`,
          { action: 'teams.createTeam' },
        );
        return { success: false, error: 'Failed to create team. Please try again.' };
      }

      const { error: staffError } = await admin.from('baseball_team_coach_staff').insert({
        team_id: team.id,
        coach_id: coach.id,
        role: 'Head Coach',
        title: 'Head Coach',
        is_primary: true,
        is_head_coach: true,
        status: 'active',
        can_manage_roster: true,
        can_manage_practice: true,
        can_manage_lifting: true,
        can_view_academics: true,
        can_manage_imports: true,
        can_manage_stats: true,
        can_invite_staff: true,
        can_manage_settings: true,
        can_view_medical: true,
        can_message_players: true,
        can_manage_calendar: true,
      });

      if (staffError) {
        await logServerError(
          `Failed to create staff row for new team ${team.id}: ${describeError(staffError)}`,
          { action: 'teams.createTeam' },
        );
        // Compensating delete: the team row is brand new and has no other
        // references yet, so removing it is a safe rollback of this failed
        // multi-step create — not a delete-then-reinsert of existing data.
        await admin.from('baseball_teams').delete().eq('id', team.id);
        return { success: false, error: 'Team created but failed to assign you as coach. Please try again.' };
      }

      revalidatePath('/baseball/dashboard/teams');
      return { success: true, data: team };
    }

    return { success: false, error: 'Failed to generate a unique invite code. Please try again.' };
  },
);

/**
 * Update whitelisted fields on a team. Gated on can_manage_settings against
 * the specific team being edited (not the caller's "active" team), so a
 * Showcase coach editing a non-active team from the list still passes.
 */
export const updateTeam = withBaseballAction(
  'updateTeam',
  {
    featureArea: 'baseball-teams',
    requiredCapability: 'can_manage_settings',
    teamFrom: (input: { team_id: string }) => input.team_id,
  },
  async (
    _ctx,
    input: {
      team_id: string;
      name?: string;
      description?: string | null;
      primary_color?: string | null;
      secondary_color?: string | null;
    },
  ): Promise<TeamMutationResult> => {
    let validated: ReturnType<typeof TeamSchemas.update.parse>;
    try {
      validated = TeamSchemas.update.parse(input);
    } catch {
      return { success: false, error: 'Please provide valid team details.' };
    }

    // Whitelist: only fields explicitly present in the validated input are
    // ever written — no raw client payload reaches the update() call.
    const updates: Database['public']['Tables']['baseball_teams']['Update'] = {};
    if (validated.name !== undefined) updates.name = validated.name;
    if (validated.description !== undefined) updates.description = validated.description;
    if (validated.primary_color !== undefined) updates.primary_color = validated.primary_color;
    if (validated.secondary_color !== undefined) updates.secondary_color = validated.secondary_color;

    if (Object.keys(updates).length === 0) {
      return { success: false, error: 'No changes to save.' };
    }

    const supabase = await createClient();
    const { data: team, error } = await supabase
      .from('baseball_teams')
      .update(updates)
      .eq('id', validated.team_id)
      .select()
      .single();

    if (error || !team) {
      await logServerError(
        `Failed to update team ${validated.team_id}: ${describeError(error)}`,
        { action: 'teams.updateTeam' },
      );
      return { success: false, error: 'Failed to update team. Please try again.' };
    }

    revalidatePath('/baseball/dashboard/teams');
    return { success: true, data: team };
  },
);

/**
 * Delete a team. Requires can_manage_settings on the target team AND that the
 * caller is the primary coach (matches the baseball_teams_delete RLS policy,
 * which is gated on is_baseball_primary_coach). Blocks the delete if the team
 * still has an active roster — coaches must offload/remove players first —
 * AND if the team has ANY recorded history (games, box scores, player/season
 * stats, stat/box-score uploads, documents, tasks, lineups, travel
 * itineraries). An empty *active* roster alone is not a safe gate: a team
 * can have a full season of history with zero currently-active players
 * (everyone graduated / marked inactive), and baseball_teams.id
 * CASCADE-deletes into ~15 dependent tables, so this history check is what
 * actually prevents a season's records from being silently wiped.
 */
export const deleteTeam = withBaseballAction(
  'deleteTeam',
  {
    featureArea: 'baseball-teams',
    requiredCapability: 'can_manage_settings',
    teamFrom: (teamId: string) => teamId,
  },
  async (ctx, teamId: string): Promise<TeamActionResult> => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found.' };
    }

    const { data: staffRow, error: staffError } = await supabase
      .from('baseball_team_coach_staff')
      .select('is_primary')
      .eq('team_id', teamId)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (staffError) {
      await logServerError(
        `Failed to verify primary-coach status before delete: ${describeError(staffError)}`,
        { action: 'teams.deleteTeam' },
      );
      return { success: false, error: 'Unable to verify permissions right now. Please try again.' };
    }

    if (!staffRow?.is_primary) {
      return { success: false, error: 'Only the primary coach can delete this team.' };
    }

    const { count, error: membersError } = await supabase
      .from('baseball_team_members')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('status', 'active');

    if (membersError) {
      await logServerError(
        `Failed to check roster before delete: ${describeError(membersError)}`,
        { action: 'teams.deleteTeam' },
      );
      return { success: false, error: 'Unable to verify the roster right now. Please try again.' };
    }

    if ((count ?? 0) > 0) {
      return {
        success: false,
        error: 'This team still has active roster members. Remove them before deleting the team.',
      };
    }

    // An empty *active* roster is not sufficient to allow a delete: a team
    // can have a full season of history (games, box scores, player/season
    // stats, documents, tasks, lineups, travel itineraries...) with zero
    // currently-active players (everyone graduated / was marked inactive or
    // removed). baseball_teams.id CASCADE-deletes into ~15 dependent tables,
    // so silently allowing that would permanently wipe a season's records in
    // two clicks. Block the delete outright when ANY of that history exists.
    const [
      gamesCheck,
      battingCheck,
      pitchingCheck,
      boxUploadsCheck,
      playerStatsCheck,
      seasonStatsCheck,
      statUploadsCheck,
      documentsCheck,
      tasksCheck,
      lineupsCheck,
      travelCheck,
    ] = await Promise.all([
      supabase.from('baseball_games').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_box_score_batting').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_box_score_pitching').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_box_score_uploads').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_player_stats').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_player_season_stats').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_stat_uploads').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_documents').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_tasks').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_team_lineups').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
      supabase.from('baseball_travel_itineraries').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
    ]);

    const historyChecks: Array<{ label: string; count: number | null; error: unknown }> = [
      { label: 'games', count: gamesCheck.count, error: gamesCheck.error },
      { label: 'batting box scores', count: battingCheck.count, error: battingCheck.error },
      { label: 'pitching box scores', count: pitchingCheck.count, error: pitchingCheck.error },
      { label: 'box score uploads', count: boxUploadsCheck.count, error: boxUploadsCheck.error },
      { label: 'player stats', count: playerStatsCheck.count, error: playerStatsCheck.error },
      { label: 'season stats', count: seasonStatsCheck.count, error: seasonStatsCheck.error },
      { label: 'stat uploads', count: statUploadsCheck.count, error: statUploadsCheck.error },
      { label: 'documents', count: documentsCheck.count, error: documentsCheck.error },
      { label: 'tasks', count: tasksCheck.count, error: tasksCheck.error },
      { label: 'lineups', count: lineupsCheck.count, error: lineupsCheck.error },
      { label: 'travel itineraries', count: travelCheck.count, error: travelCheck.error },
    ];

    const historyCheckFailure = historyChecks.find((c) => c.error);
    if (historyCheckFailure) {
      await logServerError(
        `Failed to check team history before delete: ${describeError(historyCheckFailure.error)}`,
        { action: 'teams.deleteTeam' },
      );
      return { success: false, error: 'Unable to verify team history right now. Please try again.' };
    }

    const blockingHistory = historyChecks
      .filter((c) => (c.count ?? 0) > 0)
      .map((c) => c.label);

    if (blockingHistory.length > 0) {
      return {
        success: false,
        error: `This team has recorded history that can't be deleted: ${blockingHistory.join(', ')}. Teams with games, stats, or other history are not eligible for deletion.`,
      };
    }

    const { error: deleteError } = await supabase
      .from('baseball_teams')
      .delete()
      .eq('id', teamId);

    if (deleteError) {
      await logServerError(
        `Failed to delete team ${teamId}: ${describeError(deleteError)}`,
        { action: 'teams.deleteTeam' },
      );
      return { success: false, error: 'Failed to delete team. Please try again.' };
    }

    revalidatePath('/baseball/dashboard/teams');
    return { success: true };
  },
);

/**
 * Leave a team as a non-primary coach (delete own staff row). The primary
 * coach cannot leave — they must transfer ownership or delete the team.
 *
 * No requiredCapability is enforced here: being staff on the team is
 * sufficient to leave it (a coach without can_manage_settings must still be
 * able to remove themselves).
 *
 * DB-GATED (db_gated, PR #673 follow-up): the live baseball_team_coach_staff
 * DELETE RLS policy only allows is_baseball_primary_coach(team_id) OR
 * has_baseball_staff_capability(team_id,'can_invite_staff') — there is no
 * "delete your own row" clause. A non-primary coach without can_invite_staff
 * will have this delete silently filtered to 0 rows by RLS (no error). We
 * detect that (via .select() on the delete) and surface a clear error rather
 * than a false "success". The DB-side fix — a self-delete clause on the
 * policy — is written but NOT applied at
 * supabase/migrations/20260701021000_baseball_team_coach_staff_self_leave.sql;
 * apply it to make this action work for every non-primary coach.
 */
export const leaveTeamAsCoach = withBaseballAction(
  'leaveTeamAsCoach',
  { featureArea: 'baseball-teams', teamFrom: (teamId: string) => teamId },
  async (ctx, teamId: string): Promise<TeamActionResult> => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found.' };
    }

    const { data: staffRow, error: staffError } = await supabase
      .from('baseball_team_coach_staff')
      .select('id, is_primary')
      .eq('team_id', teamId)
      .eq('coach_id', coach.id)
      .maybeSingle();

    if (staffError) {
      await logServerError(
        `Failed to look up staff row before leave: ${describeError(staffError)}`,
        { action: 'teams.leaveTeamAsCoach' },
      );
      return { success: false, error: 'Unable to verify your membership right now. Please try again.' };
    }

    if (!staffRow) {
      return { success: false, error: 'You are not a staff member of this team.' };
    }

    if (staffRow.is_primary) {
      return {
        success: false,
        error: 'The primary coach cannot leave a team. Transfer ownership or delete the team instead.',
      };
    }

    const { data: deleted, error: deleteError } = await supabase
      .from('baseball_team_coach_staff')
      .delete()
      .eq('id', staffRow.id)
      .select('id');

    if (deleteError) {
      await logServerError(
        `Failed to leave team ${teamId}: ${describeError(deleteError)}`,
        { action: 'teams.leaveTeamAsCoach' },
      );
      return { success: false, error: 'Failed to leave team. Please try again.' };
    }

    if (!deleted || deleted.length === 0) {
      // RLS silently filtered the delete to 0 rows (see PRE-SHIP CHECK above)
      // rather than raising a Postgres error. Surface this loudly instead of
      // reporting a false success.
      return {
        success: false,
        error: "You don't have permission to leave this team yet. Ask the primary coach to remove your staff access.",
      };
    }

    revalidatePath('/baseball/dashboard/teams');
    return { success: true };
  },
);

/**
 * Create a new invitation code for a team (baseball_team_invitations table —
 * distinct from the persistent baseball_teams.join_code).
 */
export const createTeamInvitation = withBaseballAction(
  'createTeamInvitation',
  {
    featureArea: 'baseball-teams',
    requiredCapability: 'can_manage_settings',
    teamFrom: (teamId: string) => teamId,
  },
  async (ctx, teamId: string): Promise<TeamInvitationMutationResult> => {
    const supabase = await createClient();

    const { data: coach, error: coachError } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .single();

    if (coachError || !coach) {
      return { success: false, error: 'Coach profile not found.' };
    }

    for (let attempt = 0; attempt < MAX_JOIN_CODE_ATTEMPTS; attempt++) {
      const code = generateInviteCode();
      const { data: invite, error } = await supabase
        .from('baseball_team_invitations')
        .insert({
          team_id: teamId,
          code,
          created_by_coach_id: coach.id,
          is_active: true,
        })
        .select()
        .single();

      if (!error) {
        revalidatePath('/baseball/dashboard/teams');
        return { success: true, data: invite };
      }

      if (isUniqueViolation(error)) {
        continue;
      }

      await logServerError(
        `Failed to create team invitation for team ${teamId}: ${describeError(error)}`,
        { action: 'teams.createTeamInvitation' },
      );
      return { success: false, error: 'Failed to generate invite. Please try again.' };
    }

    return { success: false, error: 'Failed to generate a unique invite code. Please try again.' };
  },
);

/**
 * Revoke (deactivate) an existing team invitation. The team_id needed for the
 * capability check is not known up front — teamFrom must resolve
 * synchronously from the action's args, but the caller here only has an
 * invitation id — so the capability check is done manually inside the body
 * (resolve the invitation's team_id first, THEN enforce can_manage_settings)
 * rather than via the wrapper's `teamFrom` option.
 */
export const revokeTeamInvitation = withBaseballAction(
  'revokeTeamInvitation',
  { featureArea: 'baseball-teams' },
  async (_ctx, invitationId: string): Promise<TeamActionResult> => {
    const supabase = await createClient();

    const { data: invitation, error: inviteError } = await supabase
      .from('baseball_team_invitations')
      .select('id, team_id')
      .eq('id', invitationId)
      .maybeSingle();

    if (inviteError || !invitation) {
      return { success: false, error: 'Invitation not found.' };
    }

    try {
      await requireBaseballCapability(invitation.team_id, 'can_manage_settings');
    } catch {
      return { success: false, error: 'You do not have permission to manage this team.' };
    }

    const { error: updateError } = await supabase
      .from('baseball_team_invitations')
      .update({ is_active: false })
      .eq('id', invitationId);

    if (updateError) {
      await logServerError(
        `Failed to revoke invitation ${invitationId}: ${describeError(updateError)}`,
        { action: 'teams.revokeTeamInvitation' },
      );
      return { success: false, error: 'Failed to revoke invite. Please try again.' };
    }

    revalidatePath('/baseball/dashboard/teams');
    return { success: true };
  },
);

// ============================================================================
// DECISION ROOM + STAFF SETTINGS — re-exports
//
// NOTE: Staff Decision Room + Staff Settings symbols (getDecisionRoomData,
// getStaffSettingsData, the meeting-item mutations, and all DecisionRoom*/Staff*
// types) live in the sibling './decision-room' module. Consumers import them
// from '@/app/baseball/actions/decision-room' DIRECTLY — a 'use server' file
// cannot re-export values (Next.js: only inline `export async function`).

export const validatePlayerCanJoinTeam = withAdminObserved(
  'validatePlayerCanJoinTeam',
  { sport: 'baseball', feature: 'baseball_teams', featureArea: 'baseball-teams' },
  validatePlayerCanJoinTeamImpl,
);

export const joinTeam = withAdminObserved(
  'joinTeam',
  { sport: 'baseball', feature: 'baseball_teams', featureArea: 'baseball-teams' },
  joinTeamImpl,
);

export const processTeamInvitation = withAdminObserved(
  'processTeamInvitation',
  { sport: 'baseball', feature: 'baseball_teams', featureArea: 'baseball-teams' },
  processTeamInvitationImpl,
);

export const joinTeamByCode = withAdminObserved(
  'joinTeamByCode',
  { sport: 'baseball', feature: 'baseball_teams', featureArea: 'baseball-teams' },
  joinTeamByCodeImpl,
);
