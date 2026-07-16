'use server';

// =============================================================================
// src/app/baseball/actions/coachhelm-actions.ts
//
// V10 — CoachHelm baseball ACTION CONVERSION + OUTCOME LEDGER.
//
// Closes the V10/V6 loop: source → signal → ACTION → did-it-move. The engine
// (coachhelm.ts) produces ranked, source-cited signals in baseball_coach_insights.
// This module:
//
//   1. convertInsightToAction — turns a signal into a tracked baseball_actions
//      row, capturing the TARGET METRIC and its BASELINE VALUE at conversion so
//      the later sweep can measure movement. The action's metric movement is
//      attributed using the registry IMPROVEMENT SIGN (never the raw delta), so
//      the ledger can never "learn backward" (velo drop ≠ improvement).
//
//   2. recordActionOutcomes — the outcome sweep: for each open action with a
//      target metric, recompute the metric over the AFTER window and write an
//      honest verdict (improved / no_change / regressed / too_early /
//      insufficient_sample). One practice/window NEVER proves causality — the
//      verdict language stays associational + honest.
//
// SAFETY:
//   - withBaseballAction enforces auth + active team + capability server-side,
//     scopes Sentry, sanitizes errors. No service_role in the client path.
//   - NO destructive writes: convert INSERTs a new action; the sweep UPDATEs the
//     outcome columns in place (no delete-then-insert).
//   - Outcome columns come from migration 20260624000210 (additive). Types are
//     hand-mirrored in src/lib/types/baseball-coachhelm-v10.ts (db types not yet
//     regenerated — migration unapplied).
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { sweepActionOutcomes } from '@/lib/baseball/coachhelm/outcome-sweep';
import { logServerException } from '@/lib/server-error-logger';
import {
  buildActionOutcomeSeed,
  primaryMetricOfInsightMetadata,
} from '@/lib/baseball/coachhelm/action-baseline';

// Loose client for baseball_actions (not yet in generated db types; migration
// unapplied / shared prod DB). RLS still applies — only loosens TS typing,
// matching the established pattern in src/app/baseball/actions/imports.ts.
type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// -----------------------------------------------------------------------------
// Map a signal generator → the baseball_actions.action_type it converts to.
// (action_type CHECK: practice_block|player_task|video_request|lift_modification|
//  meeting_item|message|player_note|import_review)
// -----------------------------------------------------------------------------

const GENERATOR_ACTION_TYPE: Record<string, string> = {
  two_strike_chase: 'practice_block',
  game_vs_practice_gap: 'practice_block',
  velo_command_decay: 'practice_block',
  workload: 'lift_modification',
  schedule_conflict: 'meeting_item',
  readiness: 'player_note',
  lift_compliance: 'lift_modification',
  lift_rpe_spike: 'lift_modification',
  practice_effectiveness: 'meeting_item',
  import_quality: 'import_review',
  video_evidence: 'video_request',
  composite_command_decay: 'lift_modification',
  composite_translation_gap: 'practice_block',
  composite_lift_to_field_risk: 'meeting_item',
};

// -----------------------------------------------------------------------------
// convertInsightToAction
// -----------------------------------------------------------------------------

export interface ConvertResult {
  success: boolean;
  actionId?: string;
  error?: string;
}

/**
 * Convert an engine insight into a tracked staff action with outcome attribution.
 *
 * Capability `can_manage_stats` (converting a diagnostic signal is a stats
 * action). The action captures the target metric + its CURRENT value as the
 * outcome baseline so recordActionOutcomes can measure movement later.
 */
export const convertInsightToAction = withBaseballAction(
  'convertInsightToAction',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx, insightId: string): Promise<ConvertResult> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;
    const coachId = ctx.activeCoachId;

    const { data: row } = await supabase
      .from('baseball_coach_insights')
      .select('*')
      .eq('id', insightId)
      .eq('team_id', teamId)
      .maybeSingle();
    const insight = row as
      | {
          id: string;
          team_id: string;
          player_id: string | null;
          title: string;
          body: string | null;
          generated_by: string | null;
          source_refs: unknown;
          confidence: number | null;
          player_visible: boolean | null;
          metadata: unknown;
        }
      | null;
    if (!insight) return { success: false, error: 'Insight not found for this team.' };

    const generator = insight.generated_by ?? 'unknown';
    const actionType = GENERATOR_ACTION_TYPE[generator] ?? 'meeting_item';

    // Capture the outcome baseline via the SHARED seed helper so the insight
    // path and the canonical signal path (convertSignalToAction) produce
    // byte-identical ledger rows. Team-level signals (schedule, import) and
    // metrics with no player value yield 'insufficient_sample' (tracked, but
    // honestly unmeasurable) rather than a fabricated baseline.
    const targetMetric = primaryMetricOfInsightMetadata(insight.metadata);
    const outcomeSeed = await buildActionOutcomeSeed(
      supabase,
      teamId,
      insight.player_id,
      targetMetric,
    );

    const insertRow = {
      team_id: teamId,
      signal_id: null, // baseball_coach_insights is the engine surface today
      player_id: insight.player_id,
      action_type: actionType,
      title: insight.title,
      detail: insight.body,
      owner_coach_id: coachId,
      status: 'open',
      source_refs: insight.source_refs ?? [],
      confidence: insight.confidence,
      visibility: insight.player_visible ? 'team' : 'staff_only',
      // Outcome ledger (V10, migration 20260624000210) — shared seed.
      outcome_metric: outcomeSeed.outcome_metric,
      outcome_baseline_value: outcomeSeed.outcome_baseline_value,
      outcome_verdict: outcomeSeed.outcome_verdict,
      created_by: ctx.user.id,
    };

    const db = supabase as unknown as LooseClient;
    const { data: inserted, error } = await db
      .from('baseball_actions')
      .insert(insertRow)
      .select('id')
      .maybeSingle();
    if (error || !inserted) return { success: false, error: 'Could not create the action.' };

    // Mark the insight addressed (non-destructive) so it leaves the active queue.
    await supabase
      .from('baseball_coach_insights')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lifecycle_state not yet in db types
      .update({ status: 'addressed', lifecycle_state: 'addressed' } as any)
      .eq('id', insightId)
      .eq('team_id', teamId);

    revalidatePath('/baseball/dashboard/command-center');
    return { success: true, actionId: (inserted as { id: string }).id };
  },
);

// -----------------------------------------------------------------------------
// recordActionOutcomes — the outcome sweep.
// -----------------------------------------------------------------------------

export interface OutcomeSweepResult {
  success: boolean;
  evaluated: number;
  measured: number;
  error?: string;
}

/**
 * Sweep open/in-progress actions with a target metric and record whether the
 * metric moved. Capability `can_manage_stats`. Thin wrapper over the shared core
 * (src/lib/baseball/coachhelm/outcome-sweep.ts) so the manual run, the Inngest
 * cron, and the postgame finalize path all measure identically. Honest by
 * construction: a thin AFTER-window is 'too_early', a neutral_threshold metric
 * (workload) yields 'insufficient_sample' rather than a fake improvement claim,
 * and movement is always improvement-SIGNED from the registry — never the raw
 * delta.
 */
export const recordActionOutcomes = withBaseballAction(
  'recordActionOutcomes',
  { featureArea: 'baseball-coachhelm', requiredCapability: 'can_manage_stats' },
  async (ctx): Promise<OutcomeSweepResult> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    try {
      const { evaluated, measured } = await sweepActionOutcomes(db, ctx.targetTeamId, {
        // Manual run re-measures every open metric-targeted action so a coach who
        // clicks "Re-measure" gets a fresh did-it-move read, not only first-pass.
        remeasure: true,
      });
      revalidatePath('/baseball/dashboard/command-center');
      revalidatePath('/baseball/dashboard/decision-room');
      return { success: true, evaluated, measured };
    } catch (error) {
      await logServerException(error, {
        action: 'recordActionOutcomes',
        sport: 'baseball',
        source: 'server_action',
        teamId: ctx.targetTeamId,
      });
      return { success: false, evaluated: 0, measured: 0, error: 'Could not record action outcomes.' };
    }
  },
);
