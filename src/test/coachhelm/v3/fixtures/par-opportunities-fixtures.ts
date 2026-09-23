/**
 * Known-answer fixtures for `metrics/par-opportunities.ts` (addendum §13,
 * A3), reused by both the pure-core tests and the A7 Scoring surface's
 * view-model/component tests. `hole`/`shot`/`par5Play` mirror
 * `par-opportunities.test.ts`'s own inline helpers exactly — kept here so a
 * surface test can build a real `MetricResult[]` via `computeParOpportunities`
 * itself rather than hand-crafting result objects that could drift from the
 * function's actual output shape.
 */
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';

export function scope(playerId: string): AnalysisScope {
  return {
    player_id: playerId,
    window_start: null,
    window_end: null,
    analysis_cutoff: '2026-12-31T00:00:00.000Z',
  };
}

export function hole(
  overrides: Partial<HoleContext> & Pick<HoleContext, 'round_id' | 'hole_number' | 'par' | 'total_strokes'>,
): HoleContext {
  return {
    course_id: null,
    penalty_strokes: 0,
    putts: 2,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

export function shot(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
  return {
    shot_type: 'unknown',
    club_type: null,
    intent: 'unknown',
    distance_to_hole_before_feet: null,
    distance_to_hole_after_feet: null,
    lie_before: null,
    lie_after: null,
    result: null,
    is_penalty: false,
    putt_made: null,
    miss_direction: null,
    observed_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

/** A par-5 play: reaches the green at `greenShotNumber`, then holes out with
 *  `putts` putts. `putts: 0` means the green-reaching shot itself holed out
 *  directly (`result: 'hole'`, no separate putting shots appended). */
export function par5Play(opts: {
  round_id: string;
  course_id: string | null;
  hole_number: number;
  greenShotNumber: number;
  putts: 0 | 1 | 2 | 3;
  penaltyAtShot?: number;
}): { hole: HoleContext; facts: ShotFact[] } {
  const { round_id, course_id, hole_number, greenShotNumber, putts, penaltyAtShot } = opts;
  const totalStrokes = greenShotNumber + putts;
  const facts: ShotFact[] = [];
  for (let n = 1; n <= greenShotNumber; n++) {
    const isGreenShot = n === greenShotNumber;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: n,
        shot_type: n === penaltyAtShot ? 'unknown' : n === 1 ? 'tee' : 'approach',
        is_penalty: n === penaltyAtShot,
        result: isGreenShot ? (putts === 0 ? 'hole' : 'green') : 'fairway',
      }),
    );
  }
  for (let p = 1; p <= putts; p++) {
    const shotNumber = greenShotNumber + p;
    facts.push(
      shot({
        round_id,
        hole_number,
        shot_number: shotNumber,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        result: p === putts ? 'hole' : null,
        putt_made: p === putts,
      }),
    );
  }
  return {
    hole: hole({
      round_id,
      course_id,
      hole_number,
      par: 5,
      total_strokes: totalStrokes,
      penalty_strokes: penaltyAtShot ? 1 : 0,
      putts,
    }),
    facts,
  };
}

/** Five par-4 holes at 400 yd each — clears `PAR_LENGTH_MIN_SAMPLE_N` (5) on
 *  its own, so `par_length_scoring` emits both an `'all'` row and a `'mid'`
 *  band row (par 4's mid band is 380-429 yd) for par 4. Average
 *  strokes-relative-to-par: (0+1+0+1+0)/5 = +0.4. */
export const PAR4_MID_BAND_HOLES: HoleContext[] = [1, 2, 3, 4, 5].map((n) =>
  hole({
    round_id: `p4-r${n}`,
    hole_number: 4,
    par: 4,
    total_strokes: n % 2 === 0 ? 5 : 4,
    yardage: 400,
  }),
);

/** Two par-3 holes, no yardage recorded — well under the sample floor for
 *  any length band, so `par_length_scoring` emits only the `'all'` row for
 *  par 3, folded back rather than padded into a fabricated band. */
export const PAR3_ALL_ONLY_HOLES: HoleContext[] = [1, 2].map((n) =>
  hole({ round_id: `p3-r${n}`, hole_number: 3, par: 3, total_strokes: 3 }),
);
