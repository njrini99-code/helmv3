/**
 * v3 per-gender / per-level cohort anchor tables.
 *
 * Replaces the men's-only hardcoded Tour constants previously duplicated in
 * each generator (putt-distance PGA_MAKE_PCT_BY_BUCKET, approach-miss
 * TOUR_GREEN_HIT_PCT, scrambling comparison_value 50, par-type Tour values).
 *
 * WHY THIS EXISTS (audit DC-GENDER-1): every anchor was a men's PGA Tour value.
 * A women's-team player (e.g. Grace Saunders, team gender='womens') was gapped
 * to a men's sand-save of 50% — fabricating a ~1.5 stroke "leak" where the real
 * women's-college target is ~38%. The synthetic app-population cohort that was
 * meant to fix this is worse (sand-save level_avg 14.8% on the prod snapshot),
 * so we anchor to a controlled per-gender/level table instead.
 *
 * SOURCES (documented, never asserted):
 *   - Women's make-% / green-hit: LPGA ShotLink public season aggregates,
 *     scaled to college-women by the same ratio men's-college sits below men's
 *     Tour (~0.92 on make %, ~0.88 on green-hit). Conservative — always between
 *     the synthetic cohort and the men's Tour value.
 *   - Sand-save women's college ~38%: NCAA women's golf stat reports + LPGA ~45%
 *     discounted to college.
 *   - Men's values: the existing Tour anchors verified live against
 *     golf_pga_standards on 2026-06-06 — kept identical so men's teams are
 *     UNCHANGED.
 *
 * `cohortAnchor(metric, gender)` returns the realistic target in the metric's
 * stored unit, or null when no anchor exists (caller falls back to pga_value).
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';

export type CohortGender = 'mens' | 'womens';

/** Anchor pair: the men's Tour value and the women's-college target. */
interface GenderAnchor {
  mens: number;
  womens: number;
}

/**
 * Per-metric (gender) anchors in the metric's stored unit (percent points,
 * feet, strokes). Only metrics whose generators previously hardcoded a men's
 * Tour constant are listed; everything else falls through to `pga_value`.
 */
const COHORT_ANCHORS: Partial<Record<MetricId, GenderAnchor>> = {
  // Putt make % by distance — men's = golf_pga_standards (verified 2026-06-06);
  // women's = LPGA-derived college targets (between synthetic cohort and men's).
  putts_made_3_5ft_pct:      { mens: 90.5, womens: 84.0 },
  putts_made_5_10ft_pct:     { mens: 62.2, womens: 52.0 },
  putts_made_10_15ft_pct:    { mens: 35.7, womens: 28.0 },
  putts_made_15_25ft_pct:    { mens: 15.4, womens: 11.0 },
  putts_made_25_plus_ft_pct: { mens: 5.5,  womens: 4.0  },

  // Approach green-hit % (approximate band anchors; women's discounted ~0.88).
  approach_proximity_50_125ft:    { mens: 80, womens: 70 },
  approach_proximity_125_175ft:   { mens: 65, womens: 56 },
  approach_proximity_175_plus_ft: { mens: 50, womens: 42 },

  // Sand save % — the headline fix. Men's Tour ~50%, women's college ~38%.
  scrambling_pct_sand:    { mens: 50, womens: 38 },
  scrambling_pct_rough:   { mens: 60, womens: 50 },
  scrambling_pct_fairway: { mens: 67, womens: 58 },

  // GIR % — men's Tour ~66%, women's college ~60%.
  gir_pct: { mens: 66, womens: 60 },
};

/**
 * Realistic target for a metric given the player's cohort gender, in the
 * metric's stored unit. Returns null when no anchor is defined (the caller
 * keeps using the DB pga_value). Men's anchors are the unchanged Tour values.
 */
export function cohortAnchor(
  metricId: MetricId | string,
  gender: CohortGender,
): number | null {
  const a = (COHORT_ANCHORS as Record<string, GenderAnchor | undefined>)[metricId];
  if (!a) return null;
  return gender === 'womens' ? a.womens : a.mens;
}
