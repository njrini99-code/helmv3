/**
 * Shadow-eval snapshot fixtures (repair-plan addendum §13, work package
 * A10 slice 1). Four de-identified `ShadowSnapshot`s crossing two axes —
 * new vs. established roster, complete vs. incomplete data — built from
 * the A0 fixtures in `./situational-intelligence.ts` (the in-repo §14.1
 * fixture rows: `incomplete_shot_sequence` is the exact "missing shot,
 * completed scorecard" row `coachhelm-evidence-contract.md` cites) passed
 * through the real `normalizeShot`, plus one small re-keying helper that
 * replicates a hand-authored hole shape across many round ids. That
 * helper is composition on top of the existing A0 rows, not a second
 * fixture system — no shot value here is invented independent of the
 * A0/A3 test suites' own established shapes (`par5Play`, `shot`/`hole`).
 */

import { normalizeShot } from '@/lib/coachhelm/v3/context/normalize-shot';
import type { AnalysisScope, HoleContext, ShotFact } from '@/lib/coachhelm/v3/context/types';
import type { ShadowSnapshot } from '@/lib/coachhelm/v3/eval/shadow-harness';
import { incompleteShotSequence } from './situational-intelligence';

const CUTOFF = '2026-08-01T00:00:00.000Z';

function scope(playerId: string): AnalysisScope {
  return {
    player_id: playerId,
    window_start: '2026-05-01',
    window_end: '2026-07-31',
    analysis_cutoff: CUTOFF,
  };
}

function hole(overrides: Partial<HoleContext> & Pick<HoleContext, 'round_id' | 'hole_number' | 'par' | 'total_strokes'>): HoleContext {
  return {
    course_id: null,
    penalty_strokes: 0,
    putts: 2,
    gir: null,
    yardage: null,
    ...overrides,
  };
}

function shot(overrides: Partial<ShotFact> & Pick<ShotFact, 'round_id' | 'hole_number' | 'shot_number'>): ShotFact {
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

/**
 * A single par-4 hole: tee → approach from 100 yards out (lands in A2's
 * `50_125ft` band) that comes up in the rough → an around-green recovery
 * shot → a one-putt. Resolves to exactly one A4 `approach_to_recovery`
 * event per hole (shots 2-3 group under that view — see
 * `sequence-attribution.ts`'s §7.3 view table), and its shot 2 alone
 * clears A2's approach-band eligibility. Repeating this across enough
 * rounds clears A2 (`MIN_ATTEMPTS`/`MIN_ROUNDS`), A3's par-length `'all'`
 * row (`PAR_LENGTH_MIN_SAMPLE_N`), and A4's rollup floor
 * (`SEQUENCE_MIN_EVENTS`/`SEQUENCE_MIN_ROUNDS`) all from the SAME holes —
 * deliberately, so "established roster" means one coherent, repeated
 * pattern, not three unrelated ones stapled together.
 */
function approachRecoveryHole(round_id: string, hole_number: number): { hole: HoleContext; facts: ShotFact[] } {
  const facts: ShotFact[] = [
    shot({
      round_id, hole_number, shot_number: 1, shot_type: 'tee',
      club_type: 'driver', lie_before: 'tee', distance_to_hole_before_feet: 1200,
      lie_after: 'fairway', distance_to_hole_after_feet: 300, result: 'fairway',
    }),
    shot({
      round_id, hole_number, shot_number: 2, shot_type: 'approach', intent: 'go_for_green',
      lie_before: 'fairway', distance_to_hole_before_feet: 300,
      lie_after: 'rough', distance_to_hole_after_feet: 60, result: 'rough',
    }),
    shot({
      round_id, hole_number, shot_number: 3, shot_type: 'around_green',
      lie_before: 'rough', distance_to_hole_before_feet: 60,
      lie_after: 'green', distance_to_hole_after_feet: 5, result: 'green',
    }),
    shot({
      round_id, hole_number, shot_number: 4, shot_type: 'putting', club_type: 'putter', intent: 'putt',
      lie_before: 'green', distance_to_hole_before_feet: 5,
      lie_after: 'hole', distance_to_hole_after_feet: 0, result: 'hole', putt_made: true,
    }),
  ];
  return { hole: hole({ round_id, hole_number, par: 4, total_strokes: 4, putts: 1 }), facts };
}

/**
 * The SAME par-5 hole (fixed `course_id`/`hole_number` — A3's par-5
 * opportunity family groups by that specific-hole identity, not by par
 * alone), played to a bogey each time: green not reached until shot 4
 * (`greenShotNumber - 2 = 2 > par - 2 = 3` is false — 4 > 3, so this MISSES
 * regulation). Repeating this 3+ times across distinct rounds clears
 * `HOLE_OPPORTUNITY_MIN_SAMPLE_N` with a real, supported
 * `par5_regulation_opportunity_rate` row whose `value` is `0` (well under
 * A5's `PAR5_OPPORTUNITY_LOSS_MAX_PERCENT`), and a `par5_green_in_two_rate`
 * of `0` (well under A5's contradiction floor) — the one real, unforced
 * path to A5's `par5_opportunity_loss` hypothesis reaching
 * `'supported_association'` (see `hypothesis-policy.ts`'s
 * `buildPar5OpportunityHypothesis`).
 */
function par5BogeyHole(round_id: string): { hole: HoleContext; facts: ShotFact[] } {
  const course_id = 'snapshot-course-par5';
  const hole_number = 9;
  const facts: ShotFact[] = [
    shot({ round_id, hole_number, shot_number: 1, shot_type: 'tee', club_type: 'driver', lie_before: 'tee', distance_to_hole_before_feet: 1500, lie_after: 'fairway', distance_to_hole_after_feet: 900, result: 'fairway' }),
    shot({ round_id, hole_number, shot_number: 2, shot_type: 'approach', intent: 'layup', lie_before: 'fairway', distance_to_hole_before_feet: 900, lie_after: 'fairway', distance_to_hole_after_feet: 150, result: 'fairway' }),
    shot({ round_id, hole_number, shot_number: 3, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before_feet: 150, lie_after: 'rough', distance_to_hole_after_feet: 20, result: 'rough' }),
    shot({ round_id, hole_number, shot_number: 4, shot_type: 'around_green', lie_before: 'rough', distance_to_hole_before_feet: 20, lie_after: 'green', distance_to_hole_after_feet: 8, result: 'green' }),
    shot({ round_id, hole_number, shot_number: 5, shot_type: 'putting', club_type: 'putter', intent: 'putt', lie_before: 'green', distance_to_hole_before_feet: 8, lie_after: 'hole', distance_to_hole_after_feet: 0, result: 'hole', putt_made: true }),
  ];
  return {
    hole: hole({ round_id, course_id, hole_number, par: 5, total_strokes: 5, putts: 1 }),
    facts,
  };
}

function factsFrom(rawShots: typeof incompleteShotSequence.rawShots): ShotFact[] {
  return rawShots.map(normalizeShot);
}

// ---------------------------------------------------------------------------
// 1. New roster, incomplete data
// ---------------------------------------------------------------------------
// The in-repo A0 row for exactly this scenario — one round, one hole whose
// recorded sequence never terminates. Nothing here clears any family's
// floor, and the hole itself is suppressed at the A1 layer.
export const newRosterIncomplete: ShadowSnapshot = {
  scope: scope('snapshot-new-incomplete'),
  facts: factsFrom(incompleteShotSequence.rawShots),
  holes: incompleteShotSequence.holes,
};

// ---------------------------------------------------------------------------
// 2. New roster, complete data
// ---------------------------------------------------------------------------
// One round, two fully-resolved holes (well under every family's
// MIN_ROUNDS/MIN_EVENTS/MIN_SAMPLE_N floor) — complete data, insufficient
// population.
const newRound = approachRecoveryHole('snapshot-new-r1', 1);
const newPar5 = par5BogeyHole('snapshot-new-r1');
export const newRosterComplete: ShadowSnapshot = {
  scope: scope('snapshot-new-complete'),
  facts: [...newRound.facts, ...newPar5.facts],
  holes: [newRound.hole, newPar5.hole],
};

// ---------------------------------------------------------------------------
// 3. Established roster, complete data
// ---------------------------------------------------------------------------
// 10 `approachRecoveryHole`s across 3 rounds (clears A2/A3's par-length
// `'all'`/A4 rollup floors at once) + 3 `par5BogeyHole`s across 3 DIFFERENT
// rounds at the SAME course/hole identity (clears A3's par-5
// opportunity floor and, transitively, A5's par5_opportunity_loss).
const ESTABLISHED_ROUNDS = ['snapshot-est-r1', 'snapshot-est-r2', 'snapshot-est-r3'];
const establishedRecoveryHoles = [
  approachRecoveryHole(ESTABLISHED_ROUNDS[0]!, 1),
  approachRecoveryHole(ESTABLISHED_ROUNDS[0]!, 2),
  approachRecoveryHole(ESTABLISHED_ROUNDS[0]!, 3),
  approachRecoveryHole(ESTABLISHED_ROUNDS[0]!, 4),
  approachRecoveryHole(ESTABLISHED_ROUNDS[1]!, 1),
  approachRecoveryHole(ESTABLISHED_ROUNDS[1]!, 2),
  approachRecoveryHole(ESTABLISHED_ROUNDS[1]!, 3),
  approachRecoveryHole(ESTABLISHED_ROUNDS[2]!, 1),
  approachRecoveryHole(ESTABLISHED_ROUNDS[2]!, 2),
  approachRecoveryHole(ESTABLISHED_ROUNDS[2]!, 3),
];
const establishedPar5Holes = ESTABLISHED_ROUNDS.map((round_id) => par5BogeyHole(round_id));

export const establishedRosterComplete: ShadowSnapshot = {
  scope: scope('snapshot-established-complete'),
  facts: [...establishedRecoveryHoles.flatMap((h) => h.facts), ...establishedPar5Holes.flatMap((h) => h.facts)],
  holes: [...establishedRecoveryHoles.map((h) => h.hole), ...establishedPar5Holes.map((h) => h.hole)],
};

// ---------------------------------------------------------------------------
// 4. Established roster, incomplete data
// ---------------------------------------------------------------------------
// The SAME established population, plus the A0 incomplete-sequence hole
// folded in (re-keyed onto one of the established rounds so it counts
// toward that round's own history, not a fourth stray round) — enough
// volume to still clear every floor, while honestly reporting the
// incomplete hole's own exclusion/suppression reasons rather than letting
// volume silently absorb it.
const incompleteHoleReKeyed: HoleContext = {
  ...incompleteShotSequence.holes[0]!,
  round_id: ESTABLISHED_ROUNDS[0]!,
  hole_number: 20, // distinct from every real hole_number used above
};
const incompleteFactsReKeyed: ShotFact[] = factsFrom(incompleteShotSequence.rawShots).map((f) => ({
  ...f,
  round_id: ESTABLISHED_ROUNDS[0]!,
  hole_number: 20,
}));

export const establishedRosterIncomplete: ShadowSnapshot = {
  scope: scope('snapshot-established-incomplete'),
  facts: [...establishedRosterComplete.facts, ...incompleteFactsReKeyed],
  holes: [...establishedRosterComplete.holes, incompleteHoleReKeyed],
};
