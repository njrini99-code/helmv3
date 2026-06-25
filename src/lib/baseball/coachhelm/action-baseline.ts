import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/action-baseline.ts
//
// V10 — the SINGLE source of truth for seeding the OUTCOME LEDGER when an
// action is born (source → signal/insight → ACTION → did-it-move).
//
// WHY THIS EXISTS
//   There were TWO converters writing baseball_actions rows:
//     * convertInsightToAction (coachhelm-actions.ts) — seeded the ledger
//       (outcome_metric / outcome_baseline_value / outcome_verdict).
//     * convertSignalToAction  (signals.ts) — the CANONICAL Signal Inbox path
//       the whole mechanic is named after — seeded NOTHING. A signal-born
//       action was created without a baseline and could never be measured by
//       the sweep, even once wired.
//   The two had already DRIFTED (visibility derivation, ledger seeding). This
//   module unifies the business rule so BOTH paths produce byte-identical
//   ledger seeds: same metric resolution, same baseline read, same verdict.
//
// THE LEDGER SEED (what the sweep later compares against)
//   * outcome_metric          — the canonical metric the action targets.
//   * outcome_baseline_value  — the player's CURRENT value for that metric at
//                               conversion time (the AFTER-window comparison
//                               anchor). null when team-level or unmeasurable.
//   * outcome_verdict         — null when a measurable baseline was captured
//                               (the sweep will fill it), 'insufficient_sample'
//                               when there is no per-player metric to track so
//                               the row is honestly marked unmeasurable from
//                               birth (never silently "open forever").
//
// METRIC RESOLUTION (the deep part — the two paths converge HERE)
//   1. Cited engine insight (preferred): a promoted signal carries a source_ref
//      back to baseball_coach_insights; an insight-path conversion has the
//      insight in hand. Either way we read that insight's
//      metadata.evidence.diagnosis.drivers[0].metric — the EXACT primary driver
//      the diagnosis was built on. This is what convertInsightToAction always
//      used; convertSignalToAction now resolves to the SAME id for the same
//      originating diagnosis.
//   2. Generator fallback (GENERATOR_PRIMARY_METRIC): a signal whose insight is
//      no longer resolvable (expired, manual signal, legacy row) maps its
//      signal_type/generator → the metric that generator natively diagnoses.
//      The composite generators intentionally map to null (multi-metric — no
//      single per-player baseline is honest).
//
// HONESTY / SAFETY
//   * No service_role here — the caller passes its already-resolved RLS client.
//   * No fabricated metric: a signal_type with no clean per-player metric (team
//     ops, composites, manual) returns null → the action is tracked but marked
//     'insufficient_sample', never given a fake baseline.
//   * Read-only: this module only SELECTs. The converters do the INSERT.
//   * No schema change: outcome columns come from migration 20260624000210.
// =============================================================================

import {
  loadPlayerMetrics,
  type BoxScoreRow,
} from '@/lib/coachhelm/baseball/loaders';
import {
  isBaseballMetricId,
  type BaseballMetricId,
} from '@/lib/coachhelm/baseball/metrics/registry';
import { parseSignalSourceRefs } from '@/lib/types/baseball-signals';
import type { BaseballActionOutcomeVerdict } from '@/lib/types/baseball-coachhelm-v10';

// A minimally-typed client so this runs against the RLS server client (the only
// caller today). RLS still applies — this only loosens TS typing, matching the
// established loose-client pattern in the converters.
export type BaselineClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// The same stat projection the sweep + insight path read, kept in lockstep so a
// baseline captured at conversion is computed identically to the observed value
// the sweep later measures (apples-to-apples did-it-move).
const STAT_SELECT =
  'id, player_id, stat_type, session_date, at_bats, hits, doubles, triples, home_runs, walks, strikeouts, innings_pitched, earned_runs, walks_allowed, strikeouts_thrown, exit_velocity, pitch_velocity';

// -----------------------------------------------------------------------------
// Generator / signal_type -> the primary per-player metric it diagnoses.
//
// This is the FALLBACK when the originating insight is not resolvable from the
// signal. Mirrors signal-from-insight.ts's generatorToCategory/Recommendation
// mappings (same generator id space) so the three stay coherent. Generators that
// are team-level (schedule/import) or composite (multi-metric) map to null: no
// single per-player baseline is honest for them, so the action is tracked but
// marked unmeasurable rather than given a fabricated metric.
// -----------------------------------------------------------------------------
const GENERATOR_PRIMARY_METRIC: Record<string, BaseballMetricId | null> = {
  two_strike_chase: 'two_strike_chase_pct',
  game_vs_practice_gap: 'game_practice_avg_delta',
  velo_command_decay: 'walks_per_inning',
  workload: 'rolling_pitch_count',
  readiness: 'soreness_level',
  lift_compliance: 'lift_completion_rate',
  lift_rpe_spike: 'lift_rpe_avg',
  practice_effectiveness: 'practice_focus_movement',
  // Team-level / operational — no per-player metric to track.
  schedule_conflict: null,
  import_quality: null,
  video_evidence: null,
  // Composite generators fuse multiple drivers — no single honest baseline.
  composite_command_decay: null,
  composite_translation_gap: null,
  composite_lift_to_field_risk: null,
};

/** Extract the primary target metric id from a stored insight's evidence. */
export function primaryMetricOfInsightMetadata(
  metadata: unknown,
): BaseballMetricId | null {
  const ev = (metadata as {
    evidence?: { diagnosis?: { drivers?: Array<{ metric?: string }> } };
  } | null)?.evidence;
  const first = ev?.diagnosis?.drivers?.[0]?.metric;
  return first && isBaseballMetricId(first) ? first : null;
}

/**
 * Resolve the cited engine insight id from a signal's source_refs (the citation
 * ref signal-from-insight.ts stamps back to baseball_coach_insights). Returns
 * the first such ref's source_id, or null for a manual/legacy signal.
 */
export function citedInsightIdFromSignal(sourceRefs: unknown): string | null {
  const refs = parseSignalSourceRefs(sourceRefs as never);
  for (const r of refs) {
    if (r.source_table === 'baseball_coach_insights' && r.source_id) {
      return r.source_id;
    }
  }
  return null;
}

/**
 * Resolve the canonical target metric for a SIGNAL-born action.
 *
 * Convergence with the insight path: if the signal cites an engine insight we
 * read that insight's primary driver (the EXACT metric convertInsightToAction
 * uses). Otherwise we fall back to the generator map. Returns null when no
 * honest per-player metric exists (team-level / composite / manual signal).
 */
export async function resolveSignalTargetMetric(
  supabase: BaselineClient,
  teamId: string,
  signal: { signal_type: string | null; source_refs: unknown },
): Promise<BaseballMetricId | null> {
  // 1. Prefer the cited insight's primary driver (byte-identical to the insight
  //    path for the same originating diagnosis).
  const insightId = citedInsightIdFromSignal(signal.source_refs);
  if (insightId) {
    const { data } = await supabase
      .from('baseball_coach_insights')
      .select('metadata')
      .eq('id', insightId)
      .eq('team_id', teamId)
      .maybeSingle();
    const metric = primaryMetricOfInsightMetadata(
      (data as { metadata?: unknown } | null)?.metadata,
    );
    if (metric) return metric;
  }

  // 2. Generator fallback. signal_type IS the generator id (signal-from-insight).
  const gen = signal.signal_type ?? '';
  if (Object.prototype.hasOwnProperty.call(GENERATOR_PRIMARY_METRIC, gen)) {
    // Mapped generator (including those that intentionally map to null).
    return GENERATOR_PRIMARY_METRIC[gen] ?? null;
  }

  // A direct metric id as signal_type (manual signal) also resolves.
  if (gen && isBaseballMetricId(gen)) return gen;

  return null;
}

// -----------------------------------------------------------------------------
// The shared ledger seed
// -----------------------------------------------------------------------------

/** The three outcome-ledger columns set at action birth (byte-identical both paths). */
export interface ActionOutcomeSeed {
  outcome_metric: BaseballMetricId | null;
  outcome_baseline_value: number | null;
  outcome_verdict: BaseballActionOutcomeVerdict | null;
}

/** A seed with no measurable per-player metric — tracked but honestly unmeasurable. */
const UNMEASURABLE_SEED: ActionOutcomeSeed = {
  outcome_metric: null,
  outcome_baseline_value: null,
  outcome_verdict: 'insufficient_sample',
};

/**
 * Compute the outcome-ledger seed for an action being created. Reads the
 * subject player's CURRENT value for the target metric (the baseline the sweep
 * compares the AFTER window against). Identical logic for the insight path and
 * the signal path — this is the unified business rule.
 *
 *   * No player OR no metric  -> UNMEASURABLE_SEED ('insufficient_sample').
 *   * Metric resolved but the player has no value for it yet (e.g. a pitching
 *     metric on a position player, or zero qualifying sessions) -> baseline
 *     null + 'insufficient_sample' (honest: nothing to measure movement from).
 *   * Metric + baseline captured -> verdict null (the sweep will fill it).
 */
export async function buildActionOutcomeSeed(
  supabase: BaselineClient,
  teamId: string,
  playerId: string | null,
  targetMetric: BaseballMetricId | null,
): Promise<ActionOutcomeSeed> {
  if (!playerId || !targetMetric) return UNMEASURABLE_SEED;

  // SINGLE-PLAYER read — bounded by design, NOT paginated. A baseline is the one
  // subject player's CURRENT value at conversion time; even a multi-season career
  // is far under the PostgREST 1000-row cap (one row per game/session), so the
  // most-recent page is the full relevant history. We order newest-first and cap
  // at the true server max (1000) — the prior `.limit(2000)` was misleading since
  // PostgREST silently caps every response at 1000 regardless. If per-player rows
  // ever realistically approach 1000, switch this to fetchAllRowsResult like the
  // multi-player sweep read.
  const { data: statRows } = await supabase
    .from('baseball_player_stats')
    .select(STAT_SELECT)
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .order('session_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000);

  const loaded = loadPlayerMetrics(
    playerId,
    (statRows ?? []) as unknown as BoxScoreRow[],
  );
  const baselineValue = loaded.metrics[targetMetric]?.value ?? null;

  return {
    outcome_metric: targetMetric,
    outcome_baseline_value: baselineValue,
    // Mirrors convertInsightToAction exactly: a captured baseline leaves the
    // verdict null for the sweep to fill; a metric with no baseline yet is
    // honestly 'insufficient_sample' from birth.
    outcome_verdict: baselineValue != null ? null : 'insufficient_sample',
  };
}
