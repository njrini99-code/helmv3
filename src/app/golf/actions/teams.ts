'use server';

import { randomInt } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { revalidatePath } from 'next/cache';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { maybeCaptureRlsDenial } from '@/lib/admin/rls-denial';
import { describeError } from '@/lib/utils/describe-error';
import {
  signStaffInvite,
  verifyStaffInvite,
  STAFF_INVITE_TTL_MS,
  type StaffInviteRole,
} from '@/lib/golf/staff-invite';

// ============================================================================
// TYPES
// ============================================================================

export interface TeamActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface TeamData {
  id: string;
  name: string;
  season: string | null;
  join_code: string;
  created_at: string | null;
}

export interface TeamValidationResult {
  canJoin: boolean;
  /**
   * The player is ALREADY on the team they are trying to join. Distinct from
   * every other `canJoin: false`, because the caller treats it as SUCCESS —
   * the desired end state already holds. Kept separate rather than folded into
   * `canJoin: true` so the join never re-runs the INSERT and the coach never
   * gets a duplicate "player joined" notification.
   */
  alreadyOnThisTeam?: boolean;
  reason?: string;
  currentTeam?: { id: string; name: string };
}

/**
 * A team already resolved via the SECURITY DEFINER `golf_team_by_join_code`.
 * Threaded into the join path because a player who is not yet a member cannot
 * read golf_teams directly — `golf_teams_select` gates on coach-or-member.
 */
export interface ResolvedTeamRef {
  id: string;
  name: string;
  organizationId?: string | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get team_id for a coach via organization lookup
 * Note: golf_coaches doesn't have team_id directly - we get it from golf_teams via organization_id
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

/**
 * Generate a readable 8-character team join code.
 *
 * Charset is 32 chars (A-Z minus I/O, digits 2-9), so 8 chars carries exactly
 * 40 bits of entropy — ~1.1e12 codes, not brute-forceable over a network.
 *
 * This docstring previously said "6-character" and claimed `L` was excluded;
 * the loop runs 8 times and `L` is in the charset. Only I, O, 0 and 1 are
 * dropped. That mattered: the code's strength is the ONLY thing standing
 * between a guessed code and a roster join, so a doc that understates its
 * length invites someone to "simplify" it back down. Must match the format
 * used in onboarding.ts.
 *
 * NOTE this is a PLAYER credential — it is handed to every athlete on the
 * roster. It must never be sufficient to grant staff access; staff come from
 * head-coach-minted signed invites (src/lib/golf/staff-invite.ts).
 */
function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomInt(chars.length));
  }
  return code;
}

// ============================================================================
// TEAM VALIDATION
// ============================================================================

/**
 * Validates whether a golf player can join a team
 * Golf players can only be on ONE team at a time
 * Note: golf_players doesn't have team_id - we check golf_team_members
 */
async function validateGolfPlayerCanJoinTeamImpl(
  playerId: string,
  teamId: string,
  /**
   * The team as already resolved by the caller through the SECURITY DEFINER
   * `golf_team_by_join_code`. Required in practice for a prospective member —
   * see the existence check below for why a direct read cannot work.
   */
  resolvedTeam?: ResolvedTeamRef | null
): Promise<TeamValidationResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      canJoin: false,
      reason: 'You must be logged in to join a team',
    };
  }

  // Get player and verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id, onboarding_completed')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return {
      canJoin: false,
      reason: 'Player not found',
    };
  }

  // Verify the authenticated user owns this player profile
  if (player.user_id !== user.id) {
    return {
      canJoin: false,
      reason: 'You can only join teams with your own player profile',
    };
  }

  // Verify onboarding is completed
  if (!player.onboarding_completed) {
    return {
      canJoin: false,
      reason: 'Please complete your player profile before joining a team',
    };
  }

  // Confirm the team being joined exists.
  //
  // This CANNOT be a plain read of golf_teams. `golf_teams_select` is
  // `USING (is_golf_team_coach(id) OR is_golf_team_player(id))`, and a player
  // about to join is, by definition, neither yet — the read returns zero rows
  // for exactly the people this function exists to let through, and the join
  // died here with a misleading "Team not found".
  //
  // The caller has already resolved the team through the SECURITY DEFINER
  // `golf_team_by_join_code`, which is the only way to see a team you are not
  // on. It passes that resolution in. This does not widen anything: the actual
  // membership INSERT is performed by `golf_join_team_with_code`, which
  // re-resolves the team from the code server-side and ignores any id it is
  // handed. Validation is a pre-flight for error messaging; authorization
  // lives in the definer function.
  let targetTeam = resolvedTeam ?? null;

  if (!targetTeam) {
    const { data, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, name')
      .eq('id', teamId)
      .single();

    // PGRST116 here is the expected outcome, not a fault: the RLS note above
    // says a prospective member reads zero rows. Any OTHER error is a failed
    // read, and telling someone with a valid join code "Team not found" sends
    // them to hunt for a typo in a code that is fine.
    if (teamError && teamError.code !== 'PGRST116') {
      await logServerError(
        `join validation team read failed: ${describeError(teamError)}`,
        { action: 'teams.validateGolfPlayerCanJoinTeam', featureArea: 'teams' },
        'warning'
      );
      return {
        canJoin: false,
        reason: "Couldn't look up that team just now. Please try again.",
      };
    }
    targetTeam = data;
  }

  if (!targetTeam || targetTeam.id !== teamId) {
    return {
      canJoin: false,
      reason: 'Team not found',
    };
  }

  // Check if already on any team via golf_team_members.
  //
  // NOT `.maybeSingle()`. There is no unique constraint on player_id alone, so
  // maybeSingle() raises PGRST116 the moment a player has two rows — and the
  // error was DISCARDED here (only `data` was destructured), leaving
  // `existingMembership` null and this guard silently passing. The one-team
  // rule is then enforced nowhere in this function, and the failure surfaces
  // later as a raw constraint error. Take the rows and reason about them.
  const { data: memberships, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId);

  if (membershipError) {
    // Never guess on a failed read here: guessing "no memberships" lets a
    // player join a second team, and guessing the opposite locks out a
    // legitimate first join.
    return {
      canJoin: false,
      reason: 'Could not verify your current team. Please try again.',
    };
  }

  const existingMembership = memberships?.find((m) => m.team_id === teamId) ?? memberships?.[0] ?? null;

  if (existingMembership) {
    // Already on the team being joined — the CALLER treats this as success and
    // sends the player to their dashboard. See the note in joinGolfTeamImpl.
    if (existingMembership.team_id === teamId) {
      return {
        canJoin: false,
        alreadyOnThisTeam: true,
        reason: 'You are already a member of this team',
      };
    }

    // Already on a different team. The name is decoration on a decision that
    // has already been made, so a failed read degrades to "another team" — but
    // it degrades LOUDLY. A player told "you are already on another team" with
    // no name has nothing to act on, and that reads as a bug to them.
    const { data: currentTeam, error: currentTeamError } = await supabase
      .from('golf_teams')
      .select('id, name')
      .eq('id', existingMembership.team_id)
      .single();

    if (currentTeamError) {
      await logServerError(
        `current-team name read failed, falling back to "another team": ${describeError(currentTeamError)}`,
        { action: 'teams.validateGolfPlayerCanJoinTeam', featureArea: 'teams' },
        'warning'
      );
    }

    return {
      canJoin: false,
      reason: `You are already on ${currentTeam?.name || 'another team'}. Golf players can only be on one team at a time.`,
      currentTeam: currentTeam || undefined,
    };
  }

  // Validation passed
  return {
    canJoin: true,
  };
}

const observedValidateGolfPlayerCanJoinTeam = withAdminObserved(
  'validateGolfPlayerCanJoinTeam',
  { sport: 'golf', feature: 'join_team_flow' },
  validateGolfPlayerCanJoinTeamImpl,
);

export async function validateGolfPlayerCanJoinTeam(
  playerId: string,
  teamId: string,
  resolvedTeam?: ResolvedTeamRef | null
): Promise<TeamValidationResult> {
  return observedValidateGolfPlayerCanJoinTeam(playerId, teamId, resolvedTeam);
}

/**
 * The shape both join paths return.
 *
 * Stated explicitly rather than inferred. With inference, `alreadyMember`
 * exists on only one arm of a three-arm union, so every caller and test that
 * reads it after checking `success` is a type error — `expect(...)` narrows
 * nothing for the compiler. That broke `main`'s typecheck, and since
 * `next.config.mjs` sets `typescript: { ignoreBuildErrors: false }` and
 * tsconfig's `include` covers tests, it fails the PRODUCTION BUILD, not just
 * CI. All existing return shapes already satisfy this; no runtime change.
 */
export interface GolfJoinTeamResult {
  success: boolean;
  /** Already on this team — an idempotent no-op, not a failure. */
  alreadyMember?: boolean;
  error?: string;
}

/**
 * Add a golf player to a team via golf_team_members
 * Also notifies coaches when a player joins
 */
async function joinGolfTeamImpl(
  playerId: string,
  teamId: string,
  joinCode?: string,
  resolvedTeam?: ResolvedTeamRef | null
): Promise<GolfJoinTeamResult> {
  const supabase = await createClient();

  // Validate first
  const validation = await validateGolfPlayerCanJoinTeam(playerId, teamId, resolvedTeam);

  // ALREADY ON THIS TEAM IS SUCCESS, NOT FAILURE. Joining has to be idempotent.
  //
  // Measured on production 2026-08-06: three BRAND-NEW players hit
  // "You are already a member of this team" within minutes of signing up —
  // shcurry0621@ signed up 18:24:10 and saw it at 18:25:21, 67 seconds later.
  // The membership already exists by the time this runs (signup through a join
  // link creates it), so the join link's own confirmation step then reported
  // the correct end state as an error. The last thing a new paying customer saw
  // on their way in was a red failure, on a team they were already on.
  //
  // Anything that lands the player on the team they asked for is a success —
  // whether this call created the row or found it already there. Only a
  // DIFFERENT team is a real conflict, and that keeps its own message.
  if (validation.alreadyOnThisTeam) {
    return { success: true, alreadyMember: true };
  }

  if (!validation.canJoin) {
    return {
      success: false,
      error: validation.reason || 'Cannot join this team',
    };
  }

  // Get player details for notification.
  //
  // Every read between here and the notification insert is a gate on "a player
  // joined your team" reaching a coach — `if (player && team?.organization_id)`
  // below, then `if (coaches && coaches.length > 0)`. A failure in any of them
  // produced a null, skipped the notify block, and returned success. That is
  // how this notification went dark for six months before anyone noticed: the
  // join worked, so nothing looked wrong.
  //
  // The join must still succeed if these fail — a coach's notification is not
  // worth failing a player's join over. But the failure gets recorded now, so
  // the next silent stretch is visible in Bridge instead of being inferred
  // from a months-old last-sent date.
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name, user_id')
    .eq('id', playerId)
    .single();

  if (playerError) {
    await logServerError(
      `player read failed after join; coach notification will be skipped: ${describeError(playerError)}`,
      { action: 'teams.joinGolfTeam', featureArea: 'teams' },
      'warning'
    );
  }

  // Get team details including organization, for the coach notification below.
  //
  // Same RLS constraint as the validator, and it bites here too: this runs
  // BEFORE the membership INSERT, so a joining player still cannot read the
  // team and `team` came back null — which silently skipped the "a player
  // joined your team" notification on every invite. Prefer the team the caller
  // already resolved through the definer function.
  let team: { id: string; name: string; organization_id: string | null } | null =
    resolvedTeam
      ? {
          id: resolvedTeam.id,
          name: resolvedTeam.name,
          organization_id: resolvedTeam.organizationId ?? null,
        }
      : null;

  if (!team) {
    const { data, error: teamError } = await supabase
      .from('golf_teams')
      .select('id, name, organization_id')
      .eq('id', teamId)
      .single();

    // As above: zero rows is the documented RLS outcome for a player who is not
    // on the team yet, and the caller normally passes `resolvedTeam` so this
    // does not run at all. A different error means the read failed.
    if (teamError && teamError.code !== 'PGRST116') {
      await logServerError(
        `team read failed after join; coach notification will be skipped: ${describeError(teamError)}`,
        { action: 'teams.joinGolfTeam', featureArea: 'teams' },
        'warning'
      );
    }
    team = data;
  }

  // Create team membership record.
  //
  // #1257 — a player self-join now has to PROVE the join code. The old
  // `"Players can join teams"` INSERT policy only asserted that the target team
  // HAD a code; a WITH CHECK clause cannot see what the user typed, so any
  // authenticated player could insert themselves into any team. That policy is
  // gone, and the self-join goes through a SECURITY DEFINER RPC that resolves
  // the team from the code server-side.
  //
  // The coach-side path (approving a join request, teams.ts:942) is unchanged —
  // it is covered by `golf_team_members_insert_coach USING is_golf_team_coach()`.
  const { error } = joinCode
    ? await supabase.rpc('golf_join_team_with_code', { p_code: joinCode })
    : await supabase
        .from('golf_team_members')
        .insert({
          player_id: playerId,
          team_id: teamId,
          status: 'active',
        });

  if (error) {
    maybeCaptureRlsDenial(error, {
      table: 'golf_team_members',
      verb: 'insert',
      action: 'joinGolfTeam',
      feature: 'join_team_flow',
      sport: 'golf',
    });
    return {
      success: false,
      error: 'Failed to join team. Please try again.',
    };
  }

  // Notify coaches about the new team member
  if (player && team?.organization_id) {
    try {
      // Find all coaches for this organization
      const { data: coaches, error: coachesError } = await supabase
        .from('golf_coaches')
        .select('id, user_id')
        .eq('organization_id', team.organization_id);

      if (coachesError) {
        await logServerError(
          `coach lookup failed after join; nobody was notified: ${describeError(coachesError)}`,
          { action: 'teams.joinGolfTeam', featureArea: 'teams' },
          'warning'
        );
      }

      if (coaches && coaches.length > 0) {
        const playerName = `${player.first_name} ${player.last_name}`.trim();

        // Create notifications for each coach
        const notifications = coaches.map((coach) => ({
          user_id: coach.user_id,
          type: 'team_join' as const,
          title: 'New Player Joined',
          body: `${playerName} has joined ${team.name}`,
          action_url: '/golf/dashboard/roster',
          data: {
            player_id: playerId,
            player_name: playerName,
            team_id: teamId,
            team_name: team.name,
          },
          read: false,
        }));

        // Written with the service-role client, not the caller's.
        //
        // `notifications_insert_own` is WITH CHECK (user_id = auth.uid()), so a
        // player literally cannot address a row to their coach — every "New
        // Player Joined" insert had been silently rejected since that policy
        // landed, and the join swallowed it as a best-effort failure. The last
        // notification this path produced was 2026-02-10.
        //
        // Elevating is safe here: the join itself was already authorized by
        // golf_join_team_with_code above, the recipients are exactly the
        // coaches of the org that owns the joined team, and the payload is
        // server-derived. Same pattern as the CoachHelm dispatcher's in-app
        // receipt (lib/coachhelm/v3/notifications/dispatch.ts).
        const admin = createAdminClient();
        const { error: notifyError } = await fromUntyped(admin, 'notifications').insert(notifications);
        if (notifyError) {
          await logServerError(
            `join notification insert failed: ${describeError(notifyError)}`,
            { action: 'teams.joinGolfTeam', featureArea: 'teams' },
            'warning'
          );
        }
      }
    } catch (error) {
      // Don't fail the join if notification fails
      await logServerError(
        `Unexpected error: ${describeError(error)}`,
        { action: 'teams.joinGolfTeam', featureArea: 'teams' },
        'warning'
      );
    }
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
  };
}

const observedJoinGolfTeam = withAdminObserved(
  'joinGolfTeam',
  { sport: 'golf', feature: 'join_team_flow' },
  joinGolfTeamImpl,
);

export async function joinGolfTeam(
  playerId: string,
  teamId: string,
  joinCode?: string,
  resolvedTeam?: ResolvedTeamRef | null
) {
  return observedJoinGolfTeam(playerId, teamId, joinCode, resolvedTeam);
}

/**
 * Process a golf team join code
 * Note: golf_teams uses join_code, not invite_code
 */
async function processGolfTeamInvitationImpl(joinCode: string, playerId: string): Promise<GolfJoinTeamResult> {
  const supabase = await createClient();

  // Normalize join code to uppercase for case-insensitive matching
  const normalizedCode = joinCode.toUpperCase();

  // Find the team by join code.
  //
  // #1257 — resolving this with `.eq('join_code', …)` only worked because a
  // policy read `USING (join_code IS NOT NULL)`, which made every team and
  // every code readable by any signed-in user. The lookup is now a SECURITY
  // DEFINER function that returns just the matching team and never its code.
  const { data: teamRows, error: teamError } = await supabase
    .rpc('golf_team_by_join_code', { p_code: normalizedCode });

  const team = Array.isArray(teamRows) ? teamRows[0] : teamRows;

  if (teamError || !team) {
    return {
      success: false,
      error: 'Invalid join code',
    };
  }

  // Pass the code through: the membership INSERT is performed by
  // golf_join_team_with_code, which re-resolves the team from the code
  // server-side rather than trusting a team id from the client.
  //
  // `team` is also handed down so the pre-flight validator does not have to
  // re-read golf_teams under RLS — a read a prospective member can never
  // satisfy, which silently killed every join.
  return await joinGolfTeam(playerId, team.id, normalizedCode, {
    id: team.id,
    name: team.name,
    organizationId: team.organization_id ?? null,
  });
}

const observedProcessGolfTeamInvitation = withAdminObserved(
  'processGolfTeamInvitation',
  { sport: 'golf', feature: 'join_team_flow' },
  processGolfTeamInvitationImpl,
);

export async function processGolfTeamInvitation(joinCode: string, playerId: string) {
  return observedProcessGolfTeamInvitation(joinCode, playerId);
}

// ============================================================================
// TEAM CRUD OPERATIONS
// ============================================================================

/**
 * Create a new team and link it to the current coach's organization
 */
async function createTeamImpl(
  name: string,
  season: string,
  gender: 'mens' | 'womens' = 'mens'
): Promise<TeamActionResult<TeamData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach record — maybeSingle() to avoid PGRST116 if user is not a coach
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Check if coach already has a team via organization
  const existingTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (existingTeamId) {
    return { success: false, error: 'You already have a team. Please update it instead.' };
  }

  const joinCode = generateJoinCode();

  // Create team linked to coach's organization. gender is written explicitly so
  // the legacy create path no longer silently defaults every team to 'mens'.
  // Same RLS shape as addSecondTeam below: RETURNING is filtered by
  // `golf_teams_select`, which needs a golf_team_coach_staff row that does not
  // exist for a team being created right now. Insert under the caller's RLS,
  // read back with admin, scoped to the unique join code.
  const { error: teamError } = await supabase
    .from('golf_teams')
    .insert({
      name: name.trim(),
      gender,
      season: season,
      join_code: joinCode,
      organization_id: coach.organization_id,
      created_by: coach.id,
    });

  const newTeam = teamError
    ? null
    : (
        await createAdminClient()
          .from('golf_teams')
          .select('id, name, season, join_code, created_at')
          .eq('join_code', joinCode)
          .maybeSingle()
      ).data ?? null;

  if (teamError) {
    // 23505 = golf_teams_org_gender_uidx: the program already has a team of this
    // gender (one men's + one women's per program).
    if (teamError.code === '23505') {
      const label = gender === 'mens' ? "Men's" : "Women's";
      return { success: false, error: `Your program already has a ${label} team.` };
    }
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  if (!newTeam) {
    // The row went in but could not be read back even with admin — treat as a
    // failure rather than pressing on with no team id to attach staff to.
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Add coach to team staff (required for RLS policies to grant access)
  const { error: staffError } = await supabase
    .from('golf_team_coach_staff')
    .insert({
      team_id: newTeam.id,
      coach_id: coach.id,
      role: 'head_coach',
      is_primary: true,
    });

  if (staffError) {
    // Clean up the team we just created since the coach can't manage it without staff record
    await supabase.from('golf_teams').delete().eq('id', newTeam.id);
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  return {
    success: true,
    data: newTeam
  };
}

const observedCreateTeam = withAdminObserved(
  'createTeam',
  { demoSafe: true, sport: 'golf', feature: 'team_info' },
  createTeamImpl,
);

export async function createTeam(
  name: string,
  season: string,
  gender: 'mens' | 'womens' = 'mens'
): Promise<TeamActionResult<TeamData>> {
  return observedCreateTeam(name, season, gender);
}

/**
 * Update team details
 * Only the team owner (coach linked to team via organization) can update
 */
async function updateTeamImpl(
  teamId: string,
  updates: { name?: string; season?: string }
): Promise<TeamActionResult<TeamData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and verify ownership — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== teamId) {
    return { success: false, error: 'You can only update your own team' };
  }

  // Verify team exists
  const { data: existingTeam, error: fetchError } = await supabase
    .from('golf_teams')
    .select('id')
    .eq('id', teamId)
    .single();

  if (fetchError || !existingTeam) {
    return { success: false, error: 'Team not found' };
  }

  // Build update object
  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  };
  if (updates.name !== undefined) {
    // Defense-in-depth (P359): reject empty/whitespace-only names so a cleared
    // field can never persist a blank team name (which renders verbatim app-wide).
    const trimmedName = updates.name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Team name is required' };
    }
    updateData.name = trimmedName;
  }
  if (updates.season !== undefined) updateData.season = updates.season;

  // Update team
  const { data: updatedTeam, error: updateError } = await fromUntyped(supabase, 'golf_teams')
    .update(updateData)
    .eq('id', teamId)
    .select('id, name, season, join_code, created_at')
    .single();

  if (updateError) {
    return { success: false, error: 'Failed to update team. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  return {
    success: true,
    data: updatedTeam
  };
}

const observedUpdateTeam = withAdminObserved(
  'updateTeam',
  { demoSafe: true, sport: 'golf', feature: 'team_info' },
  updateTeamImpl,
);

export async function updateTeam(
  teamId: string,
  updates: { name?: string; season?: string }
): Promise<TeamActionResult<TeamData>> {
  return observedUpdateTeam(teamId, updates);
}

/**
 * Regenerate team join code
 * Invalidates the old code immediately
 */
async function regenerateJoinCodeImpl(
  teamId: string
): Promise<TeamActionResult<{ joinCode: string }>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and verify ownership — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== teamId) {
    return { success: false, error: 'You can only regenerate join codes for your own team' };
  }

  const newJoinCode = generateJoinCode();

  // Update join code
  const { error: updateError } = await supabase
    .from('golf_teams')
    .update({
      join_code: newJoinCode,
      updated_at: new Date().toISOString()
    })
    .eq('id', teamId);

  if (updateError) {
    return { success: false, error: 'Failed to regenerate join code. Please try again.' };
  }

  // Revalidate relevant paths
  revalidatePath('/golf/dashboard/team');

  return {
    success: true,
    data: { joinCode: newJoinCode }
  };
}

const observedRegenerateJoinCode = withAdminObserved(
  'regenerateJoinCode',
  { demoSafe: true, sport: 'golf', feature: 'team_info' },
  regenerateJoinCodeImpl,
);

export async function regenerateJoinCode(
  teamId: string
): Promise<TeamActionResult<{ joinCode: string }>> {
  return observedRegenerateJoinCode(teamId);
}

// ============================================================================
// TEAM JOIN REQUEST OPERATIONS (Request-based flow)
// ============================================================================

export interface JoinRequestData {
  id: string;
  team_id: string;
  player_id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string | null;
  created_at: string;
  player?: {
    id: string;
    first_name: string;
    last_name: string;
    graduation_year: number | null;
    handicap: number | null;
    hometown: string | null;
    state: string | null;
  };
}

/**
 * Create a join request for a team
 * Player requests to join → Coach reviews → Accept/Reject
 */
async function createTeamJoinRequestImpl(
  joinCode: string,
  playerId: string,
  message?: string
): Promise<TeamActionResult<JoinRequestData>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in to request to join a team' };
  }

  // Get player and verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id, first_name, last_name, onboarding_completed')
    .eq('id', playerId)
    .single();

  if (playerError || !player) {
    return { success: false, error: 'Player not found' };
  }

  if (player.user_id !== user.id) {
    return { success: false, error: 'You can only request to join teams with your own player profile' };
  }

  if (!player.onboarding_completed) {
    return { success: false, error: 'Please complete your player profile before requesting to join a team' };
  }

  // Find team by join code (case-insensitive), through the SECURITY DEFINER
  // RPC — NOT a direct read.
  //
  // A direct `.eq('join_code', …)` on golf_teams is unsatisfiable by
  // construction for the only population this feature serves. The sole
  // non-admin SELECT policy is
  // `golf_teams_select USING (is_golf_team_coach(id) OR is_golf_team_player(id))`,
  // and a prospective joiner is neither — RLS filters on which rows you already
  // belong to, not on the literal you searched for. So the read returned zero
  // rows, `.single()` raised PGRST116, and the player was told their correct
  // code was invalid. There was no code they could type that worked, and the
  // coach saw no request. Live since 2026-08-03, when migration
  // 20260803120200 dropped the permissive `golf_teams_select_by_join_code`
  // policy and moved resolution into this RPC; every sibling call site was
  // migrated (join/[code]/page.tsx, processGolfTeamInvitation) and this one
  // was missed. Verified by impersonation: as a prospective joiner the direct
  // read returns 0 rows and the RPC returns 1; as an existing member the same
  // direct read returns 1.
  const normalizedCode = joinCode.toUpperCase();
  const { data: teamRows, error: teamError } = await supabase
    .rpc('golf_team_by_join_code', { p_code: normalizedCode });

  if (teamError) {
    // A failed lookup is NOT a bad code. Telling the player to check their
    // typing when the query itself broke sends them into a loop that cannot
    // terminate, and leaves nothing in the incident queue.
    await logServerError(
      `[createTeamJoinRequest] golf_team_by_join_code failed: ${describeError(teamError)}`,
      { action: 'teams.createTeamJoinRequest' },
    );
    return { success: false, error: 'Could not verify that code right now. Please try again.' };
  }

  const team = Array.isArray(teamRows) ? teamRows[0] : teamRows;

  if (!team) {
    return { success: false, error: 'Invalid team code. Please check and try again.' };
  }

  // Check if already on any team.
  //
  // NOT `.maybeSingle()`: there is no unique constraint on player_id alone, so
  // it raises PGRST116 as soon as a player has two rows — and discarding the
  // error would silently disable this guard. Same defect that was fixed in
  // validateGolfPlayerCanJoinTeam.
  const { data: memberships, error: membershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', playerId);

  if (membershipError) {
    return { success: false, error: 'Could not verify your current team. Please try again.' };
  }

  const existingMembership = memberships?.find((m) => m.team_id === team.id) ?? memberships?.[0] ?? null;

  if (existingMembership) {
    if (existingMembership.team_id === team.id) {
      return { success: false, error: 'You are already a member of this team' };
    }
    return { success: false, error: 'You are already on a team. Leave your current team before requesting to join another.' };
  }

  // Check for existing pending request to this team.
  //
  // This is the only thing standing between a player and a second pending row
  // for the same team — there is no unique constraint behind it. A failed read
  // read as "no request yet", so a player tapping Request again on a slow
  // connection stacked duplicates in the coach's queue, and the coach has to
  // approve or reject each one.
  const { data: existingRequest, error: existingRequestError } = await fromUntyped(
    supabase,
    'golf_team_join_requests'
  )
    .select('id, status')
    .eq('player_id', playerId)
    .eq('team_id', team.id)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingRequestError) {
    await logServerError(
      `pending join-request check failed: ${describeError(existingRequestError)}`,
      { action: 'teams.createTeamJoinRequest', featureArea: 'teams' },
      'warning'
    );
    return {
      success: false,
      error: "Couldn't check your existing requests just now. Please try again.",
    };
  }

  if (existingRequest) {
    return { success: false, error: 'You already have a pending request to join this team' };
  }

  // Create the join request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .insert({
      team_id: team.id,
      player_id: playerId,
      status: 'pending',
      message: message?.trim() || null,
    })
    .select('id, team_id, player_id, status, message, created_at')
    .single();

  if (requestError) {
    maybeCaptureRlsDenial(requestError, {
      table: 'golf_team_join_requests',
      verb: 'insert',
      action: 'createTeamJoinRequest',
      feature: 'join_team_flow',
      sport: 'golf',
    });
    return { success: false, error: 'Failed to submit request. Please try again.' };
  }

  // Notify coaches about the join request
  if (team.organization_id) {
    try {
      const { data: coaches } = await supabase
        .from('golf_coaches')
        .select('id, user_id')
        .eq('organization_id', team.organization_id);

      if (coaches && coaches.length > 0) {
        const playerName = `${player.first_name} ${player.last_name}`.trim();

        const notifications = coaches.map((coach) => ({
          user_id: coach.user_id,
          type: 'team_join_request' as const,
          title: 'New Join Request',
          body: `${playerName} has requested to join ${team.name}`,
          action_url: '/golf/dashboard/roster?tab=requests',
          data: {
            request_id: request.id,
            player_id: playerId,
            player_name: playerName,
            team_id: team.id,
            team_name: team.name,
          },
          read: false,
        }));

        // ADMIN client, and the error is READ.
        //
        // `notifications_insert_own` is WITH CHECK (user_id = auth.uid()), so
        // writing a row addressed to the COACH with the PLAYER's own client is
        // refused every single time — and this call discarded the result, so
        // the refusal was invisible. The player filed a request and was told it
        // was sent; the coach was never told anything. Notifying another user is
        // by definition a cross-user write and belongs on the service client.
        const { error: notifyError } = await fromUntyped(createAdminClient(), 'notifications')
          .insert(notifications);

        if (notifyError) {
          // A request nobody is told about is functionally a request that was
          // never made — worth an incident, not silence.
          await logServerError(
            `[createTeamJoinRequest] coach notification insert failed: ${describeError(notifyError)}`,
            { action: 'teams.createTeamJoinRequest', featureArea: 'teams' },
          );
        }
      }
    } catch (error) {
      // Don't fail the request if notification fails
      await logServerError(
        `Unexpected error: ${describeError(error)}`,
        { action: 'teams.createTeamJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');
  revalidatePath('/golf/dashboard/settings');

  return {
    success: true,
    data: request,
  };
}

const observedCreateTeamJoinRequest = withAdminObserved(
  'createTeamJoinRequest',
  { sport: 'golf', feature: 'join_team_flow' },
  createTeamJoinRequestImpl,
);

export async function createTeamJoinRequest(
  joinCode: string,
  playerId: string,
  message?: string
): Promise<TeamActionResult<JoinRequestData>> {
  return observedCreateTeamJoinRequest(joinCode, playerId, message);
}

/**
 * Get pending join requests for the coach's team
 */
async function getTeamJoinRequestsImpl(): Promise<TeamActionResult<JoinRequestData[]>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach and their team — maybeSingle() to avoid PGRST116
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
    return { success: false, error: 'No team found' };
  }

  // Get pending requests with player details
  const { data: requests, error: requestsError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      message,
      created_at,
      player:golf_players (
        id,
        first_name,
        last_name,
        graduation_year,
        handicap,
        hometown,
        state
      )
    `)
    .eq('team_id', teamId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (requestsError) {
    return { success: false, error: 'Failed to fetch requests' };
  }

  return {
    success: true,
    data: requests as unknown as JoinRequestData[],
  };
}

const observedGetTeamJoinRequests = withAdminObserved(
  'getTeamJoinRequests',
  { sport: 'golf', feature: 'join_team_flow' },
  getTeamJoinRequestsImpl,
);

export async function getTeamJoinRequests(): Promise<TeamActionResult<JoinRequestData[]>> {
  return observedGetTeamJoinRequests();
}

/**
 * Accept a join request - adds player to the team
 */
async function acceptJoinRequestImpl(
  requestId: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Get the request with player and team details
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      player:golf_players (
        id,
        first_name,
        last_name,
        user_id
      ),
      team:golf_teams (
        id,
        name,
        organization_id
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify coach owns this team
  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== request.team_id) {
    return { success: false, error: 'You can only accept requests for your own team' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Check if player is already on a team (race condition protection).
  //
  // This guard FAILED OPEN. Its error was discarded, so a read that failed
  // produced null — indistinguishable from "not on any team" — and the
  // approval sailed past the one-team rule into the insert below.
  //
  // Two ways that bites. .maybeSingle() reports MULTIPLE rows as an error, so
  // the very state this guard exists to catch is one of the errors being
  // thrown away. And a guard that cannot run must not be treated as a guard
  // that passed: the safe answer is to decline the approval and let the coach
  // retry, not to approve on the strength of a read that did not happen.
  const { data: existingMembership, error: existingMembershipError } = await supabase
    .from('golf_team_members')
    .select('team_id')
    .eq('player_id', request.player_id)
    .maybeSingle();

  if (existingMembershipError) {
    await logServerError(
      `[approveJoinRequest] one-team check failed — declining rather than approving on an unverified guard: ${describeError(existingMembershipError)}`,
      { action: 'teams.approveJoinRequest', featureArea: 'roster', playerId: request.player_id },
    );
    return { success: false, error: "Couldn't confirm this player isn't already on a team. Nothing was changed — please try again." };
  }

  if (existingMembership) {
    // Update request to rejected since they're already on a team
    await fromUntyped(supabase, 'golf_team_join_requests')
      .update({
        status: 'rejected',
        rejection_reason: 'Player is already on another team',
        reviewed_by: coach.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return { success: false, error: 'Player has already joined another team' };
  }

  // Add player to team
  const { error: memberError } = await supabase
    .from('golf_team_members')
    .insert({
      player_id: request.player_id,
      team_id: request.team_id,
      status: 'active',
    });

  if (memberError) {
    return { success: false, error: 'Failed to add player to team' };
  }

  // Update request status
  const { error: updateError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .update({
      status: 'approved',
      reviewed_by: coach.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: 'Failed to update request status' };
  }

  // Notify player of approval
  const player = request.player as unknown as { id: string; first_name: string; last_name: string; user_id: string } | null;
  const team = request.team as unknown as { id: string; name: string; organization_id: string } | null;

  if (player?.user_id && team) {
    try {
      // ADMIN client — this row is addressed to the PLAYER, written by the
      // COACH, and notifications_insert_own only permits user_id = auth.uid().
      // With the caller's client this was refused every time and the refusal
      // was discarded: the coach approved the request and the player was never
      // told.
      const { error: notifyError } = await fromUntyped(createAdminClient(), 'notifications').insert({
        user_id: player.user_id,
        type: 'team_join_approved',
        title: 'Request Approved!',
        body: `Your request to join ${team.name} has been approved. Welcome to the team!`,
        action_url: '/golf/dashboard',
        data: {
          team_id: team.id,
          team_name: team.name,
        },
        read: false,
      });

      if (notifyError) {
        await logServerError(
          `[acceptJoinRequest] player notification insert failed: ${describeError(notifyError)}`,
          { action: 'teams.acceptJoinRequest', featureArea: 'teams' },
        );
      }
    } catch (error) {
      // Don't fail the approval if notification fails
      await logServerError(
        `Unexpected error: ${describeError(error)}`,
        { action: 'teams.acceptJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/roster');

  return { success: true };
}

const observedAcceptJoinRequest = withAdminObserved(
  'acceptJoinRequest',
  { demoSafe: true, sport: 'golf', feature: 'join_team_flow' },
  acceptJoinRequestImpl,
);

export async function acceptJoinRequest(
  requestId: string
): Promise<TeamActionResult> {
  return observedAcceptJoinRequest(requestId);
}

/**
 * Reject a join request
 */
async function rejectJoinRequestImpl(
  requestId: string,
  reason?: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get coach — maybeSingle() to avoid PGRST116
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  // Get the request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select(`
      id,
      team_id,
      player_id,
      status,
      player:golf_players (
        id,
        first_name,
        last_name,
        user_id
      ),
      team:golf_teams (
        id,
        name
      )
    `)
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify coach owns this team
  const coachTeamId = await getCoachTeamId(supabase, coach.organization_id, coach.id);
  if (coachTeamId !== request.team_id) {
    return { success: false, error: 'You can only reject requests for your own team' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Update request status
  const { error: updateError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason?.trim() || null,
      reviewed_by: coach.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    return { success: false, error: 'Failed to reject request' };
  }

  // Notify player of rejection
  const player = request.player as unknown as { id: string; first_name: string; last_name: string; user_id: string } | null;
  const team = request.team as unknown as { id: string; name: string } | null;

  if (player?.user_id && team) {
    try {
      // ADMIN client — see the note in acceptJoinRequest. Same cross-user
      // write, same silent RLS refusal, same outcome: the player waited on an
      // answer that had already been given.
      const { error: notifyError } = await fromUntyped(createAdminClient(), 'notifications').insert({
        user_id: player.user_id,
        type: 'team_join_rejected',
        title: 'Request Not Approved',
        body: reason
          ? `Your request to join ${team.name} was not approved: ${reason}`
          : `Your request to join ${team.name} was not approved at this time.`,
        action_url: '/golf/dashboard/settings',
        data: {
          team_id: team.id,
          team_name: team.name,
          reason: reason || null,
        },
        read: false,
      });

      if (notifyError) {
        await logServerError(
          `[rejectJoinRequest] player notification insert failed: ${describeError(notifyError)}`,
          { action: 'teams.rejectJoinRequest', featureArea: 'teams' },
        );
      }
    } catch (error) {
      // Don't fail the rejection if notification fails
      await logServerError(
        `Unexpected error: ${describeError(error)}`,
        { action: 'teams.rejectJoinRequest', featureArea: 'teams' },
        'warning'
      );
    }
  }

  revalidatePath('/golf/dashboard/roster');

  return { success: true };
}

const observedRejectJoinRequest = withAdminObserved(
  'rejectJoinRequest',
  { demoSafe: true, sport: 'golf', feature: 'join_team_flow' },
  rejectJoinRequestImpl,
);

export async function rejectJoinRequest(
  requestId: string,
  reason?: string
): Promise<TeamActionResult> {
  return observedRejectJoinRequest(requestId, reason);
}

/**
 * Cancel a pending join request (by the player)
 */
async function cancelJoinRequestImpl(
  requestId: string
): Promise<TeamActionResult> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get the request
  const { data: request, error: requestError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .select('id, player_id, status, player:golf_players(user_id)')
    .eq('id', requestId)
    .single();

  if (requestError || !request) {
    return { success: false, error: 'Request not found' };
  }

  // Verify user owns this request
  const player = request.player as unknown as { user_id: string } | null;
  if (player?.user_id !== user.id) {
    return { success: false, error: 'You can only cancel your own requests' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'This request has already been processed' };
  }

  // Delete the request
  const { error: deleteError } = await fromUntyped(supabase, 'golf_team_join_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    return { success: false, error: 'Failed to cancel request' };
  }

  revalidatePath('/golf/dashboard/settings');

  return { success: true };
}

const observedCancelJoinRequest = withAdminObserved(
  'cancelJoinRequest',
  { sport: 'golf', feature: 'join_team_flow' },
  cancelJoinRequestImpl,
);

export async function cancelJoinRequest(
  requestId: string
): Promise<TeamActionResult> {
  return observedCancelJoinRequest(requestId);
}

/**
 * Get player's pending join requests
 */
async function getPlayerJoinRequestsImpl(
  playerId: string
): Promise<TeamActionResult<Array<{
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  // NULLABLE. This was declared non-null while the value was, in production,
  // always null — the embed that produced it could not be read under RLS by a
  // pending requester, and an `as unknown as` cast asserted otherwise. Callers
  // must handle the absence.
  team: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}>>> {
  const supabase = await createClient();

  // Verify user is authenticated
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify ownership
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, user_id')
    .eq('id', playerId)
    .single();

  if (playerError || !player || player.user_id !== user.id) {
    return { success: false, error: 'Player not found' };
  }

  // Get the pending requests. The team is resolved SEPARATELY, not embedded.
  //
  // This used to embed `team:golf_teams(id, name, organization:organizations(name))`,
  // which is RLS-blind in exactly the way the join-code read above was: a
  // player with a PENDING request is by definition not yet a member, so
  // golf_teams_select cannot see the row and the embed resolves to `team: null`.
  // The `as unknown as` cast below then asserted `team` was non-null, hiding
  // that from every later reader, and JoinTeamSection renders `request.team.name`
  // — so the moment a request could actually be filed, the whole Settings page
  // would have died with "Cannot read properties of null".
  // `golf_my_join_requests` resolves the team and organization names inside a
  // SECURITY DEFINER function, scoped internally to golf_players.user_id =
  // auth.uid(), so it answers for the caller and nobody else.
  const { data: requests, error: requestsError } = await supabase.rpc('golf_my_join_requests');

  if (requestsError) {
    return { success: false, error: 'Failed to fetch requests' };
  }

  const rows = (requests ?? []) as Array<{
    id: string;
    status: string;
    message: string | null;
    created_at: string;
    team_id: string;
    team_name: string | null;
    organization_name: string | null;
  }>;

  return {
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      status: r.status,
      message: r.message,
      created_at: r.created_at,
      // Typed NULLABLE, deliberately. The previous shape asserted a non-null
      // team through an `as unknown as` cast while the value was in fact always
      // null here — the cast is what made the crash invisible.
      team: r.team_name
        ? {
            id: r.team_id,
            name: r.team_name,
            organization: r.organization_name ? { name: r.organization_name } : null,
          }
        : null,
    })),
  };
}

const observedGetPlayerJoinRequests = withAdminObserved(
  'getPlayerJoinRequests',
  { sport: 'golf', feature: 'join_team_flow' },
  getPlayerJoinRequestsImpl,
);

export async function getPlayerJoinRequests(
  playerId: string
): Promise<TeamActionResult<Array<{
  id: string;
  status: string;
  message: string | null;
  created_at: string;
  // NULLABLE — see the note on getPlayerJoinRequestsImpl.
  team: {
    id: string;
    name: string;
    organization?: { name: string } | null;
  } | null;
}>>> {
  return observedGetPlayerJoinRequests(playerId);
}

// ============================================================================
// PROGRAM HEAD: ADD SECOND TEAM
// ============================================================================

/**
 * Add a second (or additional) team to a head coach's existing organization.
 *
 * Only a coach who already has a primary team (is_primary=true staff row) may
 * call this. The new team is created under the SAME organization. The creating
 * coach is added to the new team's staff as head_coach with is_primary=false —
 * their original primary team is unchanged. A fresh join code is generated for
 * the new team, exactly as in onboarding.
 *
 * Uses the admin client for the staff insert (same bootstrap pattern as
 * onboarding) so the RLS "primary coach on the team" pre-condition is satisfied
 * for the new row without a chicken-and-egg problem.
 */
async function addSecondTeamImpl(
  name: string,
  gender: 'mens' | 'womens'
): Promise<TeamActionResult<TeamData & { gender: string }>> {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // Verify coach exists
  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach) {
    return { success: false, error: 'Coach profile not found' };
  }

  if (!coach.organization_id) {
    return { success: false, error: 'No organization found. Complete onboarding first.' };
  }

  // Require the coach to already have a primary team — this action is for
  // program heads adding a SECOND team, not for the initial team creation.
  const { data: primaryStaffRow, error: primaryStaffError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coach.id)
    .eq('is_primary', true)
    .maybeSingle();

  // "You must have a primary team before adding a second team" is a statement
  // about this coach's setup. A failed read produces the identical null, so a
  // program head with a primary team is told they do not have one.
  if (primaryStaffError) {
    await logServerError(
      `addSecondTeam: primary-team check failed for coach ${coach.id}: ${describeError(primaryStaffError)}`,
      { action: 'teams.addSecondTeam', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: "Couldn't verify your current team. Please try again." };
  }

  if (!primaryStaffRow) {
    return { success: false, error: 'You must have a primary team before adding a second team.' };
  }

  // ...and be a program head, which until now was only asserted in the comment
  // above. Holding ANY primary staff row was the whole gate, so an assistant
  // coach could call this, get a new team created in their org, and be written
  // into its staff as `role: 'head_coach'` by the insert further down — a
  // self-service promotion on a team of their own making.
  //
  // 'head_coach' on at least one staffed row is the same predicate the team
  // switcher already uses for program-head capability (see
  // getCoachTeamSwitchContext), so this adds no new notion of seniority; it
  // applies the existing one to the action that hands out the role.
  const { data: headCoachRow, error: headCoachError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('coach_id', coach.id)
    .eq('role', 'head_coach')
    .limit(1)
    .maybeSingle();

  // Same fail-closed-but-honest split as the primary-team read above: a failed
  // read must not be reported to a real head coach as "you are not one".
  if (headCoachError) {
    await logServerError(
      `addSecondTeam: head-coach check failed for coach ${coach.id}: ${describeError(headCoachError)}`,
      { action: 'teams.addSecondTeam', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: "Couldn't verify your role. Please try again." };
  }

  if (!headCoachRow) {
    return { success: false, error: 'Only a head coach can add another team.' };
  }

  // Prevent exact-duplicate gender: a coach should not have two teams with the
  // same gender. Fetch all teams in the org this coach staffs, check genders.
  const { data: existingStaffTeams, error: existingStaffError } = await supabase
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coach.id);

  // THIS GUARD FAILED OPEN, and it is the only thing enforcing one men's and
  // one women's team per program. Both reads feed `genderConflict`, and both
  // degrade to `[]` — which reads as "no existing teams", so the conflict is
  // never detected and the coach creates a SECOND team of the same gender.
  //
  // Two men's teams in one program is not a cosmetic problem: every downstream
  // resolver picks a team by org and gender, and the roster, calendar and
  // stats then split across two rows that should be one, with no way to merge
  // them back from the UI.
  //
  // Refusing on a failed read is the right side to fail to — the coach can try
  // again in a moment; an accidental duplicate team cannot be undone.
  if (existingStaffError) {
    await logServerError(
      `addSecondTeam: staffed-teams read failed for coach ${coach.id}; refusing rather than risking a duplicate-gender team: ${describeError(existingStaffError)}`,
      { action: 'teams.addSecondTeam', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: "Couldn't check your existing teams. Please try again." };
  }

  if (existingStaffTeams && existingStaffTeams.length > 0) {
    const staffTeamIds = existingStaffTeams.map((s) => s.team_id);
    const { data: existingTeams, error: existingTeamsError } = await supabase
      .from('golf_teams')
      .select('gender')
      .in('id', staffTeamIds)
      .eq('organization_id', coach.organization_id);

    if (existingTeamsError) {
      await logServerError(
        `addSecondTeam: existing-team gender read failed for coach ${coach.id}; refusing rather than risking a duplicate-gender team: ${describeError(existingTeamsError)}`,
        { action: 'teams.addSecondTeam', featureArea: 'teams' },
        'warning',
      );
      return { success: false, error: "Couldn't check your existing teams. Please try again." };
    }

    const genderConflict = (existingTeams ?? []).some((t) => t.gender === gender);
    if (genderConflict) {
      const label = gender === 'mens' ? "Men's" : "Women's";
      return {
        success: false,
        error: `You already have a ${label} team in this program. Each program can have one Men's and one Women's team.`,
      };
    }
  }

  const joinCode = generateJoinCode();
  const season = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
  })();

  // INSERT without RETURNING, then read back with the admin client.
  //
  // `.insert().select()` asks Postgres for a RETURNING clause, and RETURNING is
  // filtered by the SELECT policy. `golf_teams_select` is
  // `USING (is_golf_team_coach(id) OR is_golf_team_player(id))`, and
  // `is_golf_team_coach` requires a golf_team_coach_staff row — which for a
  // brand-new team does not exist yet; it is created a few lines below. So the
  // creator could never read back the team they had just made, and the whole
  // statement failed 42501 "new row violates row-level security policy".
  //
  // Observed on production 2026-08-05: Shenandoah's head coach could not add
  // their Women's team at all, so the program had one team and the top-bar
  // team toggle (which needs two) never appeared.
  //
  // The INSERT itself still goes through the caller's client, so the RLS write
  // check still authorizes it. Only the read-back is elevated, scoped to the
  // join code generated above (unique), and the org is asserted below before
  // anything privileged happens.
  const { error: teamError } = await supabase
    .from('golf_teams')
    .insert({
      name: name.trim(),
      gender,
      season,
      join_code: joinCode,
      organization_id: coach.organization_id,
      created_by: coach.id,
    });

  const newTeam = teamError
    ? null
    : (
        await createAdminClient()
          .from('golf_teams')
          .select('id, name, season, join_code, created_at, organization_id')
          .eq('join_code', joinCode)
          .maybeSingle()
      ).data ?? null;

  if (teamError || !newTeam) {
    // 23505 = the golf_teams_org_gender_uidx partial-unique guard. This catches
    // the read-then-write race the app pre-check above cannot (two concurrent
    // addSecondTeam calls), so the DB is the real one-team-per-gender authority.
    if (teamError?.code === '23505') {
      const label = gender === 'mens' ? "Men's" : "Women's";
      return {
        success: false,
        error: `You already have a ${label} team in this program. Each program can have one Men's and one Women's team.`,
      };
    }
    await logServerError(
      `[addSecondTeam] Team creation failed: ${describeError(teamError)}`,
      { action: 'teams.addSecondTeam' }
    );
    return { success: false, error: 'Failed to create team. Please try again.' };
  }

  // Defense-in-depth: the privileged staff insert below uses the admin client,
  // so assert the team we are about to grant head-coach on really belongs to the
  // caller's own organization before crossing the RLS-bypass boundary.
  if (newTeam.organization_id !== coach.organization_id) {
    await supabase.from('golf_teams').delete().eq('id', newTeam.id);
    await logServerError(
      `[addSecondTeam] org mismatch: team ${newTeam.organization_id} vs coach ${coach.organization_id}`,
      { action: 'teams.addSecondTeam' }
    );
    return { success: false, error: 'Failed to add team. Please try again.' };
  }

  // Use admin client for the staff insert — mirrors onboarding bootstrap pattern.
  // is_primary = false because this is NOT the coach's primary team; the head
  // coach still manages it via is_golf_team_head_coach (role-based) RLS.
  const admin = createAdminClient();
  const { error: staffError } = await admin
    .from('golf_team_coach_staff')
    .insert({
      team_id: newTeam.id,
      coach_id: coach.id,
      role: 'head_coach',
      is_primary: false,
    });

  if (staffError) {
    await logServerError(
      `[addSecondTeam] Staff insert failed: ${describeError(staffError)}`,
      { action: 'teams.addSecondTeam' }
    );
    // Rollback the team we just created
    await supabase.from('golf_teams').delete().eq('id', newTeam.id);
    return { success: false, error: 'Failed to add team. Please try again.' };
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  return {
    success: true,
    data: { ...newTeam, gender },
  };
}

const observedAddSecondTeam = withAdminObserved(
  'addSecondTeam',
  { sport: 'golf', feature: 'join_team_flow' },
  addSecondTeamImpl,
);

export async function addSecondTeam(
  name: string,
  gender: 'mens' | 'womens'
): Promise<TeamActionResult<TeamData & { gender: string }>> {
  return observedAddSecondTeam(name, gender);
}

// ============================================================================
// STAFF INVITATIONS — coach-issued, never code-redeemed
// ============================================================================
//
// A team's JOIN CODE is handed to every player, so it can never be what grants
// staff access. These two actions split the decision from the redemption: a
// head coach decides the role and mints a signed token; the recipient can only
// redeem what they were sent. Changing "coach" to "admin" breaks the signature.

export interface CreateStaffInviteResult {
  /** Short typed alias for the invite. Null when the alias could not be stored. */
  code?: string | null;
  success: boolean;
  error?: string;
  token?: string;
  role?: StaffInviteRole;
  expiresAt?: string;
}

async function createStaffInviteImpl(
  teamId: string,
  role: StaffInviteRole,
): Promise<CreateStaffInviteResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { success: false, error: 'Not authenticated' };
  if (role !== 'coach' && role !== 'admin') return { success: false, error: 'Unknown role' };

  // THIS IS THE ESCALATION GATE, so all three of its reads deny on failure —
  // which is right, and unchanged. What was wrong is that each denial was
  // phrased as a finding: "Coach profile not found" to a coach who has one,
  // "Only a head coach of this team can invite staff" to the head coach, and
  // "That team is not part of your program" about their own team. A head coach
  // who cannot invite their assistant and is told they are not a head coach has
  // no reason to try again.
  const STAFF_INVITE_UNREADABLE =
    "Couldn't verify your access to invite staff. Please try again.";

  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError) {
    await logServerError(
      `createStaffInvite: coach read failed: ${describeError(coachError)}`,
      { action: 'teams.createStaffInvite', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: STAFF_INVITE_UNREADABLE };
  }

  if (!coach?.organization_id) return { success: false, error: 'Coach profile not found' };

  // THE GATE. Only a HEAD COACH of this specific team may invite staff, and
  // therefore only a head coach can choose whether the invitee becomes another
  // head coach (program administrator). An assistant cannot escalate anyone —
  // including themselves, since they cannot mint a token at all.
  const { data: staffRow, error: staffRowError } = await supabase
    .from('golf_team_coach_staff')
    .select('id, role')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .eq('role', 'head_coach')
    .maybeSingle();

  if (staffRowError) {
    await logServerError(
      `createStaffInvite: head-coach check failed for team ${teamId}: ${describeError(staffRowError)}`,
      { action: 'teams.createStaffInvite', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: STAFF_INVITE_UNREADABLE };
  }

  if (!staffRow) {
    return { success: false, error: 'Only a head coach of this team can invite staff.' };
  }

  // The team must belong to the caller's own organization — an admin invite
  // grants head_coach across the whole org, so this is what stops a head coach
  // of program A minting one for program B.
  const { data: team, error: teamError } = await supabase
    .from('golf_teams')
    .select('id, organization_id')
    .eq('id', teamId)
    .maybeSingle();

  if (teamError) {
    await logServerError(
      `createStaffInvite: team read failed for ${teamId}: ${describeError(teamError)}`,
      { action: 'teams.createStaffInvite', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: STAFF_INVITE_UNREADABLE };
  }

  if (!team || team.organization_id !== coach.organization_id) {
    return { success: false, error: 'That team is not part of your program.' };
  }

  const token = signStaffInvite(team.id, team.organization_id, role);
  if (!token) {
    await logServerError('[createStaffInvite] signing key unavailable', {
      action: 'teams.createStaffInvite',
    });
    return { success: false, error: 'Staff invites are unavailable right now.' };
  }

  const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS).toISOString();

  // Short typed alias for the link, so an assistant can join the way a player
  // does: click Sign Up, type a code. The code is a LOOKUP KEY ONLY — the role
  // is still read from the signed token at redemption, so a tampered row here
  // cannot forge a grant. Stored in a table players cannot read; the roster
  // join_code namespace is deliberately separate (see the migration).
  const admin = createAdminClient();
  let code: string | null = null;
  for (let attempt = 0; attempt < 5 && !code; attempt++) {
    const candidate = generateJoinCode();
    const { error: codeError } = await admin.from('golf_staff_invite_codes').insert({
      code: candidate,
      token,
      team_id: team.id,
      organization_id: team.organization_id,
      role,
      expires_at: expiresAt,
      created_by_coach_id: coach.id,
    });
    if (!codeError) {
      code = candidate;
    } else if (codeError.code !== '23505') {
      // Not a collision — the link still works, so degrade to link-only rather
      // than failing a mint the coach can still use.
      await logServerError(
        `[createStaffInvite] short code insert failed; returning link-only invite: ${describeError(codeError)}`,
        { action: 'teams.createStaffInvite', featureArea: 'teams' },
        'warning',
      );
      break;
    }
  }

  return {
    success: true,
    token,
    code,
    role,
    expiresAt,
  };
}

const observedCreateStaffInvite = withAdminObserved(
  'createStaffInvite',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  createStaffInviteImpl,
);

export async function createStaffInvite(
  teamId: string,
  role: StaffInviteRole,
): Promise<CreateStaffInviteResult> {
  return observedCreateStaffInvite(teamId, role);
}

export interface RedeemStaffInviteResult {
  success: boolean;
  error?: string;
  teams?: { id: string; name: string; gender: string | null }[];
  multiTeam?: boolean;
}

async function redeemStaffInviteImpl(
  token: string,
  fullName?: string,
): Promise<RedeemStaffInviteResult> {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { success: false, error: 'Not authenticated' };

  // The role is read out of the SIGNED payload. It is never taken from the
  // caller, so there is nothing for a recipient to tamper with.
  const verified = verifyStaffInvite(token);
  if (!verified.ok) {
    const message =
      verified.reason === 'expired'
        ? 'That invitation has expired. Ask your head coach for a new one.'
        : verified.reason === 'unconfigured'
          ? 'Staff invites are unavailable right now.'
          : 'That invitation link is not valid.';
    return { success: false, error: message };
  }
  const { t: teamId, o: organizationId, r: role, n: nonce } = verified.payload;

  const admin = createAdminClient();

  // SINGLE USE. Claim the nonce BEFORE writing any staff row: the primary key
  // on golf_staff_invite_redemptions is the mutual exclusion, so two concurrent
  // redemptions of the same link cannot both win, and a replay after the fact
  // loses here rather than minting a second grant.
  //
  // This matters most for role='admin', which writes staff rows across the
  // whole organization, so each redemption widens access. A forwarded admin
  // link was previously repeatable for its whole 72h life.
  const { error: claimError } = await admin
    .from('golf_staff_invite_redemptions')
    .insert({
      nonce,
      team_id: teamId,
      organization_id: organizationId,
      role,
      redeemed_by: user.id,
    });

  if (claimError) {
    // 23505 = unique_violation: the invite was already spent. Anything else is
    // an infrastructure failure, and we refuse rather than fail open — granting
    // staff access when the replay guard is unavailable is the exact trade this
    // table exists to prevent.
    if (claimError.code === '23505') {
      return {
        success: false,
        error: 'That invitation has already been used. Ask your head coach for a new one.',
      };
    }
    await logServerError(
      `[redeemStaffInvite] could not claim invite nonce; refusing rather than granting staff without a replay guard: ${describeError(claimError)}`,
      { action: 'teams.redeemStaffInvite', featureArea: 'teams' },
    );
    return { success: false, error: 'Could not verify that invitation. Please try again.' };
  }

  // The `error` is READ. Discarded, a failed read looked like "this user has no
  // coach row", so the insert below minted a SECOND coach profile for someone
  // who already had one — a duplicate identity row, not a wrong message.
  const { data: existingCoach, error: existingCoachError } = await admin
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (existingCoachError) {
    await logServerError(
      `[acceptStaffInvite] coach lookup failed for user ${user.id}; refusing rather than risk a duplicate coach profile: ${describeError(existingCoachError)}`,
      { action: 'teams.acceptStaffInvite', featureArea: 'teams' },
    );
    return { success: false, error: 'Could not verify your account. Please try again.' };
  }

  let coachId = existingCoach?.id ?? null;

  if (!coachId) {
    const { data: created, error: coachError } = await admin
      .from('golf_coaches')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        full_name: fullName?.trim() || user.email || 'Coach',
        onboarding_completed: true,
      })
      .select('id')
      .single();
    if (coachError || !created) {
      await logServerError(
        `[redeemStaffInvite] coach create failed: ${describeError(coachError)}`,
        { action: 'teams.redeemStaffInvite' },
      );
      return { success: false, error: 'Could not set up your coach profile. Please try again.' };
    }
    coachId = created.id;
  } else if (existingCoach?.organization_id !== organizationId) {
    // Refuse rather than move them: reassigning their organization would strip
    // access to the program they already staff.
    return {
      success: false,
      error: 'This account already belongs to another program. Use a different email to join this one.',
    };
  }

  const { data: orgTeams } = await admin
    .from('golf_teams')
    .select('id, name, gender')
    .eq('organization_id', organizationId);

  // coach → the invited team only. admin → the whole program, which is what
  // makes the Men's/Women's toggle appear (canSwitch needs head_coach on >1).
  const targetTeams = role === 'admin'
    ? (orgTeams ?? [])
    : (orgTeams ?? []).filter((t) => t.id === teamId);
  if (targetTeams.length === 0) {
    return { success: false, error: 'That program has no teams to join yet.' };
  }

  const { data: alreadyStaffed } = await admin
    .from('golf_team_coach_staff')
    .select('team_id')
    .eq('coach_id', coachId);
  const staffedIds = new Set((alreadyStaffed ?? []).map((r) => r.team_id));

  const rows = targetTeams
    .filter((t) => !staffedIds.has(t.id))
    .map((t) => ({
      team_id: t.id,
      coach_id: coachId as string,
      role: role === 'admin' ? 'head_coach' : 'assistant_coach',
      is_primary: t.id === teamId && staffedIds.size === 0,
    }));

  if (rows.length > 0) {
    const { error: staffError } = await admin.from('golf_team_coach_staff').insert(rows);
    if (staffError) {
      await logServerError(
        `[redeemStaffInvite] staff insert failed: ${describeError(staffError)}`,
        { action: 'teams.redeemStaffInvite' },
      );
      return { success: false, error: 'Could not add you to the team. Please try again.' };
    }
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard/roster');

  const finalTeams = targetTeams.map((t) => ({ id: t.id, name: t.name, gender: t.gender ?? null }));
  return { success: true, teams: finalTeams, multiTeam: role === 'admin' && finalTeams.length > 1 };
}

const observedRedeemStaffInvite = withAdminObserved(
  'redeemStaffInvite',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  redeemStaffInviteImpl,
);

export async function redeemStaffInvite(
  token: string,
  fullName?: string,
): Promise<RedeemStaffInviteResult> {
  return observedRedeemStaffInvite(token, fullName);
}


// ---------------------------------------------------------------------------
// Staff invite — PREVIEW (unauthenticated)
// ---------------------------------------------------------------------------

export interface PreviewStaffInviteResult {
  valid: boolean;
  error?: string;
  /** 'coach' → assistant coach on one team. 'admin' → head coach across the program. */
  role?: StaffInviteRole;
  teamName?: string;
  organizationName?: string;
}

/**
 * Describe an invite WITHOUT redeeming it, for the accept screen.
 *
 * Deliberately callable while signed out: an invited assistant usually has no
 * account yet (GolfHelm self-serve signup is a PLAYER team-code gate), so the
 * accept screen has to render "You've been invited to X as an assistant coach"
 * before there is any session to authenticate.
 *
 * Safe to expose because the token is the capability: it is HMAC-signed and
 * expiry-bounded, so a caller can only preview an invite someone with
 * head_coach already minted for them. It returns names — never ids, rosters,
 * or anything else about the program — and the ROLE still travels in the
 * signed payload, so this cannot be used to shop for a better one.
 */
async function previewStaffInviteImpl(token: string): Promise<PreviewStaffInviteResult> {
  const verified = verifyStaffInvite(token);
  if (!verified.ok) {
    return {
      valid: false,
      error:
        verified.reason === 'expired'
          ? 'That invitation has expired. Ask your head coach for a new one.'
          : verified.reason === 'unconfigured'
            ? 'Staff invites are unavailable right now.'
            : 'That invitation link is not valid.',
    };
  }

  const { t: teamId, o: organizationId, r: role } = verified.payload;
  const admin = createAdminClient();

  const [teamResult, orgResult] = await Promise.all([
    admin.from('golf_teams').select('name').eq('id', teamId).maybeSingle(),
    admin.from('organizations').select('name').eq('id', organizationId).maybeSingle(),
  ]);

  // A read failure must NOT read as "invalid invite" — the token verified, so
  // the invite is genuine and the accept button must still work. Fall back to
  // generic copy rather than turning an outage into "your link is broken".
  if (teamResult.error) {
    await logServerError(
      `[previewStaffInvite] team read failed for ${teamId}: ${describeError(teamResult.error)}`,
      { action: 'teams.previewStaffInvite', featureArea: 'teams' },
      'warning',
    );
  }
  if (orgResult.error) {
    await logServerError(
      `[previewStaffInvite] organization read failed for ${organizationId}: ${describeError(orgResult.error)}`,
      { action: 'teams.previewStaffInvite', featureArea: 'teams' },
      'warning',
    );
  }

  return {
    valid: true,
    role,
    teamName: teamResult.data?.name ?? undefined,
    organizationName: orgResult.data?.name ?? undefined,
  };
}

const observedPreviewStaffInvite = withAdminObserved(
  'previewStaffInvite',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  previewStaffInviteImpl,
);

export async function previewStaffInvite(token: string): Promise<PreviewStaffInviteResult> {
  return observedPreviewStaffInvite(token);
}

/* -------------------------------------------------------------------------- */
/* Assistant coaches — the single-code path                                    */
/* -------------------------------------------------------------------------- */

/**
 * ONE CODE, TWO DESTINATIONS — and no waiting room.
 *
 * A head coach hands out exactly one thing: the team code. Whoever types it at
 * signup picks Player or Assistant coach, and BOTH are attached immediately.
 *
 * WHY THERE IS NO APPROVAL STEP (owner decision, 2026-08-20)
 * ---------------------------------------------------------
 * An earlier version of this recorded a REQUEST and parked the person on a
 * waiting page until a head coach approved it. That was removed on the owner's
 * explicit instruction, stated twice: "they choose and go through the
 * appropriate onboarding, and then boom theyre on the team", and "There
 * shouldn't be an approval. The approval is them having the access code, and
 * putting it in when they hit sign up."
 *
 * The trade-off, written down so it stays a decision and not an accident: the
 * roster code goes to every player, so anyone holding it can now sign up as an
 * assistant coach and read the whole team's rounds and PII. HOLDING THE CODE IS
 * THE AUTHORIZATION. If that ever needs tightening, the fix is a separate
 * assistant-only code — `createStaffInvite` already mints one — and NOT a
 * waiting room, because the waiting room is what made this feel broken.
 *
 * FULL ACCESS MEANS EVERY TEAM IN THE PROGRAM.
 * `golf_team_coach_staff` is per-TEAM and a program can carry several:
 * Shenandoah runs a men's and a women's team and its head coach is staffed on
 * both. An assistant staffed only on the team whose code they happened to be
 * handed would silently see half the program — so a row is written for every
 * team in the organization. That is what the access helpers read:
 *
 *   is_golf_team_coach(t) = EXISTS(golf_team_coach_staff WHERE team = t ...)
 *
 * Neither that helper nor `is_golf_team_head_coach` reads
 * `golf_coaches.organization_id`, and every coach-side RLS policy routes
 * through one of them. The staff rows ARE the access; nothing else grants it.
 */
export interface PendingAssistantCoach {
  coachId: string;
  fullName: string | null;
  email: string | null;
  requestedAt: string | null;
}

async function joinTeamAsAssistantCoachImpl(
  userId: string,
  teamJoinCode: string,
  fullName: string | undefined,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();

  // The join code is the ONLY thing that decides which program is joined. It
  // came from the server-side gate cookie, never from the form.
  const { data: team, error: teamError } = await admin
    .from('golf_teams')
    .select('id, name, organization_id')
    .eq('join_code', teamJoinCode.toUpperCase())
    .maybeSingle();

  if (teamError || !team?.organization_id) {
    await logServerError(
      `[joinTeamAsAssistantCoach] team lookup failed: ${describeError(teamError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not find the team for that code.' };
  }

  // `onboarding_completed: true` — they are DONE. The wizard at '/golf/coach'
  // is new-program onboarding: it inserts a fresh organization and team and
  // re-points organization_id at them. Running it for this account is what
  // produced the "An organization named X already exists" dead end an assistant
  // hit on 2026-08-19, and, when the name did not collide, a phantom duplicate
  // program. The flag keeps every routing entry point away from that form.
  const { data: coachRow, error: coachError } = await admin
    .from('golf_coaches')
    .upsert(
      {
        user_id: userId,
        organization_id: team.organization_id,
        full_name: fullName ?? null,
        email,
        onboarding_completed: true,
      },
      { onConflict: 'user_id' },
    )
    .select('id')
    .maybeSingle();

  if (coachError || !coachRow) {
    await logServerError(
      `[joinTeamAsAssistantCoach] coach upsert failed: ${describeError(coachError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'error',
    );
    return { success: false, error: 'We could not finish setting up your account.' };
  }

  // EVERY team in the program, not just the one whose code was typed.
  const { data: programTeams, error: teamsError } = await admin
    .from('golf_teams')
    .select('id')
    .eq('organization_id', team.organization_id);

  if (teamsError) {
    // Not fatal: fall back to the team the code names, so the assistant still
    // gets in. Logged because on a multi-team program this is the difference
    // between full access and half of it.
    await logServerError(
      `[joinTeamAsAssistantCoach] program team list failed; granting access to the code's team only: ${describeError(teamsError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  const teamIds = Array.from(
    new Set([team.id, ...((programTeams ?? []).map((t) => t.id))]),
  );

  // ALWAYS 'assistant_coach'. This path cannot mint a head coach — that stays
  // with createStaffInvite's admin role, which requires deliberately choosing
  // "Program admin".
  //
  // Upsert on (team_id, coach_id) so a repeat signup or a re-run is idempotent
  // rather than a duplicate-key failure.
  const { error: staffError } = await admin
    .from('golf_team_coach_staff')
    .upsert(
      teamIds.map((id) => ({
        team_id: id,
        coach_id: coachRow.id,
        role: 'assistant_coach' as const,
        is_primary: false,
      })),
      { onConflict: 'team_id,coach_id' },
    );

  if (staffError) {
    // These rows ARE the access. Unlike the notification below, this failure
    // must be reported: staying silent would hand somebody an account that can
    // sign in and see nothing, which is precisely the old broken experience.
    await logServerError(
      `[joinTeamAsAssistantCoach] staff insert failed for coach ${coachRow.id}: ${describeError(staffError)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'error',
    );
    return {
      success: false,
      error: 'We created your account but could not add you to the team. Please try signing in again.',
    };
  }

  // Tell the head coach somebody joined. INFORMATIONAL — there is nothing to
  // approve any more — so it is fire-and-forget and never fails the signup.
  // ADMIN client because this is a cross-user write: `notifications_insert_own`
  // is WITH CHECK (user_id = auth.uid()) and would refuse a row addressed to
  // somebody else.
  try {
    const { data: heads } = await admin
      .from('golf_team_coach_staff')
      .select('coach_id, golf_coaches!inner(user_id)')
      .eq('team_id', team.id)
      .eq('role', 'head_coach');

    const recipients = (heads ?? [])
      .map((row) => (row as unknown as { golf_coaches?: { user_id?: string | null } }).golf_coaches?.user_id)
      .filter((id): id is string => Boolean(id) && id !== userId);

    if (recipients.length > 0) {
      const joinerName = fullName?.trim() || email;
      // `team_join` — a REAL member of the notification_type enum. That enum
      // has 11 values (checked against production 2026-08-20) and none of them
      // is assistant-shaped; `fromUntyped` bypasses the generated types at
      // exactly this call, so an invented label compiles, fails at runtime with
      // 22P02, and vanishes into the catch below. The copy carries the meaning.
      await fromUntyped(admin, 'notifications').insert(
        recipients.map((recipientId) => ({
          user_id: recipientId,
          type: 'team_join' as const,
          title: 'Assistant coach joined',
          body: `${joinerName} joined ${team.name ?? 'your team'} as an assistant coach.`,
          action_url: '/golf/dashboard/team',
          data: {
            team_id: team.id,
            team_name: team.name,
            joiner_email: email,
            joiner_name: joinerName,
          },
          read: false,
        })),
      );
    }
  } catch (error) {
    await logServerError(
      `[joinTeamAsAssistantCoach] notification step threw; the coach is on the team regardless: ${describeError(error)}`,
      { action: 'teams.joinTeamAsAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/dashboard/team');
  return { success: true };
}

const observedJoinTeamAsAssistantCoach = withAdminObserved(
  'joinTeamAsAssistantCoach',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  joinTeamAsAssistantCoachImpl,
);

/**
 * Attach a new assistant coach to the program named by `teamJoinCode`, with
 * full access, immediately. No approval step — see the docblock above.
 */
export async function joinTeamAsAssistantCoach(
  userId: string,
  teamJoinCode: string,
  fullName: string | undefined,
  email: string,
): Promise<{ success: boolean; error?: string }> {
  return observedJoinTeamAsAssistantCoach(userId, teamJoinCode, fullName, email);
}

/**
 * Resolve the caller to a HEAD COACH of `teamId`, or fail.
 *
 * Shared by the list/approve/decline actions below so the gate is written once
 * — an assistant must never be able to approve another assistant, which would
 * turn one approval into an unbounded chain.
 */
async function requireHeadCoachOfTeam(
  teamId: string,
): Promise<{ ok: true; coachId: string; organizationId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false, error: 'Not authenticated' };

  const { data: coach, error: coachError } = await supabase
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (coachError || !coach?.organization_id) {
    return { ok: false, error: 'Coach profile not found' };
  }

  const { data: staffRow, error: staffRowError } = await supabase
    .from('golf_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .eq('role', 'head_coach')
    .maybeSingle();

  if (staffRowError) {
    await logServerError(
      `[requireHeadCoachOfTeam] head-coach check failed for team ${teamId}: ${describeError(staffRowError)}`,
      { action: 'teams.requireHeadCoachOfTeam', featureArea: 'teams' },
      'warning',
    );
    return { ok: false, error: 'We could not verify your access just now.' };
  }
  if (!staffRow) return { ok: false, error: 'Only a head coach of this team can do that.' };

  return { ok: true, coachId: coach.id, organizationId: coach.organization_id };
}

async function listPendingAssistantCoachesImpl(
  teamId: string,
): Promise<{ success: boolean; error?: string; pending?: PendingAssistantCoach[] }> {
  const gate = await requireHeadCoachOfTeam(teamId);
  if (!gate.ok) return { success: false, error: gate.error };

  const admin = createAdminClient();

  // Everyone who asked to join this program…
  const { data: candidates, error: candidatesError } = await admin
    .from('golf_coaches')
    .select('id, full_name, email, created_at')
    .eq('organization_id', gate.organizationId)
    .eq('onboarding_completed', false)
    .order('created_at', { ascending: true });

  if (candidatesError) {
    await logServerError(
      `[listPendingAssistantCoaches] candidate read failed: ${describeError(candidatesError)}`,
      { action: 'teams.listPendingAssistantCoaches', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not load pending requests.' };
  }

  const ids = (candidates ?? []).map((c) => c.id);
  if (ids.length === 0) return { success: true, pending: [] };

  // …minus anyone who already holds staff anywhere. Holding a staff row is the
  // definition of "already in", so this is the same predicate the access
  // helpers use rather than a parallel notion of pending that could drift.
  const { data: staffed, error: staffedError } = await admin
    .from('golf_team_coach_staff')
    .select('coach_id')
    .in('coach_id', ids);

  if (staffedError) {
    await logServerError(
      `[listPendingAssistantCoaches] staff read failed: ${describeError(staffedError)}`,
      { action: 'teams.listPendingAssistantCoaches', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not load pending requests.' };
  }

  const attached = new Set((staffed ?? []).map((row) => row.coach_id));

  return {
    success: true,
    pending: (candidates ?? [])
      .filter((c) => !attached.has(c.id) && c.id !== gate.coachId)
      .map((c) => ({
        coachId: c.id,
        fullName: c.full_name,
        email: c.email,
        requestedAt: c.created_at,
      })),
  };
}

const observedListPendingAssistantCoaches = withAdminObserved(
  'listPendingAssistantCoaches',
  { sport: 'golf', feature: 'join_team_flow', demoSafe: true },
  listPendingAssistantCoachesImpl,
);

export async function listPendingAssistantCoaches(
  teamId: string,
): Promise<{ success: boolean; error?: string; pending?: PendingAssistantCoach[] }> {
  return observedListPendingAssistantCoaches(teamId);
}

async function approvePendingAssistantCoachImpl(
  coachId: string,
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireHeadCoachOfTeam(teamId);
  if (!gate.ok) return { success: false, error: gate.error };

  const admin = createAdminClient();

  // Re-check the request belongs to this head coach's own program. Without it,
  // a head coach could pass any coach id and attach a stranger to their team.
  const { data: candidate, error: candidateError } = await admin
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('id', coachId)
    .maybeSingle();

  if (candidateError || !candidate) {
    return { success: false, error: 'That request no longer exists.' };
  }
  if (candidate.organization_id !== gate.organizationId) {
    return { success: false, error: 'That request is not part of your program.' };
  }

  // ALWAYS 'assistant_coach'. This action cannot mint a head coach — promoting
  // someone to head coach stays with createStaffInvite's admin role, which
  // requires deliberately choosing "Program admin".
  const { error: staffError } = await admin
    .from('golf_team_coach_staff')
    .upsert(
      { team_id: teamId, coach_id: coachId, role: 'assistant_coach', is_primary: false },
      { onConflict: 'team_id,coach_id' },
    );

  if (staffError) {
    await logServerError(
      `[approvePendingAssistantCoach] staff insert failed: ${describeError(staffError)}`,
      { action: 'teams.approvePendingAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not approve that request.' };
  }

  // APPROVAL IS THEIR ONBOARDING — say so in the row.
  //
  // This step did not exist, and its absence made approval actively harmful.
  // `createPendingAssistantCoach` writes `onboarding_completed: false`; five
  // separate entry points then read `!onboarding_completed` and sent the
  // account to '/golf/coach', which is NEW-PROGRAM onboarding. So the moment a
  // head coach approved an assistant, that assistant's next login walked them
  // into the school-details wizard, and finishing it overwrote their
  // organization_id and detached them from the program that had just accepted
  // them. Being approved was worse than being ignored.
  //
  // Those entry points now key on the staff row instead (see
  // lib/golf/coach-entry-path.ts), so this write is no longer load-bearing for
  // routing. It is still correct: the flag means "this account needs no
  // further setup", and after approval that is true. Both layers agree, and
  // neither depends on the other being right.
  //
  // Logged rather than failed: the staff row above is the grant, and it landed.
  // Refusing the approval now would leave access granted and the caller told it
  // was refused, which is the worse of the two outcomes.
  const { error: flagError } = await admin
    .from('golf_coaches')
    .update({ onboarding_completed: true })
    .eq('id', coachId);

  if (flagError) {
    await logServerError(
      `[approvePendingAssistantCoach] approved coach ${coachId} but could not clear onboarding_completed: ${describeError(flagError)}`,
      { action: 'teams.approvePendingAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  // Tell them they're in. They have been sitting on a page that says "reload to
  // check"; a notification is the difference between joining the team and
  // discovering later that they had.
  try {
    const { data: approved } = await admin
      .from('golf_coaches')
      .select('user_id')
      .eq('id', coachId)
      .maybeSingle();
    const { data: team } = await admin
      .from('golf_teams')
      .select('name')
      .eq('id', teamId)
      .maybeSingle();

    if (approved?.user_id) {
      const { error: notifyError } = await fromUntyped(admin, 'notifications').insert({
        user_id: approved.user_id,
        // Same enum constraint as the request notification above.
        type: 'team_join_approved' as const,
        title: "You're on the team",
        body: `You were approved as an assistant coach for ${team?.name ?? 'your team'}.`,
        action_url: '/golf/dashboard',
        data: { team_id: teamId, team_name: team?.name ?? null },
        read: false,
      });
      if (notifyError) {
        await logServerError(
          `[approvePendingAssistantCoach] approval notification insert failed: ${describeError(notifyError)}`,
          { action: 'teams.approvePendingAssistantCoach', featureArea: 'teams' },
          'warning',
        );
      }
    }
  } catch (error) {
    await logServerError(
      `[approvePendingAssistantCoach] approval notification step threw: ${describeError(error)}`,
      { action: 'teams.approvePendingAssistantCoach', featureArea: 'teams' },
      'warning',
    );
  }

  revalidatePath('/golf/dashboard/team');
  revalidatePath('/golf/dashboard');
  revalidatePath('/golf/coach/pending');
  return { success: true };
}

const observedApprovePendingAssistantCoach = withAdminObserved(
  'approvePendingAssistantCoach',
  { sport: 'golf', feature: 'join_team_flow' },
  approvePendingAssistantCoachImpl,
);

export async function approvePendingAssistantCoach(
  coachId: string,
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  return observedApprovePendingAssistantCoach(coachId, teamId);
}

async function declinePendingAssistantCoachImpl(
  coachId: string,
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireHeadCoachOfTeam(teamId);
  if (!gate.ok) return { success: false, error: gate.error };

  const admin = createAdminClient();

  const { data: candidate, error: candidateError } = await admin
    .from('golf_coaches')
    .select('id, organization_id')
    .eq('id', coachId)
    .maybeSingle();

  if (candidateError || !candidate) return { success: false, error: 'That request no longer exists.' };
  if (candidate.organization_id !== gate.organizationId) {
    return { success: false, error: 'That request is not part of your program.' };
  }

  // Detach rather than delete. The person still has working credentials — they
  // simply are not attached to this program — so declining never destroys an
  // account, and a mistaken decline costs one re-request instead of a support
  // ticket.
  const { error: detachError } = await admin
    .from('golf_coaches')
    .update({ organization_id: null })
    .eq('id', coachId);

  if (detachError) {
    await logServerError(
      `[declinePendingAssistantCoach] detach failed: ${describeError(detachError)}`,
      { action: 'teams.declinePendingAssistantCoach', featureArea: 'teams' },
      'warning',
    );
    return { success: false, error: 'We could not decline that request.' };
  }

  revalidatePath('/golf/dashboard/team');
  return { success: true };
}

const observedDeclinePendingAssistantCoach = withAdminObserved(
  'declinePendingAssistantCoach',
  { sport: 'golf', feature: 'join_team_flow' },
  declinePendingAssistantCoachImpl,
);

export async function declinePendingAssistantCoach(
  coachId: string,
  teamId: string,
): Promise<{ success: boolean; error?: string }> {
  return observedDeclinePendingAssistantCoach(coachId, teamId);
}
