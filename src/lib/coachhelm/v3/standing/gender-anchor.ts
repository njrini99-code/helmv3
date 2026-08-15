/**
 * Gender-aware standing anchor override (audit P1 + P3).
 *
 * WHY THIS EXISTS
 * ---------------
 * The standing PIPELINE (golf_player_standing.pga_value, written by the
 * refresh_player_standing* RPCs and read by loadStandingForMetric →
 * evidence.standing → StandingBar) is gender-BLIND: every pga_value is the
 * men's golf_pga_standards Tour value. A women's-team player (e.g. Grace
 * Saunders, team gender='womens') therefore renders the men's anchor on the
 * StandingBar — sand-save bar against 50% — while the SAME card's prose +
 * counterfactual already use the women's anchor (38%) via the generators'
 * COHORT_ANCHORS path (cohort-baselines.ts). Two contradictory benchmarks on
 * one card (audit P1, insight 994ee861).
 *
 * The DB pipeline is intentionally left untouched: the men's pga_value is the
 * RAW, correct value for men's / unknown-cohort players, and the
 * level_avg/level_pct gender split is handled separately in a refresh RPC
 * migration. This module is a pure READ-LEVEL override so the card is
 * self-consistent without re-plumbing the RPCs.
 *
 * WHAT IT DOES
 * ------------
 * `applyGenderAnchor(standing, gender)`:
 *   - gender = 'mens' / unknown   → returns the standing UNCHANGED (men's teams
 *     keep the exact DB pga_value — no behavior change).
 *   - gender = 'womens' AND a women's anchor exists in COHORT_ANCHORS for the
 *     metric → overrides pga_value with the women's anchor and recomputes
 *     pga_delta against it (player_value − womens_anchor). This is the SAME
 *     anchor table + the SAME resolution the generators use, so bar and prose
 *     agree.
 *   - gender = 'womens' AND NO women's anchor exists (course_management:
 *     big_number_rate / penalty_rate_per_round; par-type: scoring_par_*) → the
 *     men's Tour value would MISLEAD, and no credible women's-college baseline
 *     exists in docs/v3-research-golf-domain.md to substitute. Per the audit's
 *     "honesty over coverage" rule we OMIT rather than fabricate: the returned
 *     standing carries `pga_omitted: true` so the render layer can suppress the
 *     PGA marker for this woman instead of drawing a wrong one. pga_value is
 *     left as-is (the type is non-nullable) but pga_omitted is the source of
 *     truth for "should the reference marker render".
 *
 * Men's / unknown cohorts NEVER get `pga_omitted` set — their reference marker
 * always renders, unchanged.
 */

import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { cohortAnchor, type CohortGender } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';

import { pgaReferenceValue, type PgaStandard } from './pga-standards';
import type { PlayerStanding } from './types';

/**
 * The real LPGA rows, keyed by metric. Pass `loadStandardsForTour('lpga')`.
 *
 * MUST be LPGA-ONLY — do not pass `loadStandardsForGender('womens')` here.
 * That helper merges PGA in as a per-metric fallback, which is right for
 * surfaces that just need "the best available number", and wrong here: a
 * missing LPGA row must fall through to the estimate table and then to
 * OMISSION, never to the men's value. See the resolution order below.
 */
export type LpgaStandards = ReadonlyMap<MetricId, PgaStandard>;

/**
 * Apply the gender-correct Tour anchor to a single standing row.
 *
 * Pure — no IO, no throw. The cohort gender is resolved by the caller
 * (loadPlayerCohort, the same path the generators use), and the LPGA standards
 * map is loaded once per read by the caller and threaded in, so this stays
 * synchronous and its callers can keep applying it inside a loop.
 *
 * WOMEN'S RESOLUTION ORDER (owner decision 2026-08-15: PGA for men, LPGA for
 * women — both anchored to their own professional tour, symmetric):
 *   1. the real LPGA row from golf_pga_standards, when `lpga` is supplied
 *   2. the hand-authored estimate in cohort-baselines.ts
 *   3. omission (`pga_omitted: true`) — never the men's value
 *
 * Step 2 is retained deliberately, not as dead weight: it is what runs when a
 * caller supplies no map (every existing 2-arg call site, including the older
 * tests), so behaviour is unchanged for anyone who has not opted in.
 */
export function applyGenderAnchor(
  standing: PlayerStanding,
  gender: CohortGender,
  lpga?: LpgaStandards | null,
): PlayerStanding {
  // Men's / unknown: exact DB value, no override, marker always renders.
  if (gender !== 'womens') {
    return standing;
  }

  // 1. Real LPGA row. This is the case the estimate table was standing in for.
  //    It also FIXES A UNIT BUG the estimates carry: cohort-baselines.ts stores
  //    approach_proximity_* as a green-hit PERCENT (80/70), but the registry
  //    types those metrics `lower_better` and the DB stores them as PROXIMITY
  //    IN FEET (PGA 18ft, LPGA 26ft). A woman at 25ft was being measured
  //    against "70" read as feet — scoring her 45ft better than tour on a
  //    metric where she was actually behind. Reading the same table and column
  //    the men's path reads removes the whole class of mismatch.
  const lpgaRow = lpga?.get(standing.metric_id);
  const lpgaAnchor = lpgaRow ? pgaReferenceValue(lpgaRow) : null;
  if (lpgaAnchor !== null) {
    return {
      ...standing,
      pga_value: lpgaAnchor,
      pga_delta: standing.player_value - lpgaAnchor,
      pga_omitted: false,
      is_womens: true,
    };
  }

  // 2. Fall back to the hand-authored estimate.
  const womensAnchor = cohortAnchor(standing.metric_id, 'womens');

  // Women's anchor exists → override pga_value + recompute the signed delta
  // so the StandingBar reference marker AND the prose both read the women's
  // number. Direction-agnostic: pga_delta is always player_value − reference
  // (sign interpreted downstream via golf_metrics.direction), matching the RPC.
  if (womensAnchor !== null) {
    return {
      ...standing,
      pga_value: womensAnchor,
      pga_delta: standing.player_value - womensAnchor,
      pga_omitted: false,
      // LPGA wire-up (2026-06-10): render layers label the reference "LPGA".
      is_womens: true,
    };
  }

  // No credible women's anchor (course_management, par-type scoring): the men's
  // value would mislead and we will not fabricate one. Flag for omission so the
  // render layer drops the reference marker for this woman.
  return {
    ...standing,
    pga_omitted: true,
    is_womens: true,
  };
}

/**
 * Map variant of {@link applyGenderAnchor} — applies the override to every row
 * in a player's standing map in place-free fashion (returns a NEW map).
 * Convenience for the loadPlayerStandingMap read path.
 */
export function applyGenderAnchorToMap(
  map: Map<MetricId, PlayerStanding>,
  gender: CohortGender,
  lpga?: LpgaStandards | null,
): Map<MetricId, PlayerStanding> {
  if (gender !== 'womens') return map;
  const out = new Map<MetricId, PlayerStanding>();
  for (const [metric, standing] of map) {
    out.set(metric, applyGenderAnchor(standing, gender, lpga));
  }
  return out;
}
