/**
 * A0 counterexample fixtures (repair-plan addendum §13, work package A0).
 *
 * Seven concrete scenarios a metric registry has to explain: for each, a
 * reviewer should be able to say why it IS eligible for some metrics and
 * NOT eligible for others, without reading generator code. `shot-context
 * .test.ts` (A1) runs these raw shots through `normalizeShot` and
 * `buildHoleSequence` to prove the pure core handles each one explicitly
 * rather than by accident. No production data or DB access here — every
 * value below is hand-authored to make one specific point.
 *
 * Every fixture carries the SOURCE observation time on each shot
 * (`observed_at`) and one FIXED `analysis_cutoff` in its `scope`, so a
 * fixture's expected result stays reproducible independent of when a test
 * happens to run — see `AnalysisScope`'s doc comment in `types.ts`.
 */

import type { RawShotInput } from '@/lib/coachhelm/v3/context/normalize-shot';
import type { AnalysisScope, HoleContext } from '@/lib/coachhelm/v3/context/types';

export interface SituationalFixture {
  readonly name: string;
  readonly description: string;
  readonly scope: AnalysisScope;
  /** Usually one hole; the two-course fixture carries two. */
  readonly holes: readonly HoleContext[];
  readonly rawShots: readonly RawShotInput[];
}

const CUTOFF = '2026-08-01T00:00:00.000Z';

function scope(playerId: string): AnalysisScope {
  return {
    player_id: playerId,
    window_start: '2026-05-01',
    window_end: '2026-07-31',
    analysis_cutoff: CUTOFF,
  };
}

// ---------------------------------------------------------------------------
// 1. Two-course same-hole-number pair
// ---------------------------------------------------------------------------
// Two different courses each have a "hole 7" with a different par. Grouping
// by `hole_number` alone would silently merge them into one nonsense
// specific-hole record (evidence contract's "Specific-hole scoring" row).
// `holeIdentityKey` must return two DIFFERENT keys here even though the
// number matches, and must never treat these as the same hole.
const TWO_COURSE_HOLE_A: HoleContext = {
  round_id: 'round-course-a',
  course_id: 'course-a',
  hole_number: 7,
  par: 4,
  total_strokes: 3,
  penalty_strokes: 0,
  yardage: null,
  putts: 1,
  gir: true,
  yardage: null,
};
const TWO_COURSE_HOLE_B: HoleContext = {
  round_id: 'round-course-b',
  course_id: 'course-b',
  hole_number: 7, // same number as HOLE_A, on a DIFFERENT course
  par: 3,
  total_strokes: 2,
  penalty_strokes: 0,
  yardage: null,
  putts: 1,
  gir: true,
  yardage: null,
};
const twoCourseSameHoleNumber: SituationalFixture = {
  name: 'two_course_same_hole_number',
  description:
    'Course A hole 7 (par 4, 3 shots) and Course B hole 7 (par 3, 2 shots) — same ' +
    'hole_number, different courses, different par. holeIdentityKey must ' +
    "distinguish them; grouping by hole_number alone would merge one course's " +
    "birdie into another's par.",
  scope: scope('player-two-course'),
  holes: [TWO_COURSE_HOLE_A, TWO_COURSE_HOLE_B],
  rawShots: [
    {
      round_id: 'round-course-a',
      hole_number: 7,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 400,
      distance_unit_before: 'yards',
      distance_to_hole_after: 150,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-06-01T14:00:00.000Z',
    },
    {
      round_id: 'round-course-a',
      hole_number: 7,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 150,
      distance_unit_before: 'yards',
      distance_to_hole_after: 8,
      distance_unit_after: 'feet',
      lie_before: 'fairway',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-01T14:03:00.000Z',
    },
    {
      round_id: 'round-course-a',
      hole_number: 7,
      shot_number: 3,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 8,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-01T14:05:00.000Z',
    },
    {
      round_id: 'round-course-b',
      hole_number: 7,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'non_driver',
      distance_to_hole_before: 165,
      distance_unit_before: 'yards',
      distance_to_hole_after: 12,
      distance_unit_after: 'feet',
      lie_before: 'tee',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-08T09:10:00.000Z',
    },
    {
      round_id: 'round-course-b',
      hole_number: 7,
      shot_number: 2,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 12,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-08T09:12:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 2. Par-5 layup
// ---------------------------------------------------------------------------
// A deliberate lay-up approach (explicitly tagged `intent: 'layup'` by the
// ingest layer — never inferred here) followed by a real go-for-green
// approach. Pooling the layup with the go-for-green shot as though both were
// the same kind of attempt understates approach skill (evidence contract's
// 175+ ft band note); A1 must carry the distinction through untouched.
const PAR_5_HOLE: HoleContext = {
  round_id: 'round-par5',
  course_id: 'course-c',
  hole_number: 12,
  par: 5,
  total_strokes: 4,
  penalty_strokes: 0,
  yardage: null,
  putts: 1,
  gir: true,
  yardage: null,
};
const par5Layup: SituationalFixture = {
  name: 'par_5_layup',
  description:
    'Par-5 birdie: tee, a deliberate lay-up approach (intent explicitly ' +
    "tagged, not inferred), a go-for-green approach, one putt. The lay-up's " +
    'miss (fairway, not green) must not count against approach-accuracy the ' +
    'same way the go-for-green shot would.',
  scope: scope('player-par5'),
  holes: [PAR_5_HOLE],
  rawShots: [
    {
      round_id: 'round-par5',
      hole_number: 12,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 560,
      distance_unit_before: 'yards',
      distance_to_hole_after: 350,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-06-10T15:00:00.000Z',
    },
    {
      round_id: 'round-par5',
      hole_number: 12,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 350,
      distance_unit_before: 'yards',
      distance_to_hole_after: 110,
      distance_unit_after: 'yards',
      lie_before: 'fairway',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      intent: 'layup',
      observed_at: '2026-06-10T15:04:00.000Z',
    },
    {
      round_id: 'round-par5',
      hole_number: 12,
      shot_number: 3,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 110,
      distance_unit_before: 'yards',
      distance_to_hole_after: 8,
      distance_unit_after: 'feet',
      lie_before: 'fairway',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-10T15:07:00.000Z',
    },
    {
      round_id: 'round-par5',
      hole_number: 12,
      shot_number: 4,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 8,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-10T15:09:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 3. Par-3 tee shot with a green attempt
// ---------------------------------------------------------------------------
// A clean par: the TEE shot is itself the green attempt (no separate
// approach shot exists on a par 3), then two putts. Proves shot_type/intent
// normalization doesn't assume "tee shot" implies "not an approach attempt".
const PAR_3_HOLE: HoleContext = {
  round_id: 'round-par3',
  course_id: 'course-d',
  hole_number: 3,
  par: 3,
  total_strokes: 3,
  penalty_strokes: 0,
  yardage: null,
  putts: 2,
  gir: true,
  yardage: null,
};
const par3TeeGreenAttempt: SituationalFixture = {
  name: 'par_3_tee_green_attempt',
  description:
    'Par-3 par: the TEE shot is the green attempt (no approach shot exists ' +
    'on this hole), then two putts. shot_type must stay "tee" even though ' +
    "intent is 'go_for_green' — the two fields answer different questions.",
  scope: scope('player-par3'),
  holes: [PAR_3_HOLE],
  rawShots: [
    {
      round_id: 'round-par3',
      hole_number: 3,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'non_driver',
      distance_to_hole_before: 175,
      distance_unit_before: 'yards',
      distance_to_hole_after: 15,
      distance_unit_after: 'feet',
      lie_before: 'tee',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-14T11:00:00.000Z',
    },
    {
      round_id: 'round-par3',
      hole_number: 3,
      shot_number: 2,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 15,
      distance_unit_before: 'feet',
      distance_to_hole_after: 3,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'green',
      result: null,
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-14T11:02:00.000Z',
    },
    {
      round_id: 'round-par3',
      hole_number: 3,
      shot_number: 3,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 3,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-14T11:03:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 4. Explicit penalty pair
// ---------------------------------------------------------------------------
// Two penalty shots on the SAME hole (double water hazard). Both stay
// ordered in the sequence (shot_number 2 and 3) and neither's `result` is a
// green-finding value — proves penalty events never masquerade as normal
// green attempts even when there's more than one.
const PENALTY_HOLE: HoleContext = {
  round_id: 'round-penalty',
  course_id: 'course-e',
  hole_number: 9,
  par: 5,
  total_strokes: 6,
  penalty_strokes: 2,
  yardage: null,
  putts: 2,
  gir: false,
  yardage: null,
};
const explicitPenaltyPair: SituationalFixture = {
  name: 'explicit_penalty_pair',
  description:
    'Par-5 bogey with TWO penalty shots in a row (double water hazard). Both ' +
    'stay in sequence order and neither reads as a green-finding attempt; ' +
    'penalty_strokes (2) reconciles with the count of is_penalty rows.',
  scope: scope('player-penalty'),
  holes: [PENALTY_HOLE],
  rawShots: [
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 520,
      distance_unit_before: 'yards',
      distance_to_hole_after: 300,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-06-20T08:00:00.000Z',
    },
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 300,
      distance_unit_before: 'yards',
      // The ball is lost in the hazard — no usable after-distance. This is
      // a MISSING measurement, not a recorded zero.
      distance_to_hole_after: null,
      distance_unit_after: null,
      lie_before: 'fairway',
      lie_after: null,
      result: null,
      is_penalty: true,
      putt_made: null,
      observed_at: '2026-06-20T08:04:00.000Z',
    },
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 3,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 300,
      distance_unit_before: 'yards',
      // Second hazard, same hole — another missing after-distance.
      distance_to_hole_after: null,
      distance_unit_after: null,
      lie_before: 'fairway',
      lie_after: null,
      result: null,
      is_penalty: true,
      putt_made: null,
      observed_at: '2026-06-20T08:07:00.000Z',
    },
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 4,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 300,
      distance_unit_before: 'yards',
      distance_to_hole_after: 20,
      distance_unit_after: 'feet',
      lie_before: 'fairway',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-20T08:10:00.000Z',
    },
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 5,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 20,
      distance_unit_before: 'feet',
      distance_to_hole_after: 5,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'green',
      result: null,
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-20T08:12:00.000Z',
    },
    {
      round_id: 'round-penalty',
      hole_number: 9,
      shot_number: 6,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 5,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-20T08:13:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Incomplete shot sequence
// ---------------------------------------------------------------------------
// The scorecard says 4 strokes, but the final holing putt was never logged
// (a common ingest gap). buildHoleSequence must come back `complete:false`
// with BOTH the row-count mismatch and the missing-termination reason —
// it must not guess that the recorded shots "are probably all of them".
const INCOMPLETE_HOLE: HoleContext = {
  round_id: 'round-incomplete',
  course_id: 'course-f',
  hole_number: 5,
  par: 4,
  total_strokes: 4,
  penalty_strokes: 0,
  yardage: null,
  putts: 2,
  gir: true,
  yardage: null,
};
const incompleteShotSequence: SituationalFixture = {
  name: 'incomplete_shot_sequence',
  description:
    'Scorecard says 4 strokes and 2 putts; only 3 shot rows are recorded and ' +
    'the last one never holes out. Must report BOTH shot_count_mismatch and ' +
    'sequence_not_terminated, not silently accept 3 as "close enough".',
  scope: scope('player-incomplete'),
  holes: [INCOMPLETE_HOLE],
  rawShots: [
    {
      round_id: 'round-incomplete',
      hole_number: 5,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 390,
      distance_unit_before: 'yards',
      distance_to_hole_after: 160,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-06-25T12:00:00.000Z',
    },
    {
      round_id: 'round-incomplete',
      hole_number: 5,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 160,
      distance_unit_before: 'yards',
      distance_to_hole_after: 10,
      distance_unit_after: 'feet',
      lie_before: 'fairway',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-25T12:03:00.000Z',
    },
    {
      round_id: 'round-incomplete',
      hole_number: 5,
      shot_number: 3,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 10,
      distance_unit_before: 'feet',
      distance_to_hole_after: 2,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'green',
      // The holing putt (shot 4) was never logged — this row does not
      // terminate the hole.
      result: null,
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-25T12:05:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 6. Mixed-unit approach
// ---------------------------------------------------------------------------
// One approach shot records its BEFORE distance in yards and its AFTER
// distance in feet on the same row — proves before/after are converted
// independently, never assumed to share a unit.
const MIXED_UNIT_HOLE: HoleContext = {
  round_id: 'round-mixed-unit',
  course_id: 'course-g',
  hole_number: 14,
  par: 4,
  total_strokes: 3,
  penalty_strokes: 0,
  yardage: null,
  putts: 1,
  gir: true,
  yardage: null,
};
const mixedUnitApproach: SituationalFixture = {
  name: 'mixed_unit_approach',
  description:
    'The approach shot records distance_to_hole_before in YARDS and ' +
    'distance_to_hole_after in FEET on the same row. Each must convert using ' +
    "its own unit column — assuming they match understated this exact shot " +
    'in production (a 43-yd/128-ft shot read as a 128-YARD approach).',
  scope: scope('player-mixed-unit'),
  holes: [MIXED_UNIT_HOLE],
  rawShots: [
    {
      round_id: 'round-mixed-unit',
      hole_number: 14,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 410,
      distance_unit_before: 'yards',
      distance_to_hole_after: 180,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-06-28T16:00:00.000Z',
    },
    {
      round_id: 'round-mixed-unit',
      hole_number: 14,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 180,
      distance_unit_before: 'yards', // before: yards
      distance_to_hole_after: 9,
      distance_unit_after: 'feet', // after: feet — different unit, same row
      lie_before: 'fairway',
      lie_after: 'green',
      result: 'green',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-06-28T16:03:00.000Z',
    },
    {
      round_id: 'round-mixed-unit',
      hole_number: 14,
      shot_number: 3,
      shot_type: 'putting',
      club_type: 'putter',
      distance_to_hole_before: 9,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'green',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      intent: 'putt',
      observed_at: '2026-06-28T16:05:00.000Z',
    },
  ],
};

// ---------------------------------------------------------------------------
// 7. Hole-out from off the green (chip-in)
// ---------------------------------------------------------------------------
// The approach misses the green; the next shot is a CHIP from around the
// green that goes straight in — no putt at all. Termination must come from
// `result === 'hole'` on an `around_green` shot, not from `putt_made`
// (`putt_made` is genuinely `null` here, since this was never a putt).
// Proves the termination OR does not require BOTH signals to agree, and
// that holing out isn't assumed to always happen on the green.
const CHIP_IN_HOLE: HoleContext = {
  round_id: 'round-chip-in',
  course_id: 'course-j',
  hole_number: 8,
  par: 4,
  total_strokes: 3,
  penalty_strokes: 0,
  yardage: null,
  putts: 0,
  gir: false,
  yardage: null,
};
const aroundGreenHoleOut: SituationalFixture = {
  name: 'around_green_hole_out',
  description:
    'Par: tee, an approach that misses the green (fairway/rough short of ' +
    'it), then a chip-in from around the green — no putt is ever recorded. ' +
    "Termination must key off result === 'hole' on the around_green shot; " +
    'putt_made stays null throughout and must not be required.',
  scope: scope('player-chip-in'),
  holes: [CHIP_IN_HOLE],
  rawShots: [
    {
      round_id: 'round-chip-in',
      hole_number: 8,
      shot_number: 1,
      shot_type: 'tee',
      club_type: 'driver',
      distance_to_hole_before: 380,
      distance_unit_before: 'yards',
      distance_to_hole_after: 150,
      distance_unit_after: 'yards',
      lie_before: 'tee',
      lie_after: 'fairway',
      result: 'fairway',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-07-02T10:00:00.000Z',
    },
    {
      round_id: 'round-chip-in',
      hole_number: 8,
      shot_number: 2,
      shot_type: 'approach',
      club_type: 'non_driver',
      distance_to_hole_before: 150,
      distance_unit_before: 'yards',
      distance_to_hole_after: 30,
      distance_unit_after: 'feet',
      lie_before: 'fairway',
      lie_after: 'rough',
      result: 'rough',
      is_penalty: false,
      putt_made: null,
      intent: 'go_for_green',
      observed_at: '2026-07-02T10:03:00.000Z',
    },
    {
      round_id: 'round-chip-in',
      hole_number: 8,
      shot_number: 3,
      shot_type: 'around_green',
      club_type: 'non_driver',
      distance_to_hole_before: 30,
      distance_unit_before: 'feet',
      distance_to_hole_after: 0,
      distance_unit_after: 'feet',
      lie_before: 'rough',
      lie_after: 'hole',
      result: 'hole',
      is_penalty: false,
      putt_made: null,
      observed_at: '2026-07-02T10:05:00.000Z',
    },
  ],
};

export const SITUATIONAL_FIXTURES: readonly SituationalFixture[] = [
  twoCourseSameHoleNumber,
  par5Layup,
  par3TeeGreenAttempt,
  explicitPenaltyPair,
  incompleteShotSequence,
  mixedUnitApproach,
  aroundGreenHoleOut,
];

export {
  twoCourseSameHoleNumber,
  par5Layup,
  par3TeeGreenAttempt,
  explicitPenaltyPair,
  incompleteShotSequence,
  mixedUnitApproach,
  aroundGreenHoleOut,
};
