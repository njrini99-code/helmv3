/**
 * ============================================================================
 * Team skill-area → canonical v3 MetricId map
 * ----------------------------------------------------------------------------
 * The team-category surface (getTeamCategoryInsights) keys its 5 areas by
 * stats-cache column names (`primaryMetric`), NOT the v3 metric registry. The
 * drill library (`golf_drills.impacts_metric_id`) is keyed by the v3 registry.
 * This map bridges the two so "generate a practice plan for <area>" can load
 * the drills tagged to that area's representative strokes-gained metric.
 *
 * Representative, not exhaustive: a low area rating can stem from several
 * metrics, but the headline SG metric for the area is the honest, stable target
 * for a team practice plan. Pure constants — server- and client-safe.
 * ========================================================================== */

import { isMetricId, type MetricId } from '@/lib/coachhelm/v3/metrics/registry';

/** The 5 team category ids → their representative SG metric in the v3 registry. */
const AREA_TO_METRIC: Record<string, MetricId> = {
  driving: 'sg_ott',
  approach: 'sg_approach',
  short_game: 'sg_around_green',
  putting: 'sg_putting',
  scoring: 'sg_total',
};

/** Resolve an area id to its canonical MetricId, or null if unknown/invalid. */
export function metricForArea(areaId: string | null | undefined): MetricId | null {
  if (!areaId) return null;
  const m = AREA_TO_METRIC[areaId];
  return m && isMetricId(m) ? m : null;
}

/**
 * Whether a SMALLER per-player value is BETTER in this area (drives the
 * contributing-players sort + the "who's dragging" read). Putting (putts/round)
 * and scoring (strokes vs par) are lower-is-better; the % areas are higher.
 */
export function areaLowerIsBetter(areaId: string): boolean {
  return areaId === 'putting' || areaId === 'scoring';
}

/** Short display label for the area's representative SG metric (goal/target UI). */
export const AREA_METRIC_LABEL: Record<string, string> = {
  driving: 'Off-the-tee SG',
  approach: 'Approach SG',
  short_game: 'Around-green SG',
  putting: 'Putting SG',
  scoring: 'Total SG',
};

/** Per-area formatter for a player's raw `value` (mirrors TeamCategoryView). */
export const AREA_VALUE_FORMAT: Record<string, (v: number) => string> = {
  driving: (v) => `${v.toFixed(0)}%`,
  approach: (v) => `${v.toFixed(0)}%`,
  short_game: (v) => `${v.toFixed(0)}%`,
  putting: (v) => v.toFixed(1),
  scoring: (v) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1)),
};
