/**
 * CoachHelm BASEBALL V10 loaders — readiness / lift / practice / operations.
 *
 * The W10 skeleton (`loaders.ts`) covered box-score hitting/pitching/workload.
 * V10 (per docs/.../25_premium_ui_coachhelm_v10 + 20_..._v6) deepens the engine
 * across MORE domains: readiness/wellness, strength, practice effectiveness,
 * import quality, video coverage. This module turns those source rows into the
 * SAME `LoadedMetric` shape the box-score loader emits, so the generators and
 * confidence/honesty machinery are shared verbatim — one engine, every domain.
 *
 * HONESTY CONTRACT (identical to loaders.ts):
 *   - confidence is computed by the SHARED engine (calcConfidence) then capped by
 *     the metric's fidelity ceiling — never a fabricated 1.0;
 *   - target_n is recalibrated to roster reality (a few check-ins is adequate);
 *   - readiness/wellness are NEUTRAL_THRESHOLD operational flags, NEVER medical:
 *     their LoadedMetric carries the value, and the readiness generator alone
 *     interprets it with the "operational flag, not a medical assessment" caveat;
 *   - source refs are `staff_only` for staff-restricted health data (readiness,
 *     lift) so an insight resting on them defaults coach-only.
 *
 * Pure module: no DB access (the action fetches rows + passes them in).
 */

import type { InsightConfidenceFactors } from '@/lib/coachhelm/shared/evidence-types';
import { calcConfidence } from '@/lib/coachhelm/shared/evidence-types';
import type {
  BaseballInsightSourceRef,
  BaseballSourceVisibility,
} from '@/lib/types/baseball-coachhelm';
import {
  getBaseballMetricFidelity,
  getBaseballMetricUnit,
  type BaseballMetricId,
} from './metrics/registry';
import { BASEBALL_TARGET_N, type LoadedMetric, type LoadedPlayerMetrics } from './loaders';

// -----------------------------------------------------------------------------
// Source row shapes (subsets of the V10 lite tables we read).
// -----------------------------------------------------------------------------

/** One row from baseball_readiness_checkins. */
export interface ReadinessRow {
  id: string;
  player_id: string;
  check_date: string | null;
  sleep_hours?: number | null;
  energy_level?: number | null;
  soreness_level?: number | null;
  arm_status?: string | null; // fresh|normal|tight|sore|pain
}

/**
 * One materialized session from baseball_lift_sessions (status drives
 * compliance). This is the V11 unified storage model — publishLiftDay
 * MATERIALIZES one session per player, and this is what the player Today card,
 * the player lift route, AND the engine all read. (The legacy
 * baseball_lift_assignments/baseball_lift_results island is no longer the engine
 * source — it was unreadable by the V11 publish path.)
 */
export interface LiftSessionRow {
  id: string;
  player_id: string | null;
  scheduled_date: string | null;
  /** assigned|started|completed|missed|excused|modified */
  status: string;
}

/** One set result from baseball_lift_set_results (per-set RPE). */
export interface LiftSetResultRow {
  id: string;
  player_id: string;
  completed_at: string | null;
  rpe?: number | null;
}

// -----------------------------------------------------------------------------
// Fidelity ceiling — same table as loaders.ts (kept local to avoid an export
// churn; all V10 metrics here are 'measured' so the ceiling is 1.0, but we still
// route through getBaseballMetricFidelity so a future proxy metric is honest).
// -----------------------------------------------------------------------------

const FIDELITY_CONFIDENCE_CEILING: Record<string, number> = {
  measured: 1.0,
  proxy: 0.49,
  sensor_optional: 0.7,
};

/** Encode arm-status escalation fresh(0) → pain(4). */
const ARM_STATUS_RANK: Record<string, number> = {
  fresh: 0,
  normal: 1,
  tight: 2,
  sore: 3,
  pain: 4,
};

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

function buildConfidence(
  metric: BaseballMetricId,
  sample_n: number,
  target_n: number,
): { confidence: number; factors: InsightConfidenceFactors } {
  const sample_adequacy = target_n > 0 ? Math.min(1, sample_n / target_n) : 0;
  // No per-event dispersion for these aggregates → flag UNMEASURED so
  // calcConfidence surfaces honest sample-adequacy (never a fabricated floor).
  const factors: InsightConfidenceFactors = {
    sample_adequacy,
    recency: 1,
    variance: 0,
    factors_measured: false,
  };
  const raw = calcConfidence({ confidence_factors: factors });
  const ceiling = FIDELITY_CONFIDENCE_CEILING[getBaseballMetricFidelity(metric)] ?? 0.6;
  return { confidence: Math.max(0, Math.min(ceiling, raw)), factors };
}

function ref(
  table: string,
  column: string,
  visibility: BaseballSourceVisibility,
  sample_n: number,
  label: string,
): BaseballInsightSourceRef {
  return { table, column, visibility, sample_n, label };
}

function toMetric(
  metric: BaseballMetricId,
  value: number | null,
  sample_n: number,
  refs: BaseballInsightSourceRef[],
): LoadedMetric {
  const target_n = BASEBALL_TARGET_N[metric];
  const { confidence, factors } = buildConfidence(metric, sample_n, target_n);
  return {
    metric,
    value,
    unit: getBaseballMetricUnit(metric),
    sample_n,
    target_n,
    confidence,
    confidence_factors: factors,
    source_refs: refs.map((r) => ({ ...r, confidence })),
  };
}

// -----------------------------------------------------------------------------
// Readiness — latest-window soreness / energy / sleep / arm status.
// -----------------------------------------------------------------------------

/**
 * The readiness signals one player exposes. We read the MOST RECENT check-ins
 * (last 7 days) so the flag reflects current status, and surface the worst
 * (highest soreness, lowest energy/sleep, highest arm-status) in the window —
 * a single bad day is the operational signal, not an average that hides it.
 */
export function loadReadinessMetrics(
  playerId: string,
  rows: ReadinessRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const cutoff = Date.now() - 7 * 86400_000;
  const mine = rows.filter(
    (r) => r.player_id === playerId && r.check_date && Date.parse(r.check_date) >= cutoff,
  );
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  if (mine.length === 0) return out;

  const soreness = mine.map((r) => r.soreness_level).filter((v): v is number => v != null);
  if (soreness.length > 0) {
    out.soreness_level = toMetric('soreness_level', Math.max(...soreness), soreness.length, [
      ref('baseball_readiness_checkins', 'soreness_level', 'staff_only', soreness.length, 'Recent soreness (1-5)'),
    ]);
  }
  const energy = mine.map((r) => r.energy_level).filter((v): v is number => v != null);
  if (energy.length > 0) {
    out.energy_level = toMetric('energy_level', Math.min(...energy), energy.length, [
      ref('baseball_readiness_checkins', 'energy_level', 'staff_only', energy.length, 'Recent energy (1-5)'),
    ]);
  }
  const sleep = mine.map((r) => r.sleep_hours).filter((v): v is number => v != null);
  if (sleep.length > 0) {
    out.sleep_hours = toMetric('sleep_hours', Math.min(...sleep), sleep.length, [
      ref('baseball_readiness_checkins', 'sleep_hours', 'staff_only', sleep.length, 'Recent sleep (hours)'),
    ]);
  }
  const arm = mine
    .map((r) => (r.arm_status ? ARM_STATUS_RANK[r.arm_status.toLowerCase()] : undefined))
    .filter((v): v is number => v != null);
  if (arm.length > 0) {
    out.arm_status_level = toMetric('arm_status_level', Math.max(...arm), arm.length, [
      ref('baseball_readiness_checkins', 'arm_status', 'staff_only', arm.length, 'Recent arm status'),
    ]);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Lift — completion compliance + rolling RPE.
// -----------------------------------------------------------------------------

/**
 * Compliance = completed / (everything that has come due). We count only DUE
 * sessions (scheduled_date on/before today, or null treated as due) so future
 * homework does not drag the rate down — an honest "did the work that was due
 * happen?". A session in 'missed'/'excused'/'modified'/'assigned'/'started'
 * state that is past due counts against compliance unless completed; 'excused'
 * is treated as not-counted (it was legitimately removed from the denominator).
 */
export function loadLiftMetrics(
  playerId: string,
  sessions: LiftSessionRow[],
  setResults: LiftSetResultRow[],
): Partial<Record<BaseballMetricId, LoadedMetric>> {
  const out: Partial<Record<BaseballMetricId, LoadedMetric>> = {};
  const now = Date.now();

  const mineSessions = sessions.filter(
    (s) =>
      s.player_id === playerId &&
      s.status !== 'excused' && // excused = legitimately not owed; drop from denominator
      (s.scheduled_date == null || Date.parse(s.scheduled_date) <= now),
  );
  if (mineSessions.length > 0) {
    const completed = mineSessions.filter((s) => s.status === 'completed').length;
    out.lift_completion_rate = toMetric(
      'lift_completion_rate',
      completed / mineSessions.length,
      mineSessions.length,
      [ref('baseball_lift_sessions', 'status,scheduled_date', 'staff_only', mineSessions.length, 'Lift completion (due sessions)')],
    );
  }

  // Rolling RPE over the last 14 days of logged sets (the materialized V11 path
  // records RPE per set, not once per lift). A bad single session shows up.
  const cutoff = now - 14 * 86400_000;
  const recentRpe = setResults
    .filter((r) => r.player_id === playerId && r.completed_at && Date.parse(r.completed_at) >= cutoff)
    .map((r) => r.rpe)
    .filter((v): v is number => v != null);
  if (recentRpe.length > 0) {
    const avg = recentRpe.reduce((a, b) => a + num(b), 0) / recentRpe.length;
    out.lift_rpe_avg = toMetric('lift_rpe_avg', avg, recentRpe.length, [
      ref('baseball_lift_set_results', 'rpe', 'staff_only', recentRpe.length, 'Rolling 14-day set RPE'),
    ]);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Merge V10 player metrics INTO an existing LoadedPlayerMetrics (box-score).
// -----------------------------------------------------------------------------

/**
 * Non-destructively merge readiness + lift metrics into a player's already-
 * loaded box-score metrics. Box-score metrics win on key collision (there are
 * none today — disjoint metric ids), so this only ADDS the V10 domains.
 */
export function mergeV10PlayerMetrics(
  base: LoadedPlayerMetrics,
  readiness: ReadinessRow[],
  liftSessions: LiftSessionRow[],
  liftSetResults: LiftSetResultRow[],
): LoadedPlayerMetrics {
  return {
    ...base,
    metrics: {
      ...loadReadinessMetrics(base.playerId, readiness),
      ...loadLiftMetrics(base.playerId, liftSessions, liftSetResults),
      ...base.metrics,
    },
  };
}

// -----------------------------------------------------------------------------
// Practice effectiveness inputs — the practice-effectiveness generator needs
// (a) a published/completed practice with a focus, (b) the focus metric's value
// BEFORE and AFTER the practice. We expose a typed input the action fills from
// the practices + box-score rows; the loader stays pure.
// -----------------------------------------------------------------------------

/** A practice with a coachable focus + before/after measurement of one metric. */
export interface PracticeEffectivenessInput {
  practiceId: string;
  practiceTitle: string;
  focusMetric: BaseballMetricId;
  /** Players who attended (present/limited) — the cohort the focus targeted. */
  attendeePlayerIds: string[];
  attendanceRate: number;
  attendanceSampleN: number;
  /** Cohort focus-metric value across attendees BEFORE the practice (or null). */
  beforeValue: number | null;
  /** Cohort focus-metric value across attendees AFTER the practice (or null). */
  afterValue: number | null;
  /** Games/sessions the AFTER window rests on (drives confidence + honesty). */
  afterSampleN: number;
  publishedAt: string | null;
}

// -----------------------------------------------------------------------------
// Import-quality inputs — the import-quality generator reads recent import runs.
// -----------------------------------------------------------------------------

/** A recent import run summary. */
export interface ImportRunSummary {
  id: string;
  import_type: string;
  source_label: string;
  status: string; // uploaded|mapped|validated|committed|rolled_back|failed
  row_count: number;
  warning_count: number;
  error_count: number;
  created_at: string | null;
}
