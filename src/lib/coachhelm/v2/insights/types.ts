/**
 * Canonical types for evidence-backed insights.
 *
 * Source of truth: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 * Every Tier-1 insight generator imports these from here — do not redeclare
 * the shapes in generator files.
 */

import type { InsightPriority } from '@/lib/coachhelm/insight-types';
// Re-export so v3 callers (engine/types, synthesis) resolve InsightPriority from one place.
export type { InsightPriority };

export type InsightCategory =
  | 'putting'
  | 'tee'
  | 'approach'
  | 'short_game'
  | 'scoring'
  | 'pressure'
  | 'course_management';

export type InsightUnit = 'percent' | 'strokes' | 'count' | 'yards' | 'feet';

/**
 * Canonical set of comparison sources for evidence cards.
 *
 * Every generator MUST emit one of these values. The BaselineRegistry
 * (`src/lib/coachhelm/v2/insights/baseline-registry.ts`) enforces
 * label/source/value consistency — generators look up an entry by
 * BaselineKey and spread the result into the evidence object so the
 * three fields cannot disagree.
 *
 * - your_baseline:    compared to the player's own rolling history
 * - team_avg:         compared to teammates' aggregated rolling stats
 * - d1_avg / d2_avg / d3_avg / naia_avg / juco_avg: college-division benchmarks
 * - pga_baseline:     PGA Tour benchmark
 * - absolute_target:  a known target value (par, uniform distribution, etc.)
 *
 * `peer_percentile` was removed in 2026-05-17 (audit finding Q-NEW-12) —
 * it was being used against fixed reference points (uniform 4-way
 * distribution, balanced left/right) which are absolute targets, not
 * percentiles.
 */
export type InsightComparisonSource =
  | 'd2_avg'
  | 'd1_avg'
  | 'd3_avg'
  | 'naia_avg'
  | 'juco_avg'
  | 'your_baseline'
  | 'team_avg'
  | 'pga_baseline'
  | 'absolute_target';

/** Runtime tuple matching {@link InsightComparisonSource} for validation. */
export const COMPARISON_SOURCES = [
  'your_baseline',
  'team_avg',
  'd1_avg',
  'd2_avg',
  'd3_avg',
  'naia_avg',
  'juco_avg',
  'pga_baseline',
  'absolute_target',
] as const satisfies readonly InsightComparisonSource[];

/** Stable lookup key in the BaselineRegistry: `${source}.${bucket}`. */
export type BaselineKey = `${InsightComparisonSource}.${string}`;

export type InsightStrokesImpactMethod =
  | 'sg_baseline'
  | 'historical_correlation'
  | 'peer_delta'
  | 'rough_estimate';

export type InsightLifecycleState =
  | 'tentative'
  | 'detected'
  | 'matured'
  | 'addressed'
  | 'resolved'
  | 'archived';

export interface InsightConfidenceFactors {
  /** sample_n / target_n, capped at 1 */
  sample_adequacy: number;
  /** 1 if all within window_days/2; <1 if older-weighted */
  recency: number;
  /** 1 - (your_stddev / comparison_stddev), capped 0..1 */
  variance: number;
  /**
   * SV-1 honesty flag. Tri-state:
   * - `undefined` (default): legacy 3-factor blend — backward-compatible with
   *   every existing caller (v2 miners, the lifecycle cron's recency decay).
   * - `false`: `recency`/`variance` are placeholders (the v3 generators stamp
   *   recency=1.0/variance=0.5 because the aggregate carries no per-round
   *   dispersion or round dates). {@link calcConfidence} then drops both and
   *   surfaces honest sample-adequacy instead of a fabricated +0.45 floor.
   * - `true`: both are genuinely measured (per-round stddev + round-date spread)
   *   — blended at full weight, same as legacy.
   * `generator-base.run()` is the only writer today: it stamps `false` for
   *   placeholder rows and `true` when it computes real factors.
   */
  factors_measured?: boolean;
}

export interface InsightEvidence {
  // What was measured
  metric: string;
  metric_label: string;
  unit: InsightUnit;

  // Your number
  your_value: number;
  your_value_display: string;

  // What you're being compared to (primary tick — typically team_avg)
  comparison_value: number;
  comparison_label: string;
  comparison_source: InsightComparisonSource;

  // Optional secondary tick — typically the PGA Tour benchmark for the same
  // metric. The EvidencePanel renders it as a second tick on the same scale
  // so the player can see where the team avg sits relative to Tour grade.
  secondary_value?: number;
  secondary_label?: string;
  secondary_source?: InsightComparisonSource;

  // Sample / window
  sample_n: number;
  window_days: number;
  window_start: string; // ISO
  window_end: string;   // ISO

  // Impact
  strokes_impact: number;
  strokes_impact_method: InsightStrokesImpactMethod;

  // Confidence
  confidence: number; // 0..1
  confidence_factors: InsightConfidenceFactors;

  // Generator-specific drill-down detail (optional)
  detail?: Record<string, unknown>;
}

export interface InsightMovement {
  from: number;
  to: number;
  direction: 'up' | 'down';
  percent_change: number; // signed fraction (e.g. 0.12 = +12%, -0.08 = -8%)
}

export interface InsightInput {
  player_id: string | null;
  coach_id?: string | null;
  team_id?: string | null;
  category: InsightCategory;
  insight_type?: string;
  signature: string;
  title: string;
  content: string;
  evidence: InsightEvidence;
  metadata?: Record<string, unknown>;
  drill_tags?: string[];
  /** Severity hint. Absent → the DB default 'medium' stands. Composites pass
   *  rule.priority; single-metric generators pass a computed value via
   *  ComposedContent.priority. The existing-row UPDATE path never writes it
   *  (coach/triage intent is preserved). */
  priority?: InsightPriority;
}

/**
 * Standard confidence calculation (Rule 1 of the design contract).
 * Every generator must use this — do not inline variants.
 *
 * SV-1: the historical blend `0.4·sample + 0.3·recency + 0.3·variance` silently
 * added a fabricated +0.45 floor whenever generators stamped the recency=1.0 /
 * variance=0.5 placeholders. When `confidence_factors.factors_measured === false`
 * those two are known-placeholders, so we drop the fabricated +0.45 and surface
 * honest sample-adequacy (dropped weight redistributes → a true weighted
 * average, never a floor). A genuinely DECAYED recency (`< 1`, written by the
 * lifecycle cron from real row age) is still honored under that flag, so a
 * matured row's confidence keeps falling with age — variance stays dropped.
 * `undefined` (the default) keeps the legacy blend for backward compatibility:
 * every v2 miner is unchanged. `true` means both factors are genuinely measured.
 */
export function calcConfidence(
  evidence: Pick<InsightEvidence, 'confidence_factors'>,
): number {
  const { sample_adequacy, recency, variance, factors_measured } =
    evidence.confidence_factors;

  // Honest mode: placeholders explicitly flagged unmeasured. Drop the fabricated
  // variance; keep sample adequacy. A real age-decayed recency (< 1) still
  // counts — redistribute weight across the two honest terms (no +0.45 floor).
  if (factors_measured === false) {
    if (recency < 1) {
      return (0.4 * sample_adequacy + 0.3 * recency) / 0.7;
    }
    return Math.max(0, Math.min(1, sample_adequacy));
  }

  // Legacy / fully-measured blend (default).
  return 0.4 * sample_adequacy + 0.3 * recency + 0.3 * variance;
}
