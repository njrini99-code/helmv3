/**
 * Pure (no Supabase) list of the goal metrics we track over the GOAL WINDOW
 * rather than the all-time standing. Kept dependency-free so client components
 * (e.g. FairwayGoalCard) can branch on it without pulling the server-only
 * window-metric loader — and its Supabase imports — into the client bundle.
 *
 * Coverage rationale lives in ./window-metric.ts. Putt-make-% by band,
 * approach proximity by band, per-par scoring and putt bias are deliberately
 * EXCLUDED: their canonical values come from DB functions whose band
 * boundaries differ from the TS shot calculator, so a windowed recomputation
 * would diverge from the standing the rest of the app shows.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export const WINDOWED_METRIC_IDS: ReadonlySet<MetricId> = new Set<MetricId>([
  'sg_total',
  'sg_ott',
  'sg_approach',
  'sg_around_green',
  'sg_putting',
  'gir_pct',
  'scrambling_pct_sand',
  'penalty_rate_per_round',
]);

/** True when a goal on this metric is tracked over its window, not all-time. */
export function isWindowedMetric(metricId: MetricId): boolean {
  return WINDOWED_METRIC_IDS.has(metricId);
}
