'use server';

import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { processGolfTeamInvitation } from '@/app/golf/actions/teams';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeError } from '@/lib/utils/describe-error';

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const coachOnboardingSchema = z.object({
  // Organization
  orgName: z.string().min(1, 'Organization name is required').max(200),
  division: z.string().max(50).optional(),
  conference: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  // Team
  teamName: z.string().max(200).optional(),
  season: z.string().max(20).optional(),
  gender: z.enum(['mens', 'womens']).optional().default('mens'),
  // Profile
  fullName: z.string().min(1, 'Full name is required').max(200),
  title: z.string().max(100).optional(),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  avatarUrl: z.string().url().max(2048).optional().or(z.literal('')),
});

const playerOnboardingSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email().max(255).optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  gradYear: z.number().int().min(2020).max(2040).optional(),
  handicap: z.number().min(-10).max(54).optional(),
  hometown: z.string().max(100).optional(),
  state: z.string().max(2).optional(),
  gpa: z.number().min(0).max(5).optional(),
  avatarUrl: z.string().url().max(2048).optional().or(z.literal('')),
});

export type CoachOnboardingInput = z.infer<typeof coachOnboardingSchema>;
export type PlayerOnboardingInput = z.infer<typeof playerOnboardingSchema>;

// ============================================================================
// COACH ONBOARDING ACTION
// ============================================================================

/**
 * Complete coach onboarding with atomic-like cleanup on failure
 * Creates: organization -> team -> coach record
 * Cleans up partial data if any step fails
 */
async function completeCoachOnboardingImpl(input: CoachOnboardingInput) {
  const supabase = await createClient();

  // Track created resources for cleanup
  let createdOrgId: string | null = null;
  let createdCoachId: string | null = null;
  let createdTeamId: string | null = null;

  try {
    // Validate input server-side
    const validatedData = coachOnboardingSchema.parse(input);

    // Get current user - try multiple times with delay for session propagation
    let user = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        user = data.user;
        break;
      }
      // Wait 500ms between attempts for session to propagate
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!user) {
      await logServerError('[Onboarding] No authenticated user after 5 attempts', { action: 'onboarding.completeCoachOnboarding' });
      return { success: false, error: 'Session not found. Please try logging in again, or check if email confirmation is required in Supabase settings.' };
    }

    // Ensure users table record exists with correct role
    // Note: 'sport' column doesn't exist on users table, role is sufficient
    const { error: usersError } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email || '',
        role: 'coach',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });

    if (usersError) {
      await logServerError(`[Onboarding] Users upsert warning: ${describeError(usersError)}`, { action: 'onboarding.completeCoachOnboarding' });
      // Continue - record might exist
    }

    // Step 1: Create organization
    // Note: golf_coaches.organization_id FK to golf_organizations was dropped in production.
    // All existing data references the shared 'organizations' table.
    // Trim the name so whitespace variants ("University of Lynchburg " vs
    // "University of Lynchburg") can't create duplicate-school org rows. The DB
    // unique index organizations_normalized_name_uidx is the hard backstop.
    const orgName = validatedData.orgName.trim();
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        type: 'college',
        division: validatedData.division || null,
        conference: validatedData.conference || null,
        location_city: validatedData.city || null,
        location_state: validatedData.state || null,
      })
      .select('id')
      .single();

    if (orgError || !org) {
      // 23505 = unique violation on organizations_normalized_name_uidx: a school
      // with this name already exists. Don't silently create a duplicate org —
      // direct the coach to be added to the existing program instead.
      if ((orgError as { code?: string } | null)?.code === '23505') {
        await logServerError(`[Onboarding] Duplicate organization name rejected: "${orgName}"`, { action: 'onboarding.completeCoachOnboarding' });
        return {
          success: false,
          error: `An organization named "${orgName}" already exists. Ask your program's head coach to add you to the team, or contact support if you believe this is a mistake.`,
        };
      }
      await logServerError(`[Onboarding] Organization creation failed: ${describeError(orgError)}`, { action: 'onboarding.completeCoachOnboarding' });
      return { success: false, error: 'Failed to create organization. Please try again.' };
    }

    createdOrgId = org.id;

    // Step 2: Create coach record first (team needs created_by reference)
    const coachData = {
      user_id: user.id,
      organization_id: org.id,
      full_name: validatedData.fullName,
      title: validatedData.title || null,
      email: validatedData.email || null,
      phone: validatedData.phone || null,
      avatar_url: validatedData.avatarUrl || null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    // #1250 — this was a bare INSERT, and `golf_coaches` has UNIQUE (user_id).
    // A user who already had a coach row but `onboarding_completed = false`
    // therefore hit a constraint violation on every attempt: the wizard reported
    // "Failed to create coach profile. Please try again.", and retrying minted a
    // fresh organization, failed the same way, and rolled that org back — a loop
    // the user could never win and could not leave.
    //
    // Upsert is also the honest semantics: completeCoachOnboarding means "make
    // my coach profile correct and mark me onboarded", which is idempotent.
    //
    // Not reachable in normal operation today — signup does not pre-create a
    // coach row, no staff-invite flow does either, and this action is the only
    // `golf_coaches` insert in the codebase — so this is hardening, not a live
    // bug fix. It costs one word and removes an unrecoverable dead end.
    const { data: preExistingCoach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { data: coach, error: coachError } = await supabase
      .from('golf_coaches')
      .upsert(coachData, { onConflict: 'user_id' })
      .select('id')
      .single();

    if (coachError || !coach) {
      await logServerError(`[Onboarding] Coach creation failed: ${describeError(coachError)}`, { action: 'onboarding.completeCoachOnboarding' });
      // Cleanup: Delete the organization we created
      await supabase.from('organizations').delete().eq('id', org.id);
      return { success: false, error: 'Failed to create coach profile. Please try again.' };
    }

    // Only ever roll back a coach row THIS call created. With the upsert above,
    // `coach.id` can now be a row that already existed, and the rollback paths
    // below delete by that id — deleting a pre-existing coach profile because a
    // later step failed would turn a recoverable error into data loss.
    createdCoachId = preExistingCoach ? null : coach.id;

    // Step 3: Create team (now we have coach.id for created_by)
    const joinCode = generateJoinCode();
    // INSERT without RETURNING, then read back with admin.
    //
    // `.select()` after `.insert()` is a RETURNING clause, and RETURNING is
    // filtered by the SELECT policy. `golf_teams_select` gates on
    // `is_golf_team_coach(id)`, which requires the golf_team_coach_staff row
    // created in Step 4 below — so at THIS point the coach cannot read the team
    // they are creating, and the statement fails 42501. The write itself is
    // fine; only the read-back is impossible. Scoped to the unique join code.
    const { error: teamError } = await supabase
      .from('golf_teams')
      .insert({
        organization_id: org.id,
        name: validatedData.teamName || `${orgName} Golf`,
        season: validatedData.season || getCurrentSeason(),
        join_code: joinCode,
        created_by: coach.id,
        gender: validatedData.gender,
      });

    const team = teamError
      ? null
      : (
          await createAdminClient()
            .from('golf_teams')
            .select('id')
            .eq('join_code', joinCode)
            .maybeSingle()
        ).data ?? null;

    if (teamError || !team) {
      await logServerError(`[Onboarding] Team creation failed: ${describeError(teamError)}`, { action: 'onboarding.completeCoachOnboarding' });
      // Cleanup: Delete coach and organization
      // #1250 — only a row THIS call created; `coach.id` may now be a
      // pre-existing profile (the write above is an upsert).
      if (createdCoachId) await supabase.from('golf_coaches').delete().eq('id', createdCoachId);
      await supabase.from('organizations').delete().eq('id', org.id);
      return { success: false, error: 'Failed to create team. Please try again.' };
    }

    createdTeamId = team.id;

    // Step 4: Add coach to team staff (required for RLS policies).
    // The new `golf_team_coach_staff_insert` policy (PR #16) requires the caller
    // to already be a primary coach on the team, which the bootstrap coach
    // obviously isn't yet. Use the admin client for this single bootstrap row;
    // the user is already authenticated server-side and we just created the
    // coach + team records they own.
    const admin = createAdminClient();
    const { error: staffError } = await admin
      .from('golf_team_coach_staff')
      .insert({
        team_id: team.id,
        coach_id: coach.id,
        role: 'head_coach',
        is_primary: true,
      });

    if (staffError) {
      await logServerError(`[Onboarding] Team staff assignment failed: ${describeError(staffError)}`, { action: 'onboarding.completeCoachOnboarding' });
      // Cleanup: Delete team, coach, and organization
      await supabase.from('golf_teams').delete().eq('id', team.id);
      // #1250 — only a row THIS call created; `coach.id` may now be a
      // pre-existing profile (the write above is an upsert).
      if (createdCoachId) await supabase.from('golf_coaches').delete().eq('id', createdCoachId);
      await supabase.from('organizations').delete().eq('id', org.id);
      return { success: false, error: 'Failed to assign coach to team. Please try again.' };
    }

    revalidatePath('/golf/dashboard');

    return {
      success: true,
      data: {
        organizationId: org.id,
        teamId: team.id,
        joinCode,
      }
    };

  } catch (error) {
    // Cleanup any partially created resources (in reverse order of creation).
    // The inner error handlers already roll back when a known step fails; this
    // outer guard covers a throw between steps (e.g. the staff insert) so we
    // never leak an orphan team/coach/org on an unexpected mid-flow error.
    if (createdTeamId) {
      await supabase.from('golf_teams').delete().eq('id', createdTeamId);
    }
    if (createdCoachId) {
      await supabase.from('golf_coaches').delete().eq('id', createdCoachId);
    }
    if (createdOrgId) {
      await supabase.from('organizations').delete().eq('id', createdOrgId);
    }

    await logServerError(`[Onboarding] Unexpected error: ${describeError(error)}`, { action: 'onboarding.completeCoachOnboarding' });
    return formatSafeErrorResponse(error);
  }
}

const observedCompleteCoachOnboarding = withAdminObserved(
  'completeCoachOnboarding',
  { sport: 'golf', feature: 'auth_onboarding' },
  completeCoachOnboardingImpl,
);

export async function completeCoachOnboarding(input: CoachOnboardingInput) {
  return observedCompleteCoachOnboarding(input);
}

// ============================================================================
// ENSURE PLAYER RECORD EXISTS (called early in onboarding)
// ============================================================================

/**
 * Ensure a golf_players record exists for the current user.
 * Called on onboarding page load so the record is created even if the user
 * abandons onboarding before clicking "Go to Dashboard".
 * Sets onboarding_completed = false — the final step flips it to true.
 */
async function ensurePlayerRecordImpl() {
  const supabase = await createClient();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if record already exists
    const { data: existing } = await supabase
      .from('golf_players')
      .select('id, onboarding_completed')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      // Record exists — return it
      return { success: true, playerId: existing.id, onboardingCompleted: existing.onboarding_completed };
    }

    // Guard: never mint an empty golf_players row for a coach. This action runs
    // on /golf/player load for ANY authenticated user; a coach who lands here
    // (mis-routed link, role-switch) would otherwise get a stray player record
    // and a player upsert below that clobbers their 'coach' role to 'player'.
    const { data: coachRecord } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (coachRecord) {
      return { success: false, error: 'Account is a coach; no player record created.' };
    }

    // Ensure users table record exists
    await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email || '',
        role: 'player',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });

    // Create minimal golf_players record with onboarding_completed = false
    const firstName = user.user_metadata?.first_name || '';
    const lastName = user.user_metadata?.last_name || '';

    const { data: player, error: insertError } = await supabase
      .from('golf_players')
      .insert({
        user_id: user.id,
        first_name: firstName,
        last_name: lastName,
        email: user.email || null,
        onboarding_completed: false,
      })
      .select('id')
      .single();

    if (insertError) {
      await logServerError(`[ensurePlayerRecord] Insert failed: ${describeError(insertError)}`, { action: 'onboarding.ensurePlayerRecord' });
      return { success: false, error: insertError.message };
    }

    revalidatePath('/golf/player');
    return { success: true, playerId: player.id, onboardingCompleted: false };
  } catch (error) {
    await logServerError(`[ensurePlayerRecord] Error: ${describeError(error)}`, { action: 'onboarding.ensurePlayerRecord' });
    return { success: false, error: 'Failed to ensure player record' };
  }
}

const observedEnsurePlayerRecord = withAdminObserved(
  'ensurePlayerRecord',
  { sport: 'golf', feature: 'auth_onboarding' },
  ensurePlayerRecordImpl,
);

export async function ensurePlayerRecord() {
  return observedEnsurePlayerRecord();
}

// ============================================================================
// PLAYER ONBOARDING ACTION
// ============================================================================

/**
 * Complete player onboarding
 * Creates or updates player record, optionally auto-joins a team via joinCode
 */
async function completePlayerOnboardingImpl(input: PlayerOnboardingInput, joinCode?: string) {
  const supabase = await createClient();

  try {
    // Validate input server-side
    const validatedData = playerOnboardingSchema.parse(input);

    // Get current user - try multiple times with delay for session propagation
    let user = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        user = data.user;
        break;
      }
      // Wait 500ms between attempts for session to propagate
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (!user) {
      await logServerError('[Onboarding] No authenticated user after 5 attempts', { action: 'onboarding.completePlayerOnboarding' });
      return { success: false, error: 'Session not found. Please try logging in again, or check if email confirmation is required in Supabase settings.' };
    }

    // Ensure users table record exists with correct role
    const { error: usersError } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email || '',
        role: 'player',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'id',
        ignoreDuplicates: true,
      });

    if (usersError) {
      await logServerError(`[Onboarding] Users upsert warning: ${describeError(usersError)}`, { action: 'onboarding.completePlayerOnboarding' });
    }

    // Check for existing player record
    const { data: existingPlayer } = await supabase
      .from('golf_players')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const playerData = {
      first_name: validatedData.firstName,
      last_name: validatedData.lastName,
      email: validatedData.email || null,
      phone: validatedData.phone || null,
      graduation_year: validatedData.gradYear || null,
      handicap: validatedData.handicap != null ? validatedData.handicap : null,
      hometown: validatedData.hometown || null,
      state: validatedData.state || null,
      gpa: validatedData.gpa != null ? validatedData.gpa : null,
      avatar_url: validatedData.avatarUrl || null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    let playerId = existingPlayer?.id ?? null;

    if (existingPlayer) {
      const { error } = await supabase
        .from('golf_players')
        .update(playerData)
        .eq('id', existingPlayer.id);

      if (error) {
        await logServerError(`[Onboarding] Player update failed: ${describeError(error)}`, { action: 'onboarding.completePlayerOnboarding' });
        return { success: false, error: 'Failed to update player profile. Please try again.' };
      }
    } else {
      const { data: created, error } = await supabase
        .from('golf_players')
        .insert({
          user_id: user.id,
          ...playerData,
        })
        .select('id')
        .single();

      if (error) {
        await logServerError(`[Onboarding] Player creation failed: ${describeError(error)}`, { action: 'onboarding.completePlayerOnboarding' });
        return { success: false, error: 'Failed to create player profile. Please try again.' };
      }
      playerId = created?.id ?? null;
    }

    // Coach-invited players arrive with the team join code in tow (carried
    // through the invite link → signup gate → onboarding). Auto-add them to
    // that team here so the invite actually lands them on the roster.
    // Best-effort: a bad/expired code or an "already on a team" conflict never
    // blocks onboarding — the player still completes setup and reaches the
    // dashboard, where they can join from the invite link as a fallback.
    let joinedTeam = false;
    if (joinCode?.trim() && playerId) {
      try {
        const joinResult = await processGolfTeamInvitation(joinCode.trim(), playerId);
        joinedTeam = joinResult.success === true;
        if (!joinedTeam) {
          await logServerError(`[Onboarding] Auto-join skipped (${joinResult.error ?? 'unknown'}) for code ${joinCode.trim().toUpperCase()}`, { action: 'onboarding.completePlayerOnboarding' });
        }
      } catch (joinError) {
        await logServerError(`[Onboarding] Auto-join threw: ${describeError(joinError)}`, { action: 'onboarding.completePlayerOnboarding' });
      }
    }

    revalidatePath('/golf/dashboard');

    return {
      success: true,
      joinedTeam,
    };

  } catch (error) {
    await logServerError(`[Onboarding] Unexpected error: ${describeError(error)}`, { action: 'onboarding.completePlayerOnboarding' });
    return formatSafeErrorResponse(error);
  }
}

const observedCompletePlayerOnboarding = withAdminObserved(
  'completePlayerOnboarding',
  { sport: 'golf', feature: 'auth_onboarding' },
  completePlayerOnboardingImpl,
);

export async function completePlayerOnboarding(input: PlayerOnboardingInput, joinCode?: string) {
  return observedCompletePlayerOnboarding(input, joinCode);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a random 6-character alphanumeric join code
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed I,O,0,1 for clarity
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

/**
 * Get current season string (e.g., "2024-25")
 */
function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Academic year starts in August
  if (month >= 7) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  }
  return `${year - 1}-${year.toString().slice(2)}`;
}
