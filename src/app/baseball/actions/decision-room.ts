'use server';

// =============================================================================
// src/app/baseball/actions/decision-room.ts
//
// Wave 11 / packet: decision-room
//
// Backend for the Staff Decision Room + Staff Settings UIs.
//
// Write mutations are fully wired to `baseball_meeting_items` (agenda CRUD) and
// `baseball_decision_log` (append-only ledger). All writes are scoped to
// ctx.targetTeamId — the server-resolved active team — and never trust a
// client-supplied teamId.
//
// SECURITY MODEL: every mutation runs through
//   withBaseballAction({ requiredCapability: 'can_manage_settings' })
// so auth + active-team context is resolved server-side before the body runs.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { getActiveBaseballContext } from '@/lib/baseball/active-context';
import { resolveBaseballCapabilities, hasBaseballCapability } from '@/lib/baseball/capabilities';
import { convertSignalToAction } from '@/app/baseball/actions/signals';
import { loadAgendaItems, loadDecisionLedger } from '@/lib/baseball/read-models/decision-room/agenda-ledger';
import { loadInsights } from '@/lib/baseball/read-models/decision-room/insights';
import { loadEffectivenessReviews } from '@/lib/baseball/read-models/decision-room/effectiveness';
import { loadPlayerFocus, loadImportIssues } from '@/lib/baseball/read-models/decision-room/focus-imports';
import { loadGameResults } from '@/lib/baseball/read-models/decision-room/games';
import { loadAvailabilityConcerns, loadAttendanceSummary } from '@/lib/baseball/read-models/decision-room/readiness';
import { loadLiftSummary } from '@/lib/baseball/read-models/decision-room/lift';
import { loadOpenTasks, loadConflicts } from '@/lib/baseball/read-models/decision-room/tasks-conflicts';
import { loadStaffSettings } from '@/lib/baseball/read-models/decision-room/staff-settings';
import {
  getBaseballMetricLabel,
  getBaseballMetricUnit,
  isBaseballMetricId,
} from '@/lib/coachhelm/baseball/metrics/registry';

// -----------------------------------------------------------------------------
// Loose Supabase client type — baseball_meeting_items and baseball_decision_log
// are defined in unapplied migrations (shared prod DB). RLS still applies via
// the authenticated client; this only loosens TS typing to allow .from() calls
// on tables not yet in the generated DB types.
// -----------------------------------------------------------------------------
type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const DECISION_ROOM_PATH = '/baseball/dashboard/decision-room';

// =============================================================================
// DECISION ROOM — TYPES (canonical: @/lib/baseball/decision-room/types)
// =============================================================================

import type {
  DecisionRoomActionOutcome,
  DecisionRoomAvailabilityConcern,
  DecisionRoomAttendanceSummary,
  DecisionRoomData,
  DecisionRoomMutationResult,
  StaffSettingsData,
} from '@/lib/baseball/decision-room/types';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

export type {
  DecisionRoomSourceRef,
  DecisionRoomSeverity,
  DecisionRoomAgendaItem,
  DecisionRoomInsight,
  DecisionRoomSummaryPlayer,
  DecisionRoomLedgerEntry,
  DecisionRoomPlayerFocus,
  DecisionRoomImportIssue,
  DecisionRoomEffectivenessReview,
  DecisionRoomActionOutcome,
  DecisionRoomGameResult,
  DecisionRoomAvailabilityConcern,
  DecisionRoomAttendanceSummary,
  DecisionRoomLiftSummary,
  DecisionRoomOpenTask,
  DecisionRoomConflict,
  DecisionRoomData,
  DecisionRoomMutationResult,
  StaffMemberView,
  StaffInvitationView,
  StaffSettingsData,
} from '@/lib/baseball/decision-room/types';

// =============================================================================
// DECISION ROOM — READ
// =============================================================================

// -----------------------------------------------------------------------------
// loadActionOutcomes — read model for "did-it-move" action outcome rows.
//
// Queries baseball_actions with outcome_metric set, joins baseball_players for
// playerName, and maps metric ids to display labels/units via the registry.
// An action is `measured` when outcome_observed_value is non-null.
// -----------------------------------------------------------------------------

interface ActionOutcomeRow {
  id: string;
  title: string | null;
  player_id: string | null;
  outcome_metric: string | null;
  outcome_baseline_value: number | null;
  outcome_observed_value: number | null;
  outcome_sample_n: number | null;
  outcome_verdict: string | null;
  baseball_players: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

async function loadActionOutcomes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { from: (table: string) => any },
  teamId: string,
): Promise<DecisionRoomActionOutcome[]> {
  const { data, error } = await supabase
    .from('baseball_actions')
    .select(
      `id, title, player_id,
       outcome_metric, outcome_baseline_value, outcome_observed_value,
       outcome_sample_n, outcome_verdict,
       baseball_players:player_id ( first_name, last_name )`,
    )
    .eq('team_id', teamId)
    .not('outcome_metric', 'is', null)
    .in('status', ['open', 'in_progress', 'completed'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return [];

  return ((data ?? []) as unknown as ActionOutcomeRow[]).map((row) => {
    const metric = row.outcome_metric ?? '';
    const metricLabel = isBaseballMetricId(metric)
      ? getBaseballMetricLabel(metric)
      : metric || null;
    const unit = isBaseballMetricId(metric)
      ? getBaseballMetricUnit(metric)
      : null;
    const player = row.baseball_players;
    const nameParts = [player?.first_name, player?.last_name].filter(
      (p): p is string => Boolean(p && p.trim()),
    );
    const playerName = nameParts.length > 0 ? nameParts.join(' ') : null;
    return {
      id: row.id,
      title: row.title ?? metric,
      playerName,
      metricLabel,
      unit,
      baselineValue: row.outcome_baseline_value ?? null,
      observedValue: row.outcome_observed_value ?? null,
      sampleN: row.outcome_sample_n ?? null,
      measured: row.outcome_observed_value != null,
      verdict: (row.outcome_verdict ?? null) as BaseballActionOutcomeVerdict | null,
    };
  });
}

/**
 * Resolve the Staff Decision Room read model for the viewer's active team.
 *
 * Gated via withBaseballAction(requiredCapability:'can_manage_settings').
 * Fans out to all read models in parallel via Promise.all, then assembles
 * the DecisionRoomData shape. All reads are scoped to the server-resolved
 * active teamId — the client never supplies the team.
 *
 * Readiness / availability data is gated on can_view_readiness so a staff
 * member who holds can_manage_settings but NOT can_view_readiness receives
 * honest empty arrays for those sections (mirrors the performance/live pages).
 */
export async function getDecisionRoomData(): Promise<DecisionRoomData> {
  const inner = withBaseballAction(
    'getDecisionRoomData',
    {
      featureArea: 'baseball-decision-room',
      requiredCapability: 'can_manage_settings',
    },
    async (ctx): Promise<DecisionRoomData> => {
      const supabase = await createClient();
      const teamId = ctx.targetTeamId;

      // Resolve the caller's full capability map so we can conditionally gate
      // readiness/availability data (can_view_readiness) independently of the
      // can_manage_settings gate that admitted this caller.
      const caps = await resolveBaseballCapabilities(teamId);
      const canViewReadiness = caps.can_view_readiness || caps.is_head_coach;

      // Honest empty values returned when the caller lacks can_view_readiness.
      const EMPTY_AVAILABILITY: DecisionRoomAvailabilityConcern[] = [];
      const EMPTY_ATTENDANCE: DecisionRoomAttendanceSummary = {
        totalPractices: 0,
        totalAttended: 0,
        totalMissed: 0,
        concernedPlayers: [],
      };

      const [
        agenda,
        ledger,
        insights,
        effectivenessReviews,
        playersToDiscuss,
        importIssues,
        recentGameResults,
        availabilityConcerns,
        attendanceSummary,
        liftSummary,
        openTasks,
        conflicts,
        staffSettingsData,
        actionOutcomes,
      ] = await Promise.all([
        loadAgendaItems(supabase, teamId),
        loadDecisionLedger(supabase, teamId),
        loadInsights(supabase, teamId),
        loadEffectivenessReviews(supabase, teamId),
        loadPlayerFocus(supabase, teamId),
        loadImportIssues(supabase, teamId),
        loadGameResults(supabase, teamId),
        canViewReadiness
          ? loadAvailabilityConcerns(supabase, teamId)
          : Promise.resolve(EMPTY_AVAILABILITY),
        canViewReadiness
          ? loadAttendanceSummary(supabase, teamId)
          : Promise.resolve(EMPTY_ATTENDANCE),
        loadLiftSummary(supabase, teamId),
        loadOpenTasks(supabase, teamId),
        loadConflicts(supabase, teamId),
        loadStaffSettings(supabase, teamId),
        loadActionOutcomes(supabase, teamId),
      ]);

      const openAgendaCount = agenda.filter(
        (item) => item.status === 'open',
      ).length;
      const openInsightCount = insights.filter(
        (i) => i.status !== 'resolved' && i.status !== 'dismissed',
      ).length;

      const staffCount = staffSettingsData.staff.filter(
        (s) => s.status !== 'removed',
      ).length;

      const outcomeMovedCount = actionOutcomes.filter(
        (o) => o.verdict === 'improved',
      ).length;

      return {
        agenda,
        insights,
        ledger,
        playersToDiscuss,
        importIssues,
        effectivenessReviews,
        actionOutcomes,
        recentGameResults,
        availabilityConcerns,
        attendanceSummary,
        liftSummary,
        openTasks,
        conflicts,
        staffCount,
        decisionCount: ledger.length,
        openAgendaCount,
        openInsightCount,
        outcomeMovedCount,
      };
    },
  );

  return inner();
}

// =============================================================================
// DECISION ROOM — WRITES (real DB implementations)
//
// All five mutations:
//   - run inside withBaseballAction({ requiredCapability: 'can_manage_settings' })
//   - scope every write to ctx.targetTeamId (server-resolved, never from client)
//   - call revalidatePath(DECISION_ROOM_PATH) after a successful write
// =============================================================================

/**
 * Mark a meeting agenda item as discussed.
 * Updates baseball_meeting_items.status -> 'discussed' and records discussed_at
 * / discussed_by. Also appends a 'discussed' entry to baseball_decision_log.
 */
export const markMeetingItemDiscussed = withBaseballAction(
  'markMeetingItemDiscussed',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (ctx, itemId: string): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({
        status: 'discussed',
        discussed_at: new Date().toISOString(),
        discussed_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const { error: logErr } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'discussed',
      title: 'Item marked as discussed',
      subject_table: 'baseball_meeting_items',
      subject_id: itemId,
      decided_by: ctx.user.id,
    });

    if (logErr) {
      return { success: false, error: logErr.message };
    }

    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * Reopen a previously-discussed or resolved meeting item.
 * Resets baseball_meeting_items.status -> 'open' and appends a 'reopened' ledger entry.
 */
export const reopenMeetingItem = withBaseballAction(
  'reopenMeetingItem',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (ctx, itemId: string): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({
        status: 'open',
        discussed_at: null,
        discussed_by: null,
        resolution: null,
        resolved_at: null,
        resolved_by: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', itemId)
      .eq('team_id', ctx.targetTeamId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const { error: logErr } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'reopened',
      title: 'Item reopened for discussion',
      subject_table: 'baseball_meeting_items',
      subject_id: itemId,
      decided_by: ctx.user.id,
    });

    if (logErr) {
      return { success: false, error: logErr.message };
    }

    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * Resolve a meeting item with a resolution note.
 * Updates baseball_meeting_items to status='resolved' with the resolution text,
 * then appends a 'resolved' ledger entry.
 */
export const resolveMeetingItem = withBaseballAction(
  'resolveMeetingItem',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: { itemId: string; resolution: string },
  ): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;
    const now = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('baseball_meeting_items')
      .update({
        status: 'resolved',
        resolution: args.resolution,
        resolved_at: now,
        resolved_by: ctx.user.id,
        updated_at: now,
      })
      .eq('id', args.itemId)
      .eq('team_id', ctx.targetTeamId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    const { error: logErr } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'resolved',
      title: 'Item resolved',
      detail: args.resolution,
      subject_table: 'baseball_meeting_items',
      subject_id: args.itemId,
      decided_by: ctx.user.id,
    });

    if (logErr) {
      return { success: false, error: logErr.message };
    }

    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * Create a new staff-authored agenda item.
 * Inserts into baseball_meeting_items with status='open' scoped to the active team.
 */
export const createMeetingItem = withBaseballAction(
  'createMeetingItem',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: { title: string; detail: string | null },
  ): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error } = await supabase.from('baseball_meeting_items').insert({
      team_id: ctx.targetTeamId,
      title: args.title,
      detail: args.detail ?? null,
      status: 'open',
      created_by: ctx.user.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * Record a free-text decision note threaded to a subject (signal or meeting item).
 * Inserts into baseball_decision_log with decision_kind='note'.
 */
export const recordDecisionNote = withBaseballAction(
  'recordDecisionNote',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: {
      title: string;
      note: string;
      subjectTable: string;
      subjectId: string;
      sourceSignalId: string | null;
      playerId: string | null;
    },
  ): Promise<DecisionRoomMutationResult> => {
    const supabase = (await createClient()) as unknown as LooseClient;

    const { error } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'note',
      title: args.title,
      detail: args.note,
      subject_table: args.subjectTable,
      subject_id: args.subjectId,
      source_signal_id: args.sourceSignalId ?? null,
      player_id: args.playerId ?? null,
      decided_by: ctx.user.id,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath(DECISION_ROOM_PATH);
    return { success: true };
  },
);

/**
 * [W6f] Convert a Decision Room agenda item's source signal into a practice
 * block. Wraps `convertSignalToAction` with `actionType:'practice_block'` and
 * appends a `converted_practice` entry to `baseball_decision_log` so the ledger
 * records the decision ("staff decided to address this in practice").
 *
 * Capability: can_manage_settings (Decision Room gate) AND can_manage_practice
 * (practice subsystem gate). We pre-check the practice capability before
 * delegating so a denied conversion never leaves an orphan ledger entry.
 *
 * Target table: `baseball_practice_blocks` (materialized by
 * `materializePracticeBlockFromSignal` inside `convertSignalToAction`). No
 * additive migration required — the table and the `converted_practice` ledger
 * kind already exist (migration 20260624000310).
 */
export const convertSignalToPracticeBlock = withBaseballAction(
  'convertSignalToPracticeBlock',
  {
    featureArea: 'baseball-decision-room',
    requiredCapability: 'can_manage_settings',
  },
  async (
    ctx,
    args: {
      /** The signal to materialize as a practice block. */
      signalId: string;
      /** Block title — defaults to the agenda item title. */
      title: string;
      /** Optional coach context for the block. */
      detail: string | null;
    },
  ): Promise<DecisionRoomMutationResult> => {
    // Pre-check: the practice subsystem requires can_manage_practice in
    // addition to the decision-room capability gate above. Check before the
    // conversion so a denied call never writes a partial ledger row.
    const canPractice = await hasBaseballCapability(
      ctx.targetTeamId,
      'can_manage_practice',
    );
    if (!canPractice) {
      return {
        success: false,
        error: 'You do not have permission to create practice blocks.',
      };
    }

    // Delegate the signal→practice_block materialization to the canonical
    // signals engine. It handles: inserting the baseball_actions row, calling
    // materializePracticeBlockFromSignal, stamping target_table/target_id
    // back on the action, and flipping the signal disposition to 'converted'.
    const convertResult = await convertSignalToAction({
      signalId: args.signalId,
      actions: [
        {
          actionType: 'practice_block',
          title: args.title,
          detail: args.detail ?? null,
          visibility: 'staff_only',
        },
      ],
    });

    if (!convertResult.success) {
      return {
        success: false,
        error: convertResult.error ?? 'Could not create the practice block.',
      };
    }

    // Append a `converted_practice` entry to the Decision Ledger so the room
    // records "staff decided to address this in practice". The action_id
    // links back to the baseball_actions row created above (first id returned).
    const supabase = (await createClient()) as unknown as LooseClient;
    const actionId = convertResult.ids?.[0] ?? null;

    const { error: ledgerErr } = await supabase
      .from('baseball_decision_log')
      .insert({
        team_id: ctx.targetTeamId,
        decision_kind: 'converted_practice',
        title: `Practice block: ${args.title}`,
        detail: args.detail ?? null,
        subject_table: 'baseball_signals',
        subject_id: args.signalId,
        source_signal_id: args.signalId,
        action_id: actionId,
        decided_by: ctx.user.id,
      });

    if (ledgerErr) {
      // The practice block was already materialized. Surface a soft warning
      // but treat the conversion as successful — the ledger write is secondary.
      revalidatePath(DECISION_ROOM_PATH);
      return {
        success: true,
        error: 'Practice block created, but the decision ledger entry could not be recorded.',
      };
    }

    revalidatePath(DECISION_ROOM_PATH);
    revalidatePath('/baseball/dashboard/practice');
    return { success: true };
  },
);

// =============================================================================
// STAFF SETTINGS — READ
// =============================================================================

/**
 * Resolve the Staff Settings read model for the viewer's active team.
 *
 * Resolves the authenticated server client and the active teamId via
 * getActiveBaseballContext(), then delegates entirely to loadStaffSettings.
 * Returns an honest empty result when the user is unauthenticated or has no
 * active baseball context — never fabricated rows.
 */
export async function getStaffSettingsData(): Promise<StaffSettingsData> {
  const supabase = await createClient();
  const context = await getActiveBaseballContext();
  if (!context) {
    return { staff: [], invitations: [], canManageStaff: false };
  }
  return loadStaffSettings(supabase, context.activeTeamId);
}
