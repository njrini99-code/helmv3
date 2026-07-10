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
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { requireBaseballCapability } from '@/lib/baseball/capabilities';
import { appendRosterTimelineEvent } from '@/lib/baseball/timeline-writer';

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
