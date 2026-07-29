'use server';

// =============================================================================
// src/app/baseball/actions/roster.ts
//
// Wave 5 / packet P5.3 — Baseball roster actions (assign / remove).
//
// Parity with src/app/golf/actions/roster.ts, but:
//   * Every action runs inside withBaseballAction with
//     { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' }.
//     Auth + active-team context + the can_manage_roster capability are enforced
//     SERVER-SIDE before the body runs. The client never asserts a capability.
//   * Mutations are NON-DESTRUCTIVE: assignment is an upsert on the
//     (team_id, player_id) pair — never delete-then-insert. Removal is a scoped
//     single-membership delete (the player account is untouched).
//   * Each successful mutation appends a roster timeline event for the player
//     (best-effort side-effect; a timeline failure never rolls back the roster
//     change).
//   * Errors are sanitized by the wrapper — raw DB errors never reach the client.
//
// Capability key 'can_manage_roster' is the canonical roster capability from the
// Wave-1 staff-capabilities migration + src/lib/baseball/capabilities.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { requireBaseballCapability } from '@/lib/baseball/capabilities';
import { appendRosterTimelineEvent } from '@/lib/baseball/timeline-writer';
import { resolveBaseballLiftingOrg } from '@/lib/lifting/resolve-baseball-context';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// -----------------------------------------------------------------------------
// Result shape (mirrors golf roster.ts)
// -----------------------------------------------------------------------------

interface RosterActionResult {
  success: boolean;
  error?: string;
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

/** Revalidate every surface that renders the roster after a change. */
function revalidateRoster(): void {
  revalidatePath('/baseball/dashboard');
  revalidatePath('/baseball/dashboard/roster');
  revalidatePath('/baseball/dashboard/command-center');
}

/** Resolve a short, safe display name for a player (for the timeline title). */
function playerDisplayName(
  p: { first_name: string | null; last_name: string | null } | null,
): string {
  if (!p) return 'Player';
  const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return name || 'Player';
}

// -----------------------------------------------------------------------------
// Lift Lab propagation (roster status -> helm_lifting_athletes.is_active)
// -----------------------------------------------------------------------------
//
// LINKING COLUMN: helm_lifting_athletes.sport_player_id = baseball_players.id,
// scoped by (organization_id, sport = 'baseball'). organization_id comes from
// baseball_teams.organization_id for the acting team (ctx.targetTeamId), via
// resolveBaseballLiftingOrg — the same helper every other baseball Lift Lab
// surface (live-weight-room.ts, lifting-v11.ts, lift-onboarding.ts) already
// uses to bridge baseball_players.id <-> helm_lifting_athletes.id.
//
// THE BUG THIS CLOSES (docs/baseballhelm-overnight/ISSUE_LEDGER.md #9):
// helm_lifting_sync_org_athletes() (supabase/migrations/
// 20260625000030_helm_lifting_accept_invite_rpc.sql) is an idempotent
// `INSERT ... ON CONFLICT (organization_id, sport, sport_player_id) DO
// NOTHING` — it only ever CREATES an athlete row and never flips is_active
// back off when the player later leaves baseball_team_members. A cut
// player's helm_lifting_athletes row stayed is_active=true forever: still
// eligible for dynamic group membership, still visible in the Live Weight
// Room, still counted in coach compliance views (every one of those reads
// gates ONLY on `.eq('is_active', true)`, nothing roster-aware).
//
// DEACTIVATE, NEVER DELETE: helm_lifting_sessions / _set_results /
// _readiness_checkins / _maxes / _prs all FK to helm_lifting_athletes.id —
// deleting the athlete row would orphan or cascade-destroy a real training
// history. A cut player's training history is still real, still theirs;
// is_active is a roster-visibility flag, not the row's identity, and it is
// the only column this helper ever writes.
//
// SERVICE-ROLE CLIENT IS INTENTIONAL, NOT A SHORTCUT: helm_lifting_athletes'
// RLS UPDATE policy (hla_update, supabase/migrations/
// 20260625000000_helm_lifting_identity.sql) is gated on
// helm_lifting_can_edit_org(), which requires the caller to be an ACTIVE
// helm_lifting_coaches row (or a can_edit org viewer) — a DIFFERENT identity
// than the baseball can_manage_roster capability this file's actions already
// require via withBaseballAction. Lift Lab is opt-in, so a baseball coach who
// never onboarded into it would have this write silently match 0 rows under
// RLS despite being fully authorized to manage the roster. Because
// can_manage_roster has ALREADY been enforced server-side before any call
// site below runs, the admin client here is a narrowly-scoped propagation of
// an already-authorized decision across a bounded-context boundary — not a
// bypass of a check that still needed to happen.
//
// REACTIVATION (judgment call): a player re-added to the roster after being
// removed (assignPlayerToTeam's brand-new-membership branch) or whose
// pending join is approved (approvePendingMember) has their Lift Lab seat
// symmetrically restored (is_active -> true). A coach re-adding a player
// expects every other team surface to work again immediately (calendar,
// tasks, messaging); leaving Lift Lab as a silent, undocumented exception
// would be a confusing trap, and reactivating is exactly as safe as the
// original activation (same capability gate, same org scope) — training
// history is untouched by is_active either way. A player never seeded into
// Lift Lab matches zero rows and this is a harmless no-op.
//
// NEVER THROWS: every call site below awaits this as a best-effort
// side-effect AFTER the primary roster mutation has already succeeded. A
// Lift Lab outage, a team with no organization_id, or a service-role
// misconfiguration must never fail (or roll back) a legitimate roster edit.
// -----------------------------------------------------------------------------

async function setLiftLabAthleteActive(
  teamId: string,
  playerId: string,
  isActive: boolean,
): Promise<void> {
  try {
    const liftCtx = await resolveBaseballLiftingOrg(teamId);
    if (!liftCtx) return; // Team has no organization_id — no Lift Lab presence is possible.

    const admin = createAdminClient();
    const { error } = await fromUntyped(admin, 'helm_lifting_athletes')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('organization_id', liftCtx.organizationId)
      .eq('sport', 'baseball')
      .eq('sport_player_id', playerId);

    // A zero-row match (player was never seeded into Lift Lab — the common
    // case, since it's opt-in per org) returns { error: null }, not an
    // error, so this is already idempotent for "most players have none".
    if (error) {
      await logServerError(
        `Failed to ${isActive ? 're' : 'de'}activate Lift Lab athlete row for baseball player ${playerId}: ${describeError(error)}`,
        {
          action: 'roster.setLiftLabAthleteActive',
          featureArea: 'baseball-roster',
          teamId,
          sport: 'baseball',
        },
      );
    }
  } catch (err) {
    // createAdminClient() throws synchronously if service-role env vars are
    // missing/misconfigured — caught here so that alone can never fail a
    // roster edit either.
    await logServerError(
      `Lift Lab athlete ${isActive ? 'reactivation' : 'deactivation'} threw for baseball player ${playerId}: ${describeError(err)}`,
      {
        action: 'roster.setLiftLabAthleteActive',
        featureArea: 'baseball-roster',
        teamId,
        sport: 'baseball',
      },
    );
  }
}

/** Deactivate (never delete) a player's Lift Lab athlete row, if one exists. */
function deactivateLiftLabAthlete(teamId: string, playerId: string): Promise<void> {
  return setLiftLabAthleteActive(teamId, playerId, false);
}

/** Reactivate a player's Lift Lab athlete row, if one exists. See judgment-call note above. */
function reactivateLiftLabAthlete(teamId: string, playerId: string): Promise<void> {
  return setLiftLabAthleteActive(teamId, playerId, true);
}

// -----------------------------------------------------------------------------
// assignPlayerToTeam
// -----------------------------------------------------------------------------

/**
 * Add (or edit) a player on the active team's roster.
 *
 * NON-DESTRUCTIVE: checks for an existing (team_id, player_id) membership
 * first, then either UPDATEs just the editable fields (jersey/position) or
 * INSERTs a brand-new row — never delete-then-reinsert.
 *
 * `joined_at` and `status` are membership-lifecycle fields, not editable
 * jersey/position fields: they are set ONLY on the insert branch (a genuinely
 * new membership). An update of an already-rostered player's jersey number
 * or position must NEVER touch either — `joined_at` is read straight through
 * to the public player profile ("Joined {month year}") and drives roster
 * sort order, so resetting it on every edit would corrupt both. Likewise
 * `status` defaults to 'pending' in Postgres; a brand-new membership created
 * through this manual "add existing player" flow is explicitly vouched for
 * by the coach, so it should land 'active', not silently join the same
 * pending/awaiting-join bucket the approve/reject flow exists to clear.
 *
 * Capability: can_manage_roster (enforced server-side by withBaseballAction).
 */
export const assignPlayerToTeam = withBaseballAction(
  'assignPlayerToTeam',
  { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' },
  async (
    ctx,
    args: { playerId: string; jerseyNumber?: number | null; position?: string | null },
  ): Promise<RosterActionResult> => {
    const { playerId, jerseyNumber = null, position = null } = args;
    if (!playerId) {
      return { success: false, error: 'A player is required.' };
    }

    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Confirm the player exists (so we can label the timeline event and avoid a
    // dangling membership FK error surfacing as a generic failure).
    const { data: player, error: playerError } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .maybeSingle();

    if (playerError || !player) {
      return { success: false, error: 'That player could not be found.' };
    }

    // Determine INSERT vs UPDATE up front so joined_at/status are only ever
    // set on a genuinely new membership, never reset on an edit.
    const { data: existing, error: existingError } = await supabase
      .from('baseball_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      // EDIT of an already-rostered player: jersey/position only.
      // joined_at and status are left completely untouched.
      const { error: updateError } = await supabase
        .from('baseball_team_members')
        .update({ jersey_number: jerseyNumber, position })
        .eq('id', existing.id);

      if (updateError) {
        throw updateError;
      }
    } else {
      // Brand-new membership: a coach-initiated manual add is an explicit
      // vouch, so it lands 'active' rather than the DB's 'pending' default
      // (which exists for the self-serve invite-link join path).
      const { error: insertError } = await supabase
        .from('baseball_team_members')
        .insert({
          team_id: teamId,
          player_id: playerId,
          jersey_number: jerseyNumber,
          position,
          joined_at: new Date().toISOString(),
          status: 'active',
        });

      if (insertError) {
        throw insertError;
      }

      // Best-effort: a brand-new membership is treated as a (re)activation —
      // if this player previously had their Lift Lab seat deactivated by
      // removePlayerFromTeam, restore it. See the Lift Lab propagation
      // comment block above for the reactivation judgment call.
      await reactivateLiftLabAthlete(teamId, playerId);
    }

    // Best-effort timeline side-effect — never rolls back the roster change.
    await appendRosterTimelineEvent({
      teamId,
      playerId,
      title: existing
        ? `${playerDisplayName(player)}'s roster details were updated`
        : `${playerDisplayName(player)} added to the roster`,
      visibility: 'team',
      source: 'manual',
      createdBy: ctx.user.id,
    });

    revalidateRoster();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// removePlayerFromTeam
// -----------------------------------------------------------------------------

/**
 * Remove a player from the active team's roster. Deletes ONLY the
 * baseball_team_members membership row scoped to (team_id, player_id) — the
 * player account, stats, and history are untouched.
 *
 * This is a targeted single-membership delete (not a delete-then-reinsert save
 * path), so it does not violate the no-destructive-writes rule.
 *
 * Capability: can_manage_roster (enforced server-side by withBaseballAction).
 */
export const removePlayerFromTeam = withBaseballAction(
  'removePlayerFromTeam',
  { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' },
  async (ctx, args: { playerId: string }): Promise<RosterActionResult> => {
    const { playerId } = args;
    if (!playerId) {
      return { success: false, error: 'A player is required.' };
    }

    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Confirm the player is on THIS team (scopes the action + labels the event).
    const { data: membership, error: memberError } = await supabase
      .from('baseball_team_members')
      .select('id, baseball_players!inner ( id, first_name, last_name )')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .maybeSingle();

    if (memberError || !membership) {
      return { success: false, error: 'That player is not on your team.' };
    }

    const playerRow = (membership as unknown as {
      baseball_players: { first_name: string | null; last_name: string | null } | null;
    }).baseball_players;

    const { error: deleteError } = await supabase
      .from('baseball_team_members')
      .delete()
      .eq('player_id', playerId)
      .eq('team_id', teamId);

    if (deleteError) {
      throw deleteError;
    }

    // Best-effort: propagate the removal to the player's Lift Lab athlete row
    // (if one exists) — deactivates it (never deletes) so they drop out of
    // dynamic group membership, the Live Weight Room, and compliance views.
    // Never rolls back the roster change (see Lift Lab propagation block above).
    await deactivateLiftLabAthlete(teamId, playerId);

    // Best-effort timeline side-effect.
    await appendRosterTimelineEvent({
      teamId,
      playerId,
      title: `${playerDisplayName(playerRow)} removed from the roster`,
      visibility: 'team',
      source: 'manual',
      createdBy: ctx.user.id,
    });

    revalidateRoster();
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// getTeamPlayers
// -----------------------------------------------------------------------------

/**
 * List the players on the active team's roster. Read-only; gated to staff with
 * can_manage_roster (rosters are a staff surface). Returns an honest empty list
 * when the team has no members.
 */
export const getTeamPlayers = withBaseballAction(
  'getTeamPlayers',
  { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' },
  async (
    ctx,
  ): Promise<{
    success: boolean;
    data?: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      jersey_number: number | null;
      position: string | null;
      status: string | null;
    }>;
    error?: string;
  }> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: members, error: membersError } = await supabase
      .from('baseball_team_members')
      .select('player_id, jersey_number, position, status')
      .eq('team_id', teamId);

    if (membersError) {
      throw membersError;
    }
    if (!members || members.length === 0) {
      return { success: true, data: [] };
    }

    const playerIds = members.map((m) => m.player_id);
    const { data: players, error: playersError } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name')
      .in('id', playerIds)
      .order('last_name', { ascending: true });

    if (playersError) {
      throw playersError;
    }

    const byPlayer = new Map(members.map((m) => [m.player_id, m]));
    const result = (players ?? []).map((p) => {
      const m = byPlayer.get(p.id);
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name,
        jersey_number: m?.jersey_number ?? null,
        position: m?.position ?? null,
        status: (m?.status as string | null) ?? null,
      };
    });

    return { success: true, data: result };
  },
);

// -----------------------------------------------------------------------------
// approvePendingMember / rejectPendingMember
// -----------------------------------------------------------------------------
//
// Closes the pending-joiner gap (bb-roster-profiles + auth-onboarding-join):
// joinTeamImpl (teams.ts) lands every new joiner in status='pending' whenever
// the team's require_coach_approval is true (the default for every real team),
// but nothing anywhere ever transitioned that row to 'active' — a pending
// player was permanently invisible to team-context resolution with no coach
// control to fix it. These two actions are that missing control.
//
// The team_id needed for the capability check is not known up front — the
// caller only has a baseball_team_members row id — so, mirroring
// revokeTeamInvitation in teams.ts, the capability check is done manually
// inside the body (resolve the membership's team_id first, THEN enforce
// can_manage_roster) rather than via the wrapper's `teamFrom` option.

interface PendingMemberActionResult extends RosterActionResult {
  /** Present on success so the caller can drop the row from a local list. */
  memberId?: string;
}

async function loadPendingMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  memberId: string,
) {
  return supabase
    .from('baseball_team_members')
    .select('id, team_id, player_id, status, baseball_players!inner ( first_name, last_name )')
    .eq('id', memberId)
    .maybeSingle();
}

/**
 * Approve a pending join request: baseball_team_members.status
 * 'pending' -> 'active'. Records the approving coach + timestamp (the
 * approved_by/approved_at columns provisioned for exactly this flow).
 */
export const approvePendingMember = withBaseballAction(
  'approvePendingMember',
  { featureArea: 'baseball-roster' },
  async (ctx, args: { memberId: string }): Promise<PendingMemberActionResult> => {
    const { memberId } = args;
    if (!memberId) {
      return { success: false, error: 'A membership is required.' };
    }

    const supabase = await createClient();
    const { data: membership, error: memberError } = await loadPendingMembership(supabase, memberId);

    if (memberError || !membership) {
      return { success: false, error: 'That join request could not be found.' };
    }

    try {
      await requireBaseballCapability(membership.team_id, 'can_manage_roster');
    } catch {
      return { success: false, error: 'You do not have permission to manage this roster.' };
    }

    if (membership.status !== 'pending') {
      return { success: false, error: 'This request has already been processed.' };
    }

    const { data: coach } = await supabase
      .from('baseball_coaches')
      .select('id')
      .eq('user_id', ctx.user.id)
      .maybeSingle();

    const { error: updateError } = await supabase
      .from('baseball_team_members')
      .update({
        status: 'active',
        approved_by: coach?.id ?? null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (updateError) {
      throw updateError;
    }

    const playerRow = (membership as unknown as {
      baseball_players: { first_name: string | null; last_name: string | null } | null;
    }).baseball_players;

    // Best-effort: approval is a (re)activation onto the active roster —
    // symmetrically restore the Lift Lab seat if one exists. See the Lift
    // Lab propagation comment block above for the reactivation judgment call.
    await reactivateLiftLabAthlete(membership.team_id, membership.player_id);

    // Best-effort timeline side-effect — never rolls back the approval.
    await appendRosterTimelineEvent({
      teamId: membership.team_id,
      playerId: membership.player_id,
      title: `${playerDisplayName(playerRow)}'s join request was approved`,
      visibility: 'team',
      source: 'manual',
      createdBy: ctx.user.id,
    });

    revalidateRoster();
    return { success: true, memberId };
  },
);

/**
 * Decline a pending join request. This is a scoped single-membership DELETE
 * (never the player's account/stats) — the player can rejoin later via the
 * team's invite link if the decline was in error.
 */
export const rejectPendingMember = withBaseballAction(
  'rejectPendingMember',
  { featureArea: 'baseball-roster' },
  async (ctx, args: { memberId: string }): Promise<PendingMemberActionResult> => {
    const { memberId } = args;
    if (!memberId) {
      return { success: false, error: 'A membership is required.' };
    }

    const supabase = await createClient();
    const { data: membership, error: memberError } = await loadPendingMembership(supabase, memberId);

    if (memberError || !membership) {
      return { success: false, error: 'That join request could not be found.' };
    }

    try {
      await requireBaseballCapability(membership.team_id, 'can_manage_roster');
    } catch {
      return { success: false, error: 'You do not have permission to manage this roster.' };
    }

    if (membership.status !== 'pending') {
      return { success: false, error: 'This request has already been processed.' };
    }

    const playerRow = (membership as unknown as {
      baseball_players: { first_name: string | null; last_name: string | null } | null;
    }).baseball_players;

    const { error: deleteError } = await supabase
      .from('baseball_team_members')
      .delete()
      .eq('id', memberId);

    if (deleteError) {
      throw deleteError;
    }

    // Best-effort: a declined pending join is a removal from the roster —
    // deactivate (never delete) the Lift Lab seat if one exists. Never rolls
    // back the decline (see Lift Lab propagation block above).
    await deactivateLiftLabAthlete(membership.team_id, membership.player_id);

    // Best-effort timeline side-effect.
    await appendRosterTimelineEvent({
      teamId: membership.team_id,
      playerId: membership.player_id,
      title: `${playerDisplayName(playerRow)}'s join request was declined`,
      visibility: 'team',
      source: 'manual',
      createdBy: ctx.user.id,
    });

    revalidateRoster();
    return { success: true, memberId };
  },
);

// -----------------------------------------------------------------------------
// searchAssignablePlayers
// -----------------------------------------------------------------------------

export interface AssignablePlayerResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  grad_year: number | null;
}

/**
 * Which of the two lookups produced this response — the UI needs it to explain
 * an empty result honestly ("nobody on your roster matches that name" reads
 * very differently from "no account uses that address").
 */
export type AssignablePlayerLookup = 'name' | 'email';

/**
 * A query is treated as an exact-email lookup only when it is a single, whole
 * address: exactly one '@', something on both sides of it, no whitespace. The
 * check runs on the SANITIZED query, so a name that happened to pick up an '@'
 * next to a stripped character can never be mistaken for one. Deliberately
 * lenient about the domain (no TLD requirement) — the RPC's own guard is just
 * "contains @", and a query this narrow that matches nothing costs one
 * zero-row round trip, while a false negative would silently deny a coach the
 * only cross-program path they have.
 */
const EXACT_EMAIL_QUERY = /^[^\s@]+@[^\s@]+$/;

/**
 * Exact, case-insensitive email lookup via the SECURITY DEFINER RPC added in
 * 20260729000100_baseball_tenant_isolation_rls_a_additive.sql. The RPC
 * re-checks can_manage_roster on THIS team inside the definer body — capability
 * on some other team is not authority here — and returns identity columns only,
 * never email/phone/GPA/test scores.
 *
 * Never throws: this is the additive half of the lookup. If it is unavailable
 * the "players I can already see" search below must still work, so a failure is
 * logged and degrades to zero extra matches rather than failing the whole
 * search. (`as never` on the RPC name/args is this repo's idiom for a function
 * that post-dates the last `db:types` regen — see staff.ts's
 * baseball_accept_staff_invite call.)
 */
async function findAssignablePlayerByExactEmail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  email: string,
): Promise<AssignablePlayerResult[]> {
  const { data, error } = (await supabase.rpc('find_baseball_player_by_email_for_roster' as never, {
    p_team_id: teamId,
    p_email: email,
  } as never)) as { data: AssignablePlayerResult[] | null; error: unknown };

  if (error) {
    await logServerError(
      `Exact-email roster lookup failed for team ${teamId}: ${describeError(error)}`,
      {
        action: 'roster.searchAssignablePlayers',
        featureArea: 'baseball-roster',
        teamId,
        sport: 'baseball',
        // Stays in error_logs + admin_events, out of Sentry. This fires on
        // EVERY email-shaped keystroke-pause during the documented window
        // where this code is deployed and migration A is not yet applied
        // (PostgREST answers PGRST202). One Sentry issue per search, per
        // coach, would bury real bugs under a condition we already know
        // about and have a migration queued for. The Helm Bridge feed still
        // shows it, which is where someone would look for "why is transfer
        // search finding nobody".
        skipSentry: true,
      },
    );
    return [];
  }

  return data ?? [];
}

/**
 * Find a player to add to the active team ("Add existing player" — a mid-season
 * transfer, or a manual add of someone who already has an account), excluding
 * anyone already a member (any status). Read-only, gated to can_manage_roster
 * like every other roster surface in this file.
 *
 * TWO LOOKUPS, DELIBERATELY DIFFERENT IN SHAPE:
 *
 *   1. Name substring, over whatever the caller can already read. This used to
 *      also match on `email` across every row of baseball_players — with
 *      baseball_players_select still USING(true), typing "sm" returned
 *      strangers' names and email addresses from every program in the database.
 *      That was the tenant-isolation leak dressed up as a feature, so the email
 *      column is gone from both the filter and the projection: a substring
 *      match on an identifier the caller doesn't already hold is exactly the
 *      capability being removed. What survives is a name search over rows the
 *      caller can already read — and note that nothing in THIS function is what
 *      scopes it. The query below is unchanged; the ground under it moves when
 *      20260729000200_baseball_tenant_isolation_rls_b_policies.sql replaces
 *      baseball_players_select's USING(true) with own-roster-plus-recruiting-
 *      discoverable. Until that migration is applied this path still returns
 *      cross-tenant names, and no app-side edit can change that.
 *
 *   2. Exact email, via find_baseball_player_by_email_for_roster(). A coach
 *      taking a transfer has the player's address — it is on the paperwork, or
 *      the player gave it to them. Proving you already know an identifier is
 *      something RLS cannot express (it can't see a query's own WHERE-clause
 *      literal), so it has to be an argument compared server-side.
 *
 * Both paths return the SAME columns. `email` is not among them and is not
 * optional-and-sometimes-absent: the RPC will never return it, and re-adding it
 * on the name path would rebuild half the leak to populate a field the coach
 * only needs when they already typed it. Position and grad year are what
 * distinguish two players with the same name.
 */
export const searchAssignablePlayers = withBaseballAction(
  'searchAssignablePlayers',
  { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' },
  async (
    ctx,
    args: { query: string },
  ): Promise<{
    success: boolean;
    data?: AssignablePlayerResult[];
    lookup?: AssignablePlayerLookup;
    /**
     * The id of the row that came back from the exact-email RPC, if any. The
     * two lookups have genuinely different trust stories — one confirmed an
     * address the coach already held, the other matched a substring of a name —
     * and the UI labels them differently rather than flattening both into one
     * undifferentiated list.
     */
    exactEmailMatchId?: string | null;
    /**
     * How many players matched the search but were withheld because they are
     * already on this roster.
     *
     * Non-zero with an empty `data` is the case that matters: the search found
     * the right person and correctly refused to offer them again. Without this
     * the caller cannot tell that apart from "found nobody", and the empty
     * state ends up telling a coach to go invite someone who is already on
     * their team.
     */
    alreadyOnRoster?: number;
    error?: string;
  }> => {
    // Strip characters that are reserved in PostgREST's `.or()` filter DSL
    // (comma separates conditions, parens group them, quotes/backslashes
    // escape) before it ever reaches the query builder — a name/email search
    // has no legitimate use for any of them, and this guarantees the
    // interpolated filter string below can never be mis-parsed.
    const query = (args.query ?? '').replace(/[,()"\\]/g, ' ').trim();
    const lookup: AssignablePlayerLookup = EXACT_EMAIL_QUERY.test(query) ? 'email' : 'name';
    if (query.length < 2) {
      return { success: true, data: [], lookup, exactEmailMatchId: null, alreadyOnRoster: 0 };
    }

    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: existingMembers, error: membersError } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    if (membersError) {
      throw membersError;
    }
    const existingIds = new Set((existingMembers ?? []).map((m) => m.player_id));

    const escaped = query.replace(/[%_]/g, (c) => `\\${c}`);
    const { data: players, error: searchError } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name, primary_position, grad_year')
      .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%`)
      .limit(10);

    if (searchError) {
      throw searchError;
    }

    const exactMatches =
      lookup === 'email' ? await findAssignablePlayerByExactEmail(supabase, teamId, query) : [];

    // Exact match first — it is the higher-confidence result, and it is the one
    // the coach is looking for when they paste an address. Dedupe by id: an
    // address belonging to someone the caller can also see by name would
    // otherwise appear twice.
    const seen = new Set(existingIds);
    const data: AssignablePlayerResult[] = [];
    // Matches dropped ONLY because the player is already on this roster.
    //
    // This has to travel back to the caller. Without it, a search that found
    // exactly the right person and dropped them as a duplicate is
    // indistinguishable from a search that found nobody — so the UI told a
    // coach "no account uses that address, send them an invite" about someone
    // already sitting on their roster. An empty result is not the same fact as
    // an excluded result, and the empty state must not claim it is.
    let alreadyOnRoster = 0;
    for (const player of [...exactMatches, ...(players ?? [])]) {
      if (existingIds.has(player.id)) {
        if (!seen.has(`counted:${player.id}`)) {
          seen.add(`counted:${player.id}`);
          alreadyOnRoster += 1;
        }
        continue;
      }
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      data.push(player);
    }

    // Null when the email path found nobody, and also when it found someone
    // who is already on this roster — in that case the row was dropped above
    // and there is nothing left to label. `alreadyOnRoster` is what tells the
    // two apart.
    const exactEmailMatchId = data.some((p) => p.id === exactMatches[0]?.id)
      ? (exactMatches[0]?.id ?? null)
      : null;

    return {
      success: true,
      data: data.slice(0, 10),
      lookup,
      exactEmailMatchId,
      alreadyOnRoster,
    };
  },
);
