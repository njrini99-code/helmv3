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
  email: string | null;
  primary_position: string | null;
  grad_year: number | null;
}

/**
 * Search existing baseball_players by name or email for the "Add existing
 * player" flow (mid-season transfer / manual add), excluding anyone already a
 * member (any status) of the active team. Read-only, gated to
 * can_manage_roster like every other roster mutation surface. Requires a
 * non-trivial query so this never degrades into a full-table browse.
 */
export const searchAssignablePlayers = withBaseballAction(
  'searchAssignablePlayers',
  { featureArea: 'baseball-roster', requiredCapability: 'can_manage_roster' },
  async (
    ctx,
    args: { query: string },
  ): Promise<{ success: boolean; data?: AssignablePlayerResult[]; error?: string }> => {
    // Strip characters that are reserved in PostgREST's `.or()` filter DSL
    // (comma separates conditions, parens group them, quotes/backslashes
    // escape) before it ever reaches the query builder — a name/email search
    // has no legitimate use for any of them, and this guarantees the
    // interpolated filter string below can never be mis-parsed.
    const query = (args.query ?? '').replace(/[,()"\\]/g, ' ').trim();
    if (query.length < 2) {
      return { success: true, data: [] };
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
      .select('id, first_name, last_name, email, primary_position, grad_year')
      .or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,email.ilike.%${escaped}%`)
      .limit(10);

    if (searchError) {
      throw searchError;
    }

    const data = (players ?? []).filter((p) => !existingIds.has(p.id));
    return { success: true, data };
  },
);
