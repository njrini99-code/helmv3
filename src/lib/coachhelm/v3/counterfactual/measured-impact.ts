/**
 * Measured per-round strokes impact for an insight row (audit defect 1).
 *
 * `evidence.strokes_impact` is what the feed ranks on. Until now four
 * generators always wrote 0 (approach_miss, par_scoring, putt_bias,
 * warmup_hole) and putt_distance only got a value when the DISPLAYED
 * counterfactual cleared its 0.3-stroke noise floor, so 77% of the ranked feed
 * was ordered by the priority floor instead of by strokes.
 *
 * The rule here is the same arithmetic the counterfactual uses, from the
 * player's own data:
 *
 *   strokes/round = attempts per round × rate gap to target × strokes per event
 *
 * It does NOT un-suppress the counterfactual line. A projection under the
 * 0.3-stroke floor still renders no "Closing this gap → …" copy (that is the
 * display contract in compute.ts); the row simply carries its measured,
 * small impact so it ranks on strokes instead of on priority.
 */

import { computeCounterfactual, type ComputeCounterfactualInput } from './compute';
import { getCounterfactualCeiling, getCounterfactualConfig } from './lookup-tables';
import { getExpectedStrokes, type LieType } from '@/lib/golf/strokes-gained';

/**
 * Strokes/round the player would save by closing the gap to the target the
 * counterfactual would use (plausible cohort → gender anchor → Tour), sized by
 * the player's OWN attempt rate. 0 when there is no gap, the metric is
 * unknown, or — for a metric that declares an attempt rate — the caller has
 * no real rate (the global per-unit constant is a tuning choice, not a
 * measurement, so it is never used here).
 */
export function measuredStrokesImpact(input: ComputeCounterfactualInput): number {
  const cfg = getCounterfactualConfig(input.metric_id);
  if (!cfg) return 0;
  const attempts = input.player_attempts_per_round;
  if (cfg.attempt_metric != null && !(attempts != null && Number.isFinite(attempts) && attempts > 0)) {
    return 0;
  }
  const p = computeCounterfactual(input);
  if (p.suppress_reason === 'no_gap' || p.suppress_reason === 'unknown_metric') return 0;
  const v = p.strokes_saved_per_round;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Per-round strokes lost to a rate gap, clamped to the metric's
 * counterfactual ceiling (or the global 2.5 default).
 *
 *   attemptsPerRound × max(0, targetPct − playerPct) / 100 × strokesPerEvent
 */
export function rateGapStrokes(args: {
  metricId: string;
  attemptsPerRound: number;
  playerPct: number;
  targetPct: number;
  strokesPerEvent: number;
}): number {
  const { attemptsPerRound, playerPct, targetPct, strokesPerEvent } = args;
  if (![attemptsPerRound, playerPct, targetPct, strokesPerEvent].every(Number.isFinite)) return 0;
  const gap = targetPct - playerPct;
  if (gap <= 0 || attemptsPerRound <= 0 || strokesPerEvent <= 0) return 0;
  const raw = attemptsPerRound * (gap / 100) * strokesPerEvent;
  const cfg = getCounterfactualConfig(args.metricId);
  const ceiling = cfg ? getCounterfactualCeiling(cfg) : 2.5;
  return Math.min(raw, ceiling);
}

/** A finish position an approach can leave: the lie and distance to the hole. */
export interface ApproachFinish {
  lie_after: string | null;
  distance_to_hole_after: number;
  distance_unit_after: string | null;
  is_penalty: boolean;
  /** Did the approach finish on the green? */
  on_green: boolean;
}

/**
 * Strokes value of hitting the green vs missing it from one band, measured on
 * the player's OWN finishes: mean expected strokes to hole out after a miss
 * minus the same after a hit, both read from the canonical expected-strokes
 * table (`getExpectedStrokes`, which mirrors the DB `sg_expected_strokes`). A
 * penalty miss carries its penalty stroke.
 *
 * Needs at least `minEach` hits AND misses; otherwise returns the table's
 * reference value for a typical miss (20 yd rough, 2.59) vs a typical hit
 * (30 ft putt, 1.98) = 0.61, and says so via `source`.
 */
export const REFERENCE_MISSED_GREEN_COST =
  getExpectedStrokes('rough', 20) - getExpectedStrokes('green', 10, true);

export function missedGreenCost(
  finishes: readonly ApproachFinish[],
  minEach = 3,
): { strokes: number; source: 'player_finishes' | 'reference' } {
  const hits: number[] = [];
  const misses: number[] = [];
  for (const f of finishes) {
    const d = Number(f.distance_to_hole_after);
    if (!Number.isFinite(d) || d < 0) continue;
    if (f.on_green) {
      // On-green finishes are stored in feet; getExpectedStrokes takes yards.
      const feet = f.distance_unit_after === 'yards' ? d * 3 : d;
      hits.push(getExpectedStrokes('green', feet / 3, true));
    } else {
      const yards = f.distance_unit_after === 'feet' ? d / 3 : d;
      const lie = offGreenLie(f.lie_after);
      misses.push(getExpectedStrokes(lie, yards) + (f.is_penalty ? 1 : 0));
    }
  }
  if (hits.length < minEach || misses.length < minEach) {
    return { strokes: REFERENCE_MISSED_GREEN_COST, source: 'reference' };
  }
  const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
  const cost = mean(misses) - mean(hits);
  // A miss that on average leaves an EASIER next shot than a hit is a data
  // artifact (mislabelled lies); fall back rather than rank on a negative cost.
  if (!(cost > 0)) return { strokes: REFERENCE_MISSED_GREEN_COST, source: 'reference' };
  return { strokes: cost, source: 'player_finishes' };
}

function offGreenLie(raw: string | null): LieType {
  const v = (raw ?? '').toLowerCase();
  if (v.includes('sand') || v.includes('bunker')) return 'sand';
  if (v === 'fairway' || v.includes('fringe') || v.includes('collar')) return 'fairway';
  return 'rough';
}
