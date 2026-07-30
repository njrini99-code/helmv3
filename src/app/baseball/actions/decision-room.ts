'use server';

import { withAdminObserved } from '@/lib/admin/observed-action';
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
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

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
// DECISION ROOM — TYPES
// =============================================================================

/** A cited source reference shown under an agenda item ("decide with evidence"). */
export interface DecisionRoomSourceRef {
  label: string;
  detail: string | null;
}

/** Severity tint for an agenda item / conflict (null = neutral). */
export type DecisionRoomSeverity = 'critical' | 'warning' | 'info';

/**
 * An item on the meeting agenda. `kind` is 'meeting_item' for a materialized,
 * staff-created/raised item and 'signal' for an open signal surfaced for
 * triage. `status` is 'discussed' once marked, otherwise 'open'.
 */
export interface DecisionRoomAgendaItem {
  id: string;
  kind: 'meeting_item' | 'signal';
  title: string;
  detail: string | null;
  status: 'open' | 'discussed';
  /** Severity tint; null when the item carries no severity signal. */
  severityHint: DecisionRoomSeverity | null;
  /** The player the item concerns, when player-scoped. */
  playerId: string | null;
  playerName: string | null;
  /** The originating signal id, when this item came from / can convert a signal. */
  sourceSignalId: string | null;
  /** Count of structured sources backing the item (shown as "N src"). */
  sourceRefCount: number;
  /** The structured sources themselves, rendered in the detail panel. */
  sourceRefs: DecisionRoomSourceRef[];
}

/** A coaching insight surfaced in the Decision Room insight rail. */
export interface DecisionRoomInsight {
  id: string;
  title: string;
  body: string | null;
  insightType: string;
  priority: string | null;
  status: string;
  authorName: string | null;
  createdAt: string;
}

/** A player + missed-session count inside an attendance/lift summary. */
export interface DecisionRoomSummaryPlayer {
  playerId: string;
  playerName: string | null;
  missedCount: number;
}

/** A decision-ledger entry — a record of a decision MADE, threaded to evidence. */
export interface DecisionRoomLedgerEntry {
  id: string;
  kind:
    | 'invite_accepted'
    | 'invite_pending'
    | 'discussed'
    | 'resolved'
    | 'converted_task'
    | 'converted_note'
    | 'converted_practice'
    | 'raised'
    | 'reopened'
    | 'note';
  label: string;
  detail: string | null;
  at: string;
}

/** A player flagged for discussion, with open/critical signal counts. */
export interface DecisionRoomPlayerFocus {
  playerId: string;
  name: string;
  openCount: number;
  criticalCount: number;
}

/** An import-quality issue surfaced onto the agenda. */
export interface DecisionRoomImportIssue {
  /** The originating signal id — also the React key for the row. */
  signalId: string;
  title: string;
  detail: string | null;
  severity: DecisionRoomSeverity;
}

/** A practice-effectiveness review summary ("did the practice move the metric"). */
export interface DecisionRoomEffectivenessReview {
  id: string;
  practiceTitle: string;
  focusArea: string | null;
  metricLabel: string | null;
  direction: 'improved' | 'regressed' | 'no_change' | null;
  conclusion: string | null;
  recommendedLabel: string | null;
}

/** A tracked action-outcome ("did-it-move") row. */
export interface DecisionRoomActionOutcome {
  id: string;
  title: string;
  playerName: string | null;
  metricLabel: string | null;
  unit: string | null;
  baselineValue: number | null;
  observedValue: number | null;
  sampleN: number | null;
  /** Whether a measurement has been taken yet (false = still tracking). */
  measured: boolean;
  verdict: BaseballActionOutcomeVerdict | null;
}

/** A recent completed game result. */
export interface DecisionRoomGameResult {
  id: string;
  gameDate: string;
  opponentName: string | null;
  homeAway: 'home' | 'away' | null;
  ourScore: number | null;
  opponentScore: number | null;
  result: 'win' | 'loss' | 'tie' | null;
}

/** A player availability concern (injury / limitation window). */
export interface DecisionRoomAvailabilityConcern {
  id: string;
  playerId: string;
  playerName: string | null;
  status: 'out' | 'limited' | 'available';
  reasonCategory: string | null;
  note: string | null;
  /** Window start; the row renders "Since {startsAt}" unconditionally. */
  startsAt: string;
  endsAt: string | null;
}

/** Aggregate practice-attendance summary over the trailing window. */
export interface DecisionRoomAttendanceSummary {
  totalPractices: number;
  totalAttended: number;
  totalMissed: number;
  concernedPlayers: DecisionRoomSummaryPlayer[];
}

/** Aggregate lift-compliance summary over the trailing window. */
export interface DecisionRoomLiftSummary {
  scheduledCount: number;
  completedCount: number;
  nonCompliantPlayers: DecisionRoomSummaryPlayer[];
}

/** An open staff/operational task surfaced onto the agenda. */
export interface DecisionRoomOpenTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
}

/** A scheduling/obligation conflict (e.g. class vs. travel). */
export interface DecisionRoomConflict {
  id: string;
  playerName: string | null;
  severity: DecisionRoomSeverity;
  obligationKind: string;
  obligationLabel: string | null;
  whyItMatters: string | null;
  recommendedActionLabel: string | null;
}

/** The full Decision Room read model rendered by StaffDecisionRoomClient. */
export interface DecisionRoomData {
  agenda: DecisionRoomAgendaItem[];
  insights: DecisionRoomInsight[];
  ledger: DecisionRoomLedgerEntry[];
  playersToDiscuss: DecisionRoomPlayerFocus[];
  importIssues: DecisionRoomImportIssue[];
  effectivenessReviews: DecisionRoomEffectivenessReview[];
  actionOutcomes: DecisionRoomActionOutcome[];
  recentGameResults: DecisionRoomGameResult[];
  availabilityConcerns: DecisionRoomAvailabilityConcern[];
  attendanceSummary: DecisionRoomAttendanceSummary;
  /**
   * True when `availabilityConcerns` and `attendanceSummary` were WITHHELD
   * because the caller lacks `can_view_readiness` — not because there is nothing
   * to report.
   *
   * Without this, both feeds are indistinguishable from a genuinely clean team:
   * an empty concerns array rendered as "No current availability concerns — all
   * players are ready", which is a confident claim about player health assembled
   * from data the viewer was never allowed to see. Consumers MUST branch on this
   * before reading either field as a measurement. Mirrors
   * `PerformanceCommandData.readinessWithheld`, which already does this.
   */
  readinessWithheld: boolean;
  liftSummary: DecisionRoomLiftSummary;
  openTasks: DecisionRoomOpenTask[];
  conflicts: DecisionRoomConflict[];
  // headline counters
  staffCount: number;
  decisionCount: number;
  openAgendaCount: number;
  openInsightCount: number;
  outcomeMovedCount: number;
}

/** Result envelope shared by the Decision Room mutations. */
export interface DecisionRoomMutationResult {
  success: boolean;
  error?: string;
}

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
        readinessWithheld: !canViewReadiness,
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
//
// SCHEMA NOTE (2026-07-10 reconcile): `baseball_decision_log`'s live (prod)
// columns are meeting_item_id/signal_id — NOT the subject_table/subject_id/
// source_signal_id shape 20260624000310_baseball_decision_log.sql originally
// intended (its CREATE TABLE IF NOT EXISTS no-op'd against a pre-existing,
// differently-shaped table). All ledger inserts below target the real
// columns. Migration 20260710031500_baseball_decision_log_kind_reconcile.sql
// closes the gap on BOTH axes this depends on: (1) `ADD COLUMN IF NOT
// EXISTS` for meeting_item_id/signal_id/decided_at/rationale/participants/
// outcome_summary/tags/created_by, so a freshly-replayed migration chain
// (CI shadow DB, a new dev's local `supabase start`) actually has these
// columns too — not just prod's already-drifted table; and (2) widens the
// `decision_kind` CHECK constraint, which predates this feature and only
// allowed a legacy value set (program/player/staff/roster/travel/
// scheduling/administrative), to also allow the values written here
// (discussed/resolved/converted_task/converted_note/converted_practice/
// raised/reopened/note). Until that migration is applied, every insert
// below still fails (column-does-not-exist in a fresh environment, CHECK
// violation in prod) and these mutations degrade to their existing
// `{success:false, error}` envelope (the meeting_items status update
// commits either way; see each function's early-return handling below).
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
      meeting_item_id: itemId,
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
      meeting_item_id: itemId,
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
      meeting_item_id: args.itemId,
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

    // baseball_decision_log has no generic subject_table/subject_id column —
    // it links back to a subject via the concrete meeting_item_id/signal_id
    // FK columns instead. Derive them from the caller's subjectTable/subjectId
    // (see StaffDecisionRoomFairway.tsx's submitNote, the only caller).
    const meetingItemId =
      args.subjectTable === 'baseball_meeting_items' ? args.subjectId : null;
    const signalId =
      args.subjectTable === 'baseball_signals'
        ? args.subjectId
        : (args.sourceSignalId ?? null);

    const { error } = await supabase.from('baseball_decision_log').insert({
      team_id: ctx.targetTeamId,
      decision_kind: 'note',
      title: args.title,
      detail: args.note,
      meeting_item_id: meetingItemId,
      signal_id: signalId,
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
        signal_id: args.signalId,
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
// STAFF SETTINGS — TYPES
// =============================================================================

/** A coaching-staff member as shown in the Staff Settings roster + matrix. */
export interface StaffMemberView {
  id: string;
  name: string;
  email: string | null;
  /** Free-text role label (e.g. "Assistant Coach"). */
  role: string | null;
  /** Optional formal title, shown as a fallback to role. */
  title: string | null;
  status: 'active' | 'removed' | string;
  isPrimary: boolean;
  isHeadCoach: boolean;
  /** capability_key -> granted. */
  capabilities: Record<string, boolean>;
  /** The underlying baseball_coaches.id for this staff member (null for invited-but-not-joined). */
  coachId: string | null;
  /** Avatar / profile photo URL from the coach's profile, if set. */
  avatarUrl: string | null;
  /** Whether this staff member is visible on player-facing roster views. */
  visibleToPlayers: boolean;
  /** Optional bio shown on player-facing profile. */
  bio: string | null;
  /** Contact phone shown to players (when visibility allows). */
  phone: string | null;
  /** When non-empty, restricts this staff member's view to these player ids. */
  scopePlayerIds: string[];
  /** When non-empty, restricts this staff member's view to these group ids. */
  scopeGroupIds: string[];
  /** ISO timestamp when this staff record was created. */
  createdAt: string | null;
}

/** A pending/used staff invitation. */
export interface StaffInvitationView {
  id: string;
  email: string;
  role: string | null;
  /**
   * Invite token used to build the copyable join link. Empty string once the
   * invite is consumed/revoked (the Copy button is `disabled` when empty), so
   * this stays a plain string rather than nullable.
   */
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | string;
  expiresAt: string;
  isExpired: boolean;
  invitedByName: string | null;
  /** ISO timestamp when the invitee accepted the invitation (null while pending/revoked). */
  acceptedAt?: string | null;
  /** ISO timestamp when the invitation was created. */
  createdAt?: string;
}

/** The full Staff Settings read model rendered by StaffSettingsClient. */
export interface StaffSettingsData {
  staff: StaffMemberView[];
  invitations: StaffInvitationView[];
  /** Whether the VIEWER may edit/invite/remove (is_head_coach || can_invite_staff). */
  canManageStaff: boolean;
}

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
async function getStaffSettingsDataImpl(): Promise<StaffSettingsData> {
  const supabase = await createClient();
  const context = await getActiveBaseballContext();
  if (!context) {
    return { staff: [], invitations: [], canManageStaff: false };
  }
  return loadStaffSettings(supabase, context.activeTeamId);
}

export const getStaffSettingsData = withAdminObserved(
  'getStaffSettingsData',
  { sport: 'baseball', feature: 'baseball_decision_room', featureArea: 'baseball-decision-room' },
  getStaffSettingsDataImpl,
);
