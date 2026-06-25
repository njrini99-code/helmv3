'use server';

// =============================================================================
// src/app/baseball/actions/player-actions.ts
//
// The PLAYER side of source -> signal -> action. The staff Signal Inbox
// (actions/signals.ts) converts a signal into a baseball_actions row assigned to
// a player; THIS module is the player's write path against that row.
//
// WHY A SEPARATE FILE FROM signals.ts:
//   signals.ts is the STAFF triage + conversion surface — every action there
//   requires `can_manage_stats` (a coach capability). A player holds no staff
//   capability, so they could never advance their own assigned task through
//   updateActionStatus. This module gives the player a capability-free,
//   self-scoped write path that:
//
//     1. confirms the action is theirs (assignee_player_id == their player id),
//     2. is player-visible (visibility != 'staff_only'),
//     3. is a player-facing action type (player_task | video_request | message),
//     4. and only advances STATUS along the player-allowed lane:
//          open --acknowledge--> in_progress --complete--> completed
//        Completion stamps completed_at, which is what the V10 outcome sweep
//        reads to measure whether the targeted metric moved (so a player's
//        completion finally feeds the did-it-move ledger).
//
// SECURITY (defense in depth on top of RLS):
//   * RLS policy baseball_actions_update already binds a player update to
//     (assignee_player_id == get_my_baseball_player_id() AND visibility in
//     team/player_only). We RE-CHECK ownership in-process and PIN the update
//     filter to the resolved player id + a status whitelist so a player can only
//     ever touch their own row and only ever write a status (never reassign,
//     re-target, change visibility, etc.).
//   * No staff capability is required (a player has none); withBaseballAction
//     still enforces auth + active-context + Sentry + sanitized errors.
//
// NON-DESTRUCTIVE: status-only UPDATE of a single owned row. No delete/reinsert.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendTimelineEvent } from '@/lib/baseball/timeline-writer';
import type { BaseballAction } from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Result shape (mirrors SignalActionResult so callers branch uniformly).
// -----------------------------------------------------------------------------

export interface PlayerActionResult {
  success: boolean;
  /** The action's resulting status on success (for optimistic reconciliation). */
  status?: BaseballAction['status'];
  error?: string;
}

const PLAYER_TODAY_PATH = '/baseball/player/today';
const PLAYER_PASSPORT_PATH = '/baseball/player/passport';
// The staff Signal Inbox + command center reflect the action lifecycle too, so a
// player completing their task updates the coach's board.
const SIGNALS_PATH = '/baseball/dashboard/signals';
const COMMAND_PATH = '/baseball/dashboard/command-center';

function revalidatePlayerActionSurfaces() {
  revalidatePath(PLAYER_TODAY_PATH);
  revalidatePath(PLAYER_PASSPORT_PATH);
  revalidatePath(SIGNALS_PATH);
  revalidatePath(COMMAND_PATH);
}

// The action types a player may act on. A meeting_item / player_note /
// import_review / practice_block / lift_modification is NEVER a player obligation
// here (lift work lives in the Lifts Due feed; the rest are staff-internal).
const PLAYER_ACTION_TYPES: ReadonlySet<string> = new Set([
  'player_task',
  'video_request',
  'message',
]);

// The next status a player may set, given the current one. This is the player's
// lane through the lifecycle — it deliberately CANNOT reach 'cancelled' (a staff
// decision) and cannot walk a terminal action backwards.
//   open        -> in_progress (acknowledge) | completed (complete directly)
//   in_progress -> completed (complete)
//   blocked     -> in_progress (un-block by starting) | completed
type PlayerNextStatus = 'in_progress' | 'completed';
const PLAYER_STATUS_TRANSITIONS: Record<string, ReadonlySet<PlayerNextStatus>> = {
  open: new Set<PlayerNextStatus>(['in_progress', 'completed']),
  in_progress: new Set<PlayerNextStatus>(['completed']),
  blocked: new Set<PlayerNextStatus>(['in_progress', 'completed']),
};

// -----------------------------------------------------------------------------
// Load + ownership-scope an action to the current player on the active team.
// -----------------------------------------------------------------------------

interface OwnedAction {
  id: string;
  action_type: string;
  title: string;
  status: string;
  visibility: string;
  signal_id: string | null;
  assignee_player_id: string | null;
}

async function loadMyAction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  playerId: string,
  actionId: string,
): Promise<OwnedAction | null> {
  // RLS already restricts what a player can SELECT; we additionally pin the
  // filter to the player id so a stale/cross-team id resolves to null cleanly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('baseball_actions')
    .select('id, action_type, title, status, visibility, signal_id, assignee_player_id')
    .eq('id', actionId)
    .eq('team_id', teamId)
    .eq('assignee_player_id', playerId)
    .maybeSingle();
  return (data as OwnedAction | null) ?? null;
}

/** Resolve the current user's player id on the active team (self-only). */
async function resolveMyPlayerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teamId: string,
): Promise<string | null> {
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!player) return null;

  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', player.id)
    .maybeSingle();
  return member ? player.id : null;
}

// -----------------------------------------------------------------------------
// updatePlayerActionStatus — the player advances their own assigned action.
// -----------------------------------------------------------------------------

/**
 * Advance the current player's OWN assigned, player-visible action to a
 * player-allowed status. No staff capability required (a player has none); the
 * single invariant is "this is my action and I'm only moving its status forward".
 *
 *   acknowledge -> status:'in_progress'
 *   complete    -> status:'completed' (stamps completed_at; feeds outcome sweep)
 *
 * Returns a typed result so the client can branch without try/catch.
 */
export const updatePlayerActionStatus = withBaseballAction(
  'updatePlayerActionStatus',
  { featureArea: 'baseball-player-actions' },
  async (
    ctx,
    input: { actionId: string; status: PlayerNextStatus },
  ): Promise<PlayerActionResult> => {
    if (!input?.actionId || typeof input.actionId !== 'string') {
      return { success: false, error: 'An assignment is required.' };
    }
    if (input.status !== 'in_progress' && input.status !== 'completed') {
      return { success: false, error: 'That action is not available to you.' };
    }

    const supabase = await createClient();

    const playerId = await resolveMyPlayerId(
      supabase,
      ctx.user.id,
      ctx.targetTeamId,
    );
    if (!playerId) {
      return {
        success: false,
        error: 'You are not on this team as a player.',
      };
    }

    const action = await loadMyAction(
      supabase,
      ctx.targetTeamId,
      playerId,
      input.actionId,
    );
    if (!action) {
      return { success: false, error: 'That assignment is not available to you.' };
    }

    // Type + visibility gates (defense in depth; RLS already enforces the latter).
    if (!PLAYER_ACTION_TYPES.has(action.action_type)) {
      return { success: false, error: 'This assignment is managed by your staff.' };
    }
    if (action.visibility === 'staff_only') {
      return { success: false, error: 'This assignment is not available to you.' };
    }

    // Idempotent: re-acknowledging an already-in-progress action, or re-completing
    // a completed one, is a no-op success (the client may double-fire).
    if (action.status === input.status) {
      return { success: true, status: action.status as BaseballAction['status'] };
    }
    if (action.status === 'completed' || action.status === 'cancelled') {
      // Terminal — never walk it back from the player side.
      return {
        success: true,
        status: action.status as BaseballAction['status'],
      };
    }

    const allowed = PLAYER_STATUS_TRANSITIONS[action.status];
    if (!allowed || !allowed.has(input.status)) {
      return {
        success: false,
        error: 'That assignment cannot move there right now.',
      };
    }

    const now = new Date().toISOString();
    // Status-only patch (+ completed_at on completion). NEVER touches assignment,
    // target, visibility, or owner — a player can only move status forward.
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: now,
    };
    if (input.status === 'completed') patch.completed_at = now;

    // The update filter is PINNED to (id, team, assignee_player_id = me) so even a
    // tampered RLS policy could not let this touch another player's row.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_actions')
      .update(patch)
      .eq('id', input.actionId)
      .eq('team_id', ctx.targetTeamId)
      .eq('assignee_player_id', playerId);

    if (error) {
      return { success: false, error: 'Could not update your assignment.' };
    }

    // Close the loop on the Passport development story: a COMPLETED assignment
    // writes a player-visible timeline moment (assigned -> completed), so the
    // chain source -> signal -> assigned-to-you -> DONE shows on the player's
    // timeline. A player cannot author the staff-readable feed directly (the
    // timeline INSERT policy is coach-only), so this uses the established
    // system-path (service-role) write with honest `system` provenance — the
    // completion was DETECTED from the player's own action update, not authored as
    // free text. It is scoped to player_only and never widened. Best-effort: a
    // failed timeline write is logged inside the writer and never rolls back the
    // status change (the primary mutation already succeeded).
    if (input.status === 'completed') {
      await appendTimelineEvent(
        {
          teamId: ctx.targetTeamId,
          playerId,
          kind: 'system',
          title: `Completed: ${action.title}`,
          body: action.signal_id
            ? 'You finished an assignment from a coaching signal.'
            : 'You finished a coach assignment.',
          visibility: 'player_only',
          source: 'system',
          sourceId: action.signal_id ?? input.actionId,
          createdBy: ctx.user.id,
        },
        { system: true },
      );
    }

    revalidatePlayerActionSurfaces();
    return { success: true, status: input.status };
  },
);

/** Convenience: acknowledge (open/blocked -> in_progress). */
export async function acknowledgePlayerAction(
  actionId: string,
): Promise<PlayerActionResult> {
  return updatePlayerActionStatus({ actionId, status: 'in_progress' });
}

/** Convenience: complete (open/in_progress/blocked -> completed). */
export async function completePlayerAction(
  actionId: string,
): Promise<PlayerActionResult> {
  return updatePlayerActionStatus({ actionId, status: 'completed' });
}
