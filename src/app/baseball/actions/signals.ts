'use server';

// =============================================================================
// src/app/baseball/actions/signals.ts
//
// Packet: signal-inbox — server actions for the Signal Inbox + Action
// Conversion Engine (V10 §Signals + V9 Action Conversion Map).
//
// Every mutation runs inside withBaseballAction({ featureArea, requiredCapability })
// so auth + active-context + SERVER-SIDE capability enforcement + Sentry +
// error logging are uniform, and raw DB errors never reach the client.
//
// LIFECYCLE (V5 §AI Workflow States, narrowed to triage):
//   acknowledge / dismiss / resolve / mark sample-too-small  -> disposition
//   assignOwner                                              -> owner_coach_id
//   recordSignalFeedback                                     -> useful/not_useful/wrong
//   convertSignalToAction                                    -> creates baseball_actions
//                                                               + sets signal -> 'converted'
//                                                               + (player-affecting) timeline
//   updateActionStatus / assignAction / recordActionOutcome  -> action lifecycle
//
// NON-DESTRUCTIVE: only UPDATEs of disposition/status + INSERTs of actions. No
// delete-then-reinsert; conversions append actions and flip the signal forward.
//
// This module OWNS the signals/actions surface. It does NOT import or edit
// insights.ts (engine task) — a signal may CITE an insight via source_refs, but
// the two write paths stay separate.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendTimelineEvent } from '@/lib/baseball/timeline-writer';
import { normalizeConfidence } from '@/lib/baseball/source-record';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import {
  resolveSignalTargetMetric,
  buildActionOutcomeSeed,
} from '@/lib/baseball/coachhelm/action-baseline';
import { materializePracticeBlockFromSignal } from '@/app/baseball/actions/practice';
import type {
  BaseballSignal,
  BaseballSignalDisposition,
  BaseballSignalFeedback,
  BaseballActionType,
  BaseballActionStatus,
  BaseballSignalVisibility,
  BaseballActionInsert,
  BaseballJson,
} from '@/lib/types/baseball-signals';

// -----------------------------------------------------------------------------
// Shared result shape
// -----------------------------------------------------------------------------

export interface SignalActionResult {
  success: boolean;
  /** Inserted/affected ids (e.g. created action ids on a conversion). */
  ids?: string[];
  error?: string;
}

const SIGNALS_PATH = '/baseball/dashboard/signals';
const COMMAND_PATH = '/baseball/dashboard/command-center';

function revalidateSignalSurfaces() {
  revalidatePath(SIGNALS_PATH);
  revalidatePath(COMMAND_PATH);
}

// -----------------------------------------------------------------------------
// Load + ownership-scope a signal to the active team (defense in depth on top
// of RLS — never act on a signal that is not on the caller's team).
// -----------------------------------------------------------------------------

async function loadTeamSignal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  signalId: string,
): Promise<BaseballSignal | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('baseball_signals')
    .select('*')
    .eq('id', signalId)
    .eq('team_id', teamId)
    .maybeSingle();
  return (data as BaseballSignal | null) ?? null;
}

// =============================================================================
// Triage: disposition transitions
// =============================================================================

/**
 * Acknowledge a signal (a coach has seen it). Idempotent: re-acknowledging a
 * 'new' signal stamps acknowledged_at; acknowledging an already-progressed
 * signal is a no-op success.
 */
export const acknowledgeSignal = withBaseballAction(
  'acknowledgeSignal',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (ctx, signalId: string): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const signal = await loadTeamSignal(supabase, ctx.targetTeamId, signalId);
    if (!signal) return { success: false, error: 'Signal not found.' };

    // Only advance an untriaged signal — never walk back a converted/resolved one.
    if (signal.disposition !== 'new') {
      return { success: true, ids: [signalId] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_signals')
      .update({
        disposition: 'acknowledged' satisfies BaseballSignalDisposition,
        acknowledged_by: ctx.user.id,
        acknowledged_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', signalId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not acknowledge the signal.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [signalId] };
  },
);

/**
 * Set a terminal disposition (dismissed / resolved / sample_too_small). A
 * dismissed/resolved signal leaves the open board but stays in history.
 */
export const setSignalDisposition = withBaseballAction(
  'setSignalDisposition',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: {
      signalId: string;
      disposition: Extract<
        BaseballSignalDisposition,
        'dismissed' | 'resolved' | 'sample_too_small' | 'acknowledged'
      >;
    },
  ): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const signal = await loadTeamSignal(supabase, ctx.targetTeamId, input.signalId);
    if (!signal) return { success: false, error: 'Signal not found.' };

    const patch: Record<string, unknown> = {
      disposition: input.disposition,
      updated_at: new Date().toISOString(),
    };
    if (input.disposition === 'resolved') {
      patch.resolved_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_signals')
      .update(patch)
      .eq('id', input.signalId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not update the signal.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.signalId] };
  },
);

/** Assign a triage owner (coach) to a signal. */
export const assignSignalOwner = withBaseballAction(
  'assignSignalOwner',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: { signalId: string; ownerCoachId: string | null },
  ): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const signal = await loadTeamSignal(supabase, ctx.targetTeamId, input.signalId);
    if (!signal) return { success: false, error: 'Signal not found.' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_signals')
      .update({
        owner_coach_id: input.ownerCoachId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.signalId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not assign the signal.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.signalId] };
  },
);

/** Record useful / not_useful / wrong feedback (drives engine learning later). */
export const recordSignalFeedback = withBaseballAction(
  'recordSignalFeedback',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: { signalId: string; feedback: BaseballSignalFeedback },
  ): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const signal = await loadTeamSignal(supabase, ctx.targetTeamId, input.signalId);
    if (!signal) return { success: false, error: 'Signal not found.' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_signals')
      .update({ feedback: input.feedback, updated_at: new Date().toISOString() })
      .eq('id', input.signalId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not record feedback.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.signalId] };
  },
);

// =============================================================================
// Conversion: signal -> action(s)
// =============================================================================

export interface ConvertSignalInput {
  signalId: string;
  /** One conversion may create several actions (e.g. a block + N player tasks). */
  actions: Array<{
    actionType: BaseballActionType;
    title: string;
    detail?: string | null;
    assigneeCoachId?: string | null;
    assigneePlayerId?: string | null;
    ownerCoachId?: string | null;
    dueDate?: string | null;
    /** Override visibility; defaults to the signal's visibility. */
    visibility?: BaseballSignalVisibility;
  }>;
}

/**
 * The capability a given action_type's TARGET subsystem requires to materialize.
 * A coach who can triage signals (can_manage_stats) is not automatically allowed
 * to write into every subsystem — converting into a practice block requires
 * can_manage_practice, a lift modification requires can_manage_lifting, etc. We
 * precheck this BEFORE the subsystem insert so a coach without the capability
 * gets a clean error instead of a silent RLS denial + orphan action.
 */
const ACTION_TARGET_CAPABILITY: Partial<
  Record<BaseballActionType, 'can_manage_practice' | 'can_manage_lifting'>
> = {
  practice_block: 'can_manage_practice',
  lift_modification: 'can_manage_lifting',
};

interface MaterializeResult {
  /** Subsystem table the converted object landed in (stamped on the action). */
  targetTable: string;
  /** Id of the created subsystem object (round-trip link from the action). */
  targetId: string;
}

/**
 * Materialize ONE converted action into its real target subsystem object and
 * return where it landed (target_table + target_id), which the caller stamps
 * back onto the baseball_actions row for round-trip linking. Returns null for
 * action types whose "object" IS the action row itself (player_task,
 * video_request, message, import_review) — those need no separate object.
 *
 * Throws a user-safe Error on a real failure so the conversion surfaces it.
 */
async function materializeActionObject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: { user: { id: string }; targetTeamId: string; activeCoachId: string | null },
  signal: BaseballSignal,
  action: {
    id: string;
    action_type: BaseballActionType;
    title: string;
    detail: string | null;
    assignee_player_id: string | null;
    assignee_coach_id: string | null;
    owner_coach_id: string | null;
    visibility: BaseballSignalVisibility;
    source_refs: BaseballJson;
  },
): Promise<MaterializeResult | null> {
  const teamId = ctx.targetTeamId;

  switch (action.action_type) {
    // -- signal -> practice planner block -------------------------------------
    case 'practice_block': {
      const res = await materializePracticeBlockFromSignal(supabase, {
        teamId,
        title: action.title,
        detail: action.detail,
        sourceReason: signal.why_it_matters ?? action.detail ?? null,
        sourceSignalId: signal.id,
        coachOwnerId: action.owner_coach_id ?? ctx.activeCoachId,
      });
      if (!res.ok) throw new Error(res.error);
      return { targetTable: 'baseball_practice_blocks', targetId: res.blockId };
    }

    // -- signal -> Decision Room agenda item ----------------------------------
    case 'meeting_item': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('baseball_meeting_items')
        .insert({
          team_id: teamId,
          source_signal_id: signal.id,
          source_action_id: action.id,
          player_id: action.assignee_player_id ?? signal.player_id,
          title: action.title,
          detail: action.detail,
          source_refs: action.source_refs,
          owner_coach_id: action.owner_coach_id ?? ctx.activeCoachId,
          status: 'open',
          created_by: ctx.user.id,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('Could not add the Decision Room item.');
      return { targetTable: 'baseball_meeting_items', targetId: (data as { id: string }).id };
    }

    // -- signal -> coach note on the player -----------------------------------
    case 'player_note': {
      const playerId = action.assignee_player_id ?? signal.player_id;
      if (!playerId) {
        throw new Error('A player is required to create a player note.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('baseball_coach_player_notes')
        .insert({
          team_id: teamId,
          player_id: playerId,
          source_signal_id: signal.id,
          source_action_id: action.id,
          title: action.title,
          body: action.detail || action.title,
          source_refs: action.source_refs,
          visibility: action.visibility,
          author_coach_id: action.owner_coach_id ?? ctx.activeCoachId,
          created_by: ctx.user.id,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('Could not write the player note.');
      return { targetTable: 'baseball_coach_player_notes', targetId: (data as { id: string }).id };
    }

    // -- signal -> lifting plan assignment ------------------------------------
    case 'lift_modification': {
      const playerId = action.assignee_player_id ?? signal.player_id;
      if (!playerId) {
        throw new Error('A player is required for a lift modification.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('baseball_lift_assignments')
        .insert({
          team_id: teamId,
          player_id: playerId,
          assigned_by_coach_id: action.owner_coach_id ?? ctx.activeCoachId,
          title: action.title,
          due_date: null,
          status: 'assigned',
          source_signal_id: signal.id,
          source_reason: signal.why_it_matters ?? action.detail ?? null,
        })
        .select('id')
        .single();
      if (error || !data) throw new Error('Could not write the lift modification.');

      // UNIFIED STORAGE BRIDGE (parity with lifting.ts createLiftAssignment).
      //
      // The legacy baseball_lift_assignments row above is read ONLY by the coach
      // Lifting-Lite board — NO player surface reads it. Every player surface
      // (player-today.ts Lifts-Due feed, player-lift.ts getPlayerLiftHome,
      // PlayerLiftToday.tsx) and the CoachHelm engine read baseball_lift_sessions.
      // Without this bridge a coach-converted lift modification reaches the coach's
      // board but NEVER the player — the coach->player half of the round-trip is
      // dead. So we ALSO materialize a single-player session (status 'modified', so
      // it lands in the player's read filter ['assigned','started','modified'] AND
      // reads as a coach-initiated change, not a fresh assignment), carrying the
      // signal's reason into coach_note so the player sees WHY their lift changed.
      //
      // Best-effort + non-destructive (stage-and-check dedupe, never delete-then-
      // reinsert): a bridge failure must NOT roll back the assignment the coach
      // just converted, so it is swallowed and the coach's board still reflects it.
      try {
        const scheduledDate = new Date().toISOString().slice(0, 10);
        const sessionTitle = action.title || 'Lift modification';
        const coachNote = signal.why_it_matters ?? action.detail ?? null;

        // Dedupe on (player, date, title) for sessions NOT born of a V11 program
        // (program_assignment_id NULL) so a retried/double conversion does not
        // create two Today rows — same guard createLiftAssignment uses.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: dupe } = await (supabase as any)
          .from('baseball_lift_sessions')
          .select('id')
          .eq('player_id', playerId)
          .eq('team_id', teamId)
          .eq('scheduled_date', scheduledDate)
          .eq('title', sessionTitle)
          .is('program_assignment_id', null)
          .maybeSingle();

        let sessionId = (dupe as { id: string } | null)?.id;
        if (!sessionId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: session } = await (supabase as any)
            .from('baseball_lift_sessions')
            .insert({
              team_id: teamId,
              player_id: playerId,
              title: sessionTitle,
              scheduled_date: scheduledDate,
              status: 'modified',
              coach_note: coachNote,
              program_assignment_id: null,
            })
            .select('id')
            .maybeSingle();
          sessionId = (session as { id: string } | null)?.id;
        } else if (coachNote) {
          // Existing dedup'd session — refresh its coach_note/status so a
          // re-conversion still surfaces the latest "why" to the player. Plain
          // UPDATE (no destructive write); status is bumped to 'modified' so the
          // player sees it as a fresh coach change in their Lifts-Due feed.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('baseball_lift_sessions')
            .update({ coach_note: coachNote, status: 'modified', updated_at: new Date().toISOString() })
            .eq('id', sessionId)
            .eq('team_id', teamId);
        }

        if (sessionId) {
          // Seed a single snapshot exercise once (idempotent re-convert safe) so
          // the player's Lift surface has a row to render + log against, mirroring
          // createLiftAssignment. No exercise_id (a signal modification has no V11
          // library exercise) — name-only snapshot is honest: the work is named,
          // it just has no progression identity to PR against.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: existingSe } = await (supabase as any)
            .from('baseball_lift_session_exercises')
            .select('id')
            .eq('session_id', sessionId)
            .limit(1);
          if (!existingSe || existingSe.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any).from('baseball_lift_session_exercises').insert({
              session_id: sessionId,
              exercise_id: null,
              exercise_name_snapshot: sessionTitle,
              order_index: 0,
              status: 'assigned',
            });
          }
        }
      } catch {
        // Bridge is best-effort; the assignment already committed. Silent by
        // design so the coach's conversion never appears to fail mid-flow.
      }

      return { targetTable: 'baseball_lift_assignments', targetId: (data as { id: string }).id };
    }

    // -- action-IS-the-object types (no separate subsystem row) ---------------
    // player_task / video_request / message / import_review live as the
    // baseball_actions row itself + (for player-visible) a timeline entry.
    default:
      return null;
  }
}

/**
 * Convert a signal into one or more assignable, reviewable actions. The actions
 * carry the signal's source_refs + confidence forward (so an action is itself
 * source-backed), the signal flips to disposition 'converted', and any
 * player-affecting, player-visible action writes a player timeline event
 * (source -> signal -> action -> timeline). Non-destructive: appends actions;
 * never deletes/re-inserts.
 *
 * CROSS-SUBSYSTEM (V9 Action Conversion Map / V10 "Staff action queue replaces
 * vague meeting output"): a conversion does NOT stop at the ledger — it
 * MATERIALIZES the real target object (practice block / Decision Room agenda
 * item / coach player note / lift assignment) and stamps target_table+target_id
 * back on the action so each subsystem surfaces "created from signal X".
 */
export const convertSignalToAction = withBaseballAction(
  'convertSignalToAction',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (ctx, input: ConvertSignalInput): Promise<SignalActionResult> => {
    if (!input.actions || input.actions.length === 0) {
      return { success: false, error: 'At least one action is required.' };
    }

    const supabase = await createClient();
    const signal = await loadTeamSignal(supabase, ctx.targetTeamId, input.signalId);
    if (!signal) return { success: false, error: 'Signal not found.' };

    // IDEMPOTENCY GUARD (V5 §AI Workflow States — terminal state is sticky).
    // A double-click (or a retried request) must not fan out a second set of
    // ledger rows + materialized subsystem objects. Mirroring acknowledgeSignal's
    // up-front disposition guard, a signal already in the terminal 'converted'
    // state is a no-op success — its actions already exist. We return no ids so
    // the caller treats it as "nothing new created" rather than re-rendering a
    // fresh conversion. (acknowledge/dismiss/resolve are NOT terminal-for-convert:
    // a coach can still convert an acknowledged signal; only 'converted' blocks.)
    if (signal.disposition === 'converted') {
      return { success: true, ids: [], error: 'This signal is already converted.' };
    }

    // Per-action capability precheck on the TARGET subsystem. A signal-triage
    // coach (can_manage_stats) is not automatically allowed to write into
    // practice / lifting. Fail BEFORE inserting any ledger row so a denied
    // conversion never leaves an orphan action behind.
    const neededCaps = new Set<'can_manage_practice' | 'can_manage_lifting'>();
    for (const a of input.actions) {
      const cap = ACTION_TARGET_CAPABILITY[a.actionType];
      if (cap) neededCaps.add(cap);
    }
    for (const cap of neededCaps) {
      const ok = await hasBaseballCapability(ctx.targetTeamId, cap);
      if (!ok) {
        return {
          success: false,
          error:
            cap === 'can_manage_practice'
              ? 'You do not have permission to create practice blocks.'
              : 'You do not have permission to modify lifting plans.',
        };
      }
    }

    const now = new Date().toISOString();
    const confidence = normalizeConfidence(signal.confidence);

    // -------------------------------------------------------------------------
    // SEED THE OUTCOME LEDGER (parity with convertInsightToAction).
    //
    // The signal-native path is the canonical Signal Inbox → Action mechanic, so
    // it MUST seed the same source → signal → action → did-it-move ledger the
    // insight path does — otherwise a signal-born action is born without a
    // baseline and can never be measured by the outcome sweep. We resolve the
    // signal's canonical target metric ONCE (cited insight's primary driver, or
    // the generator fallback), then capture each row's subject player's CURRENT
    // value as the baseline. Per-row because one conversion can fan out to
    // several players (e.g. a block + N player tasks), each with its own
    // baseline. The shared helper is byte-identical to the insight path.
    // -------------------------------------------------------------------------
    const targetMetric = await resolveSignalTargetMetric(supabase, ctx.targetTeamId, {
      signal_type: signal.signal_type,
      source_refs: signal.source_refs,
    });

    const rows: BaseballActionInsert[] = await Promise.all(
      input.actions.map(async (a) => {
        const subjectPlayer = a.assigneePlayerId ?? signal.player_id;
        const outcomeSeed = await buildActionOutcomeSeed(
          supabase,
          ctx.targetTeamId,
          subjectPlayer,
          targetMetric,
        );
        return {
          team_id: ctx.targetTeamId,
          signal_id: signal.id,
          player_id: subjectPlayer,
          event_id: signal.event_id,
          action_type: a.actionType,
          title: a.title.trim(),
          detail: a.detail?.trim() || null,
          owner_coach_id: a.ownerCoachId ?? ctx.activeCoachId,
          assignee_coach_id: a.assigneeCoachId ?? null,
          assignee_player_id: a.assigneePlayerId ?? null,
          due_date: a.dueDate ?? null,
          status: 'open' satisfies BaseballActionStatus,
          // Carry the signal's provenance onto the action so it stays source-backed.
          source_refs: signal.source_refs as BaseballJson,
          confidence,
          visibility: a.visibility ?? signal.visibility,
          // Outcome ledger (V10, migration 20260624000210) — shared seed so the
          // sweep can measure signal-born actions just like insight-born ones.
          outcome_metric: outcomeSeed.outcome_metric,
          outcome_baseline_value: outcomeSeed.outcome_baseline_value,
          outcome_verdict: outcomeSeed.outcome_verdict,
          created_by: ctx.user.id,
        };
      }),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insErr } = await (supabase as any)
      .from('baseball_actions')
      .insert(rows)
      .select(
        'id, action_type, assignee_player_id, assignee_coach_id, owner_coach_id, visibility, title, detail, source_refs',
      );

    if (insErr || !inserted) {
      return { success: false, error: 'Could not create the action.' };
    }

    // -------------------------------------------------------------------------
    // MATERIALIZE: turn each ledger action into its real target-subsystem object
    // (the cross-subsystem wiring that is the whole point of the mechanic) and
    // stamp target_table + target_id back on the action for round-trip linking.
    // A materialization failure is a HARD failure for that action type (the
    // coach picked "practice block" expecting a block) — surface it; the ledger
    // rows already exist + are valid, so we never roll back, but we report the
    // first failure so nothing silently no-ops.
    // -------------------------------------------------------------------------
    type MaterializeRow = {
      id: string;
      action_type: BaseballActionType;
      title: string;
      detail: string | null;
      assignee_player_id: string | null;
      assignee_coach_id: string | null;
      owner_coach_id: string | null;
      visibility: BaseballSignalVisibility;
      source_refs: BaseballJson;
    };
    let materializeError: string | null = null;
    for (const a of inserted as MaterializeRow[]) {
      try {
        const target = await materializeActionObject(
          supabase,
          { user: ctx.user, targetTeamId: ctx.targetTeamId, activeCoachId: ctx.activeCoachId },
          signal,
          a,
        );
        if (target) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('baseball_actions')
            .update({
              target_table: target.targetTable,
              target_id: target.targetId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', a.id)
            .eq('team_id', ctx.targetTeamId);
        }
      } catch (err) {
        materializeError =
          materializeError ?? (err instanceof Error ? err.message : 'Could not create the action object.');
      }
    }

    // Flip the signal forward to 'converted' (stays visible, links to actions).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: sigErr } = await (supabase as any)
      .from('baseball_signals')
      .update({
        disposition: 'converted' satisfies BaseballSignalDisposition,
        updated_at: now,
      })
      .eq('id', signal.id)
      .eq('team_id', ctx.targetTeamId);

    if (sigErr) {
      // The actions were created; surface a soft error but keep the ids so the
      // UI can refresh. (No rollback — actions are valid, signal-state is a
      // secondary write.)
      return {
        success: true,
        ids: (inserted as Array<{ id: string }>).map((r) => r.id),
        error: 'Actions created, but the signal status could not be updated.',
      };
    }

    // Player timeline: only for player-affecting, player-visible actions. A
    // staff_only action (e.g. a meeting item) never writes a player timeline
    // entry. Timeline writes are best-effort side-effects (never roll back).
    //
    // The headline is action-aware so the Passport development story shows the
    // full chain source -> signal -> ASSIGNED-TO-YOU: a player_task reads as
    // "Coach assigned you: <title>" (an obligation the player owns), while other
    // player-affecting actions keep the neutral "created from signal" framing.
    // The body always cites the originating signal (the source -> signal edge),
    // and source_id pins the timeline moment to that signal id.
    const PLAYER_ASSIGNMENT_TYPES: ReadonlySet<BaseballActionType> = new Set([
      'player_task',
      'video_request',
      'message',
    ]);
    for (const a of inserted as Array<{
      assignee_player_id: string | null;
      visibility: BaseballSignalVisibility;
      action_type: BaseballActionType;
      title: string;
    }>) {
      const subjectPlayer = a.assignee_player_id ?? signal.player_id;
      // Only an action ACTUALLY assigned to the player is "assigned to you"; a
      // player-visible note about them that has no player assignee keeps neutral
      // framing.
      const isAssignedToPlayer =
        a.assignee_player_id != null && PLAYER_ASSIGNMENT_TYPES.has(a.action_type);
      if (subjectPlayer && a.visibility !== 'staff_only') {
        await appendTimelineEvent({
          teamId: ctx.targetTeamId,
          playerId: subjectPlayer,
          kind: 'system',
          title: isAssignedToPlayer ? `Coach assigned you: ${a.title}` : a.title,
          body: `From a coaching signal: ${signal.title}`,
          visibility: a.visibility === 'team' ? 'team' : 'player_only',
          source: 'system',
          sourceId: signal.id,
          createdBy: ctx.user.id,
        });
      }
    }

    revalidateSignalSurfaces();
    revalidatePath('/baseball/player'); // Player Today picks up assigned tasks
    // Refresh the subsystem surfaces a conversion may have written into so the
    // materialized object shows up immediately.
    revalidatePath('/baseball/dashboard/practice');
    revalidatePath('/baseball/dashboard/decision-room');
    revalidatePath('/baseball/dashboard/performance');
    return {
      success: true,
      ids: (inserted as Array<{ id: string }>).map((r) => r.id),
      // If a target object failed to materialize, the action ledger row still
      // exists but the coach should know the subsystem object was not created.
      ...(materializeError ? { error: materializeError } : {}),
    };
  },
);

// =============================================================================
// Action lifecycle
// =============================================================================

/** Advance an action's status (staff). */
export const updateActionStatus = withBaseballAction(
  'updateActionStatus',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: { actionId: string; status: BaseballActionStatus },
  ): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const patch: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date().toISOString(),
    };
    if (input.status === 'completed') patch.completed_at = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_actions')
      .update(patch)
      .eq('id', input.actionId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not update the action.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.actionId] };
  },
);

/** Reassign an action (coach and/or player). */
export const assignAction = withBaseballAction(
  'assignAction',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: {
      actionId: string;
      assigneeCoachId?: string | null;
      assigneePlayerId?: string | null;
      dueDate?: string | null;
    },
  ): Promise<SignalActionResult> => {
    const supabase = await createClient();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.assigneeCoachId !== undefined) patch.assignee_coach_id = input.assigneeCoachId;
    if (input.assigneePlayerId !== undefined) patch.assignee_player_id = input.assigneePlayerId;
    if (input.dueDate !== undefined) patch.due_date = input.dueDate;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_actions')
      .update(patch)
      .eq('id', input.actionId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not reassign the action.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.actionId] };
  },
);

/**
 * Record a Decision Room outcome on an action (V10 §Staff Decision Room
 * "Mark outcomes"). Marks it reviewed by the current coach.
 */
export const recordActionOutcome = withBaseballAction(
  'recordActionOutcome',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input: { actionId: string; outcome: string },
  ): Promise<SignalActionResult> => {
    if (!input.outcome.trim()) {
      return { success: false, error: 'An outcome note is required.' };
    }
    const supabase = await createClient();
    const now = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_actions')
      .update({
        outcome: input.outcome.trim(),
        outcome_recorded_at: now,
        reviewed_by: ctx.user.id,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('id', input.actionId)
      .eq('team_id', ctx.targetTeamId);

    if (error) return { success: false, error: 'Could not record the outcome.' };
    revalidateSignalSurfaces();
    return { success: true, ids: [input.actionId] };
  },
);
