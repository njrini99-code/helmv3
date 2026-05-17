/**
 * Canonical types for evidence-backed insights.
 *
 * Source of truth: docs/superpowers/plans/2026-04-22-insight-quality/00-design-contract.md
 * Every Tier-1 insight generator imports these from here — do not redeclare
 * the shapes in generator files.
 */

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
}

/**
 * Standard confidence calculation (Rule 1 of the design contract).
 * Every generator must use this — do not inline variants.
 */
export function calcConfidence(
  evidence: Pick<InsightEvidence, 'confidence_factors'>,
): number {
  const { sample_adequacy, recency, variance } = evidence.confidence_factors;
  return 0.4 * sample_adequacy + 0.3 * recency + 0.3 * variance;
}
