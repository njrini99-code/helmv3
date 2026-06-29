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
 * Add (or re-activate) a player on the active team's roster.
 *
 * NON-DESTRUCTIVE: upserts the (team_id, player_id) membership rather than
 * deleting + re-inserting, so a transient failure can never drop an existing
 * membership. If the player is already on the team, this is a no-op-ish update.
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

    // NON-DESTRUCTIVE upsert on the unique (team_id, player_id) pair.
    const { error: upsertError } = await supabase
      .from('baseball_team_members')
      .upsert(
        {
          team_id: teamId,
          player_id: playerId,
          jersey_number: jerseyNumber,
          position,
          joined_at: new Date().toISOString(),
        },
        { onConflict: 'team_id,player_id', ignoreDuplicates: false },
      );

    if (upsertError) {
      // Let the wrapper sanitize + log the raw DB error.
      throw upsertError;
    }

    // Best-effort timeline side-effect — never rolls back the roster change.
    await appendRosterTimelineEvent({
      teamId,
      playerId,
      title: `${playerDisplayName(player)} added to the roster`,
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
