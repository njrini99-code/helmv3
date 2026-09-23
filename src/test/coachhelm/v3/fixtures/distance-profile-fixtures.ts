/**
 * Known-answer fixtures for `metrics/distance-profile.ts` (addendum §13,
 * A2). Every scenario below states its expected numerator/denominator by
 * hand in a comment; `distance-profile.test.ts` asserts against those
 * numbers directly rather than re-deriving them from the fixture, so a
 * fixture change that silently shifts the answer is caught.
 */
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

const CUTOFF = '2026-08-01T00:00:00.000Z';

export function scope(playerId: string): AnalysisScope {
  return {
    player_id: playerId,
    window_start: null,
    window_end: null,
    analysis_cutoff: CUTOFF,
  };
}

/** A minimal, fully-specified approach ShotFact — only the fields a given
 *  test cares about need overriding. */
export function approachFact(overrides: Partial<ShotFact> & { round_id: string }): ShotFact {
  return {
    hole_number: 1,
    shot_number: 1,
    shot_type: 'approach',
    club_type: null,
    intent: 'unknown',
    distance_to_hole_before_feet: 300, // ~100 yd, well inside 50-125
    distance_to_hole_after_feet: 15,
    lie_before: 'fairway',
    lie_after: 'fairway',
    result: 'fairway',
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A minimal, fully-specified HoleContext — the `holes` argument
 *  `computeDistanceProfile` uses to resolve a 175+ yd shot's par (see
 *  distance-profile.ts's "WHY `holes: HoleContext[]` IS A REQUIRED THIRD
 *  ARGUMENT"). `par` is required here (not defaulted) since it's the
 *  whole reason a scenario supplies a hole at all. */
export function holeContext(
  overrides: Partial<HoleContext> & { round_id: string; hole_number: number; par: number },
): HoleContext {
  return {
    course_id: null,
    total_strokes: overrides.par,
    penalty_strokes: 0,
    putts: null,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

function yardsToFeet(yards: number): number {
  return yards * 3;
}

// ---------------------------------------------------------------------------
// Scenario A — 125-175 yd band, fully known-answer, exactly at the support
// floor (10 attempts, 3 distinct rounds).
// ---------------------------------------------------------------------------
// 6 green hits, after-feet = 10, 12, 14, 16, 18, 20 -> sum 90, avg 15.0.
// 4 misses: 2 carry a miss_direction, 2 don't. Of the 4 misses, exactly one
// is a penalty and one finishes in sand (both SEVERE); the other two are a
// plain fairway/rough miss (not severe).
//
// Expected (band 125_175ft):
//   green_hit_rate        = 6/10 * 100 = 60.0
//   on_green_proximity_ft = (10+12+14+16+18+20)/6 = 15.0
//   direction_coverage    = 2/4 * 100 = 50.0
//   severe_outcome_rate   = 2/10 * 100 = 20.0
//   measured_contribution = 10
export const SCENARIO_A_125_175: ShotFact[] = [
  // 6 green-hit shots, spread across 3 rounds.
  approachFact({ round_id: 'a-round-1', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 10, result: 'green', lie_after: 'green' }),
  approachFact({ round_id: 'a-round-1', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 12, result: 'green', lie_after: 'green' }),
  approachFact({ round_id: 'a-round-1', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 14, result: 'hole', lie_after: null }),
  approachFact({ round_id: 'a-round-2', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 16, result: 'gir', lie_after: null }),
  approachFact({ round_id: 'a-round-2', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 18, result: null, lie_after: 'green' }), // lie_after fallback
  approachFact({ round_id: 'a-round-3', distance_to_hole_before_feet: yardsToFeet(150), distance_to_hole_after_feet: 20, result: 'green', lie_after: 'green' }),
  // 4 missed shots.
  approachFact({ round_id: 'a-round-1', distance_to_hole_before_feet: yardsToFeet(150), result: 'fairway', lie_after: 'fairway', miss_direction: 'left', is_penalty: false }),
  approachFact({ round_id: 'a-round-2', distance_to_hole_before_feet: yardsToFeet(150), result: 'rough', lie_after: 'rough', miss_direction: 'short_right', is_penalty: false }),
  approachFact({ round_id: 'a-round-3', distance_to_hole_before_feet: yardsToFeet(150), result: 'rough', lie_after: 'rough', miss_direction: null, is_penalty: true }), // severe: penalty
  approachFact({ round_id: 'a-round-3', distance_to_hole_before_feet: yardsToFeet(150), result: 'sand', lie_after: 'sand', miss_direction: null, is_penalty: false }), // severe: sand
];

// ---------------------------------------------------------------------------
// Scenario B — 50-125 yd band, UNDER the attempts floor (8 < MIN_ATTEMPTS=10).
// Every rate metric must come back null; measured_contribution must still
// report 8 (never null — that's the point of the metric).
// ---------------------------------------------------------------------------
export const SCENARIO_B_UNDER_ATTEMPTS_50_125: ShotFact[] = Array.from({ length: 8 }, (_, i) =>
  approachFact({
    round_id: `b-round-${(i % 4) + 1}`, // 4 distinct rounds — rounds floor is NOT the failing one here
    distance_to_hole_before_feet: yardsToFeet(80),
    result: i < 3 ? 'green' : 'fairway',
    lie_after: i < 3 ? 'green' : 'fairway',
  }),
);

// ---------------------------------------------------------------------------
// Scenario C — 175+ yd band, clears ATTEMPTS but not ROUNDS (12 attempts,
// only 2 distinct rounds — MIN_ROUNDS=3 fails despite MIN_ATTEMPTS=10 OK).
// Both holes are a known par 4 (never 5), so none of the 12 shots are
// excluded as a lay-up or as missing_par — the ONLY thing failing here is
// the rounds floor.
// ---------------------------------------------------------------------------
export const SCENARIO_C_UNDER_ROUNDS_175_PLUS: ShotFact[] = Array.from({ length: 12 }, (_, i) =>
  approachFact({
    round_id: i < 6 ? 'c-round-1' : 'c-round-2', // only 2 distinct rounds
    hole_number: 9,
    distance_to_hole_before_feet: yardsToFeet(200),
    result: 'fairway',
    lie_after: 'fairway',
  }),
);
export const SCENARIO_C_HOLES: HoleContext[] = [
  holeContext({ round_id: 'c-round-1', hole_number: 9, par: 4 }),
  holeContext({ round_id: 'c-round-2', hole_number: 9, par: 4 }),
];

// ---------------------------------------------------------------------------
// Scenario D — 175+ yd band, the lay-up / missing-par exclusion. Three shots:
//   d1: par-5 hole (KNOWN), missed the green -> a LIKELY LAY-UP.
//   d2: par-4 hole (KNOWN), missed the green -> never a lay-up (not a par 5).
//   d3: par-5 hole (KNOWN), FOUND the green -> never a lay-up (isOnGreen).
// With SCENARIO_D_HOLES (all three holes resolvable): attempts=2 (d2, d3),
// layupExcludedN=1 (d1), missingParExcludedN=0.
// With holes=[] (none resolvable): attempts=0, layupExcludedN=0,
// missingParExcludedN=3 — every shot is excluded, none silently kept.
// ---------------------------------------------------------------------------
export const SCENARIO_D_LAYUP_175_PLUS: ShotFact[] = [
  approachFact({ round_id: 'd1-round', hole_number: 5, distance_to_hole_before_feet: yardsToFeet(200), result: 'fairway', lie_after: 'fairway' }),
  approachFact({ round_id: 'd2-round', hole_number: 6, distance_to_hole_before_feet: yardsToFeet(210), result: 'rough', lie_after: 'rough' }),
  approachFact({ round_id: 'd3-round', hole_number: 7, distance_to_hole_before_feet: yardsToFeet(190), distance_to_hole_after_feet: 25, result: 'green', lie_after: 'green' }),
];
export const SCENARIO_D_HOLES: HoleContext[] = [
  holeContext({ round_id: 'd1-round', hole_number: 5, par: 5 }),
  holeContext({ round_id: 'd2-round', hole_number: 6, par: 4 }),
  holeContext({ round_id: 'd3-round', hole_number: 7, par: 5 }),
];
/** Only d1's hole is resolvable — used to prove exclusion is resolved
 *  PER SHOT: d1 becomes a layup exclusion, d2/d3 become missing_par. */
export const SCENARIO_D_HOLES_PARTIAL: HoleContext[] = [
  holeContext({ round_id: 'd1-round', hole_number: 5, par: 5 }),
];

// ---------------------------------------------------------------------------
// Scenario E — band boundaries (before-distance in yards; hi exclusive,
// lo inclusive, matching bucketApproachDistance exactly):
//   49.9 -> no band (below the 50 yd floor)
//   50.0 -> 50_125ft
//   124.9 -> 50_125ft
//   125.0 -> 125_175ft
//   174.9 -> 125_175ft
//   175.0 -> 175_plus_ft
// ---------------------------------------------------------------------------
export const SCENARIO_E_BOUNDARIES: Record<string, ShotFact> = {
  below_floor_49_9: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(49.9) }),
  lower_bound_50_0: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(50.0) }),
  just_under_125: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(124.9) }),
  lower_bound_125_0: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(125.0) }),
  just_under_175: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(174.9) }),
  lower_bound_175_0: approachFact({ round_id: 'e-round', distance_to_hole_before_feet: yardsToFeet(175.0) }),
};
/** The `lower_bound_175_0` fixture lands in the 175+ band, so a resolvable,
 *  non-par-5 hole is required or it would be excluded as `missing_par`
 *  rather than counted — that exclusion isn't what this scenario tests. */
export const SCENARIO_E_HOLES: HoleContext[] = [holeContext({ round_id: 'e-round', hole_number: 1, par: 4 })];
