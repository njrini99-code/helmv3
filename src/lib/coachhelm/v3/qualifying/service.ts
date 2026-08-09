/**
 * v3 Qualifying-workspace service (W29).
 *
 * Centralizes the mutations the selection workspace makes: state
 * transitions, coach-pick set/clear, and final confirmSelection commit.
 *
 * The service trusts its Supabase client — auth + team-coach guards
 * happen in the server-action wrapper. RLS at the DB enforces the
 * team boundary regardless.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import {
  canTransition,
  canConfirmSelection,
} from './state-machine';
import { loadQualifyingWorkspace } from './loader';
import type { QualifierSelectionState } from './types';
import { composeTravelBrief } from './travel-brief';
import { pushTravelBriefToChat } from './chat-push';
import { notifyPlayersOfSelectionOutcome } from './player-notify';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

type Sb = SupabaseClient<Database>;

export type ServiceResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Move the qualifier's selection_state forward by exactly one step.
 * Rejects skip/reverse transitions.
 */
export async function transitionSelectionState(
  supabase: Sb,
  qualifier_id: string,
  target: QualifierSelectionState,
): Promise<ServiceResult> {
  const { data: cur, error: readErr } = await supabase
    .from('golf_qualifiers')
    .select('selection_state')
    .eq('id', qualifier_id)
    .maybeSingle();
  if (readErr || !cur) return { ok: false, error: 'qualifier not found' };

  if (!canTransition(cur.selection_state as QualifierSelectionState, target)) {
    return { ok: false, error: `illegal transition ${cur.selection_state} → ${target}` };
  }

  const { error: writeErr } = await supabase
    .from('golf_qualifiers')
    .update({ selection_state: target })
    .eq('id', qualifier_id);
  if (writeErr) return { ok: false, error: writeErr.message };

  return { ok: true, data: undefined };
}

/**
 * Upsert a coach-pick selection. reasoning is required (UI enforces but
 * we double-check). Replaces any existing pick for the player.
 *
 * Allowed only when selection_state IN ('closed','selected'). The
 * 'selected' case lets a coach amend a pick post-commit (rare, audited).
 */
export async function setCoachPick(
  supabase: Sb,
  args: {
    qualifier_id: string;
    player_id: string;
    reasoning: string;
    user_id: string;
  },
): Promise<ServiceResult> {
  const reasoning = args.reasoning.trim();
  if (reasoning.length === 0) {
    return { ok: false, error: 'reasoning required for coach-pick' };
  }

  const { data: q } = await supabase
    .from('golf_qualifiers')
    .select('selection_state, selection_slots_coach_pick')
    .eq('id', args.qualifier_id)
    .maybeSingle();
  if (!q) return { ok: false, error: 'qualifier not found' };
  if (!['closed', 'selected'].includes(q.selection_state)) {
    return { ok: false, error: `coach picks locked in state ${q.selection_state}` };
  }

  // Enforce the slot ceiling before inserting another coach_pick.
  const { data: existing, error: existingError } = await supabase
    .from('golf_qualifier_selections')
    .select('player_id')
    .eq('qualifier_id', args.qualifier_id)
    .eq('selection_type', 'coach_pick');

  // The `error` is READ, and this guard fails CLOSED. Discarded, a failed read
  // produced a null list, so `already` was false and the count read 0 — the
  // ceiling check then passed unconditionally and the upsert below added a
  // coach pick beyond the configured slots. The comment above says this exists
  // to "enforce the slot ceiling"; a ceiling that a dropped connection lifts is
  // not one.
  //
  // An empty list from a SUCCESSFUL read still means no picks yet, and still
  // allows the first one.
  if (existingError) {
    return { ok: false, error: 'could not verify remaining coach-pick slots; please try again' };
  }

  const already = (existing ?? []).some((s) => s.player_id === args.player_id);
  if (!already && (existing?.length ?? 0) >= q.selection_slots_coach_pick) {
    return { ok: false, error: `all ${q.selection_slots_coach_pick} coach-pick slots filled` };
  }

  const { error } = await supabase.from('golf_qualifier_selections').upsert(
    {
      qualifier_id: args.qualifier_id,
      player_id: args.player_id,
      selection_type: 'coach_pick',
      coach_reasoning: reasoning,
      selected_by_user_id: args.user_id,
      selected_at: new Date().toISOString(),
    },
    { onConflict: 'qualifier_id,player_id' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/**
 * Remove a coach-pick. Only works on coach_pick rows; top_score rows
 * are auto-managed by confirmSelection and never deleted via this path.
 */
export async function removeCoachPick(
  supabase: Sb,
  qualifier_id: string,
  player_id: string,
): Promise<ServiceResult> {
  const { error } = await supabase
    .from('golf_qualifier_selections')
    .delete()
    .eq('qualifier_id', qualifier_id)
    .eq('player_id', player_id)
    .eq('selection_type', 'coach_pick');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

/**
 * Finalize the selection: insert top_score rows for the auto-locked
 * top-N players + flip state to 'selected'. Coach-pick rows are
 * expected to already exist (gated by canConfirmSelection).
 *
 * After commit, pushes a travel brief into the primary coach's chat (W32).
 */
export async function confirmSelection(
  supabase: Sb,
  args: { qualifier_id: string; user_id: string },
): Promise<ServiceResult> {
  const workspace = await loadQualifyingWorkspace(supabase, args.qualifier_id);
  if (!workspace) return { ok: false, error: 'workspace not loadable' };

  const coachPickSelections = workspace.candidates
    .map((c) => c.selection)
    .filter((s): s is NonNullable<typeof s> => s !== null && s.selection_type === 'coach_pick');

  if (
    !canConfirmSelection({
      state: workspace.selection_state,
      slots_coach_pick: workspace.selection_slots_coach_pick,
      coach_pick_selections: coachPickSelections.map((s) => ({ reasoning: s.coach_reasoning })),
    })
  ) {
    return {
      ok: false,
      error: 'cannot confirm: state must be closed, all coach picks chosen with reasoning',
    };
  }

  const top_n =
    workspace.selection_slots_total - workspace.selection_slots_coach_pick;
  const topScoreRows = workspace.candidates
    .filter((c) => c.is_top_score_slot && c.leaderboard_rank !== null && c.leaderboard_rank <= top_n)
    .map((c) => ({
      qualifier_id: workspace.qualifier_id,
      player_id: c.player_id,
      selection_type: 'top_score' as const,
      coach_reasoning: null,
      selected_by_user_id: args.user_id,
      selected_at: new Date().toISOString(),
    }));

  if (topScoreRows.length > 0) {
    const { error: insErr } = await supabase
      .from('golf_qualifier_selections')
      .upsert(topScoreRows, { onConflict: 'qualifier_id,player_id' });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { error: stateErr } = await supabase
    .from('golf_qualifiers')
    .update({ selection_state: 'selected' })
    .eq('id', args.qualifier_id);
  if (stateErr) return { ok: false, error: stateErr.message };

  // W32: push travel brief to coach chat (best-effort — never blocks selection).
  try {
    const brief = composeTravelBrief(workspace);
    const { data: staff } = await supabase
      .from('golf_team_coach_staff')
      .select('coach_id')
      .eq('team_id', workspace.team_id)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle();
    if (staff) {
      await pushTravelBriefToChat(supabase, staff.coach_id, brief);
    }
  } catch (err) {
    await logServerError(
      `travel-brief push failed for qualifier ${args.qualifier_id}: ${describeError(err)}`,
      { action: 'v3.qualifying.confirmSelection.travelBrief' },
    );
  }

  // Players never learned the outcome before this — only the coach's own
  // chat got the travel brief. Best-effort, same reasoning as above: never
  // let a notify failure undo a selection that already committed.
  try {
    await notifyPlayersOfSelectionOutcome(supabase, workspace);
  } catch (err) {
    await logServerError(
      `player selection-outcome notify failed for qualifier ${args.qualifier_id}: ${describeError(err)}`,
      { action: 'v3.qualifying.confirmSelection.notifyPlayers' },
    );
  }

  return { ok: true, data: undefined };
}
