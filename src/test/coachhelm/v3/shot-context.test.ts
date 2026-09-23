/**
 * Pure-core tests for the v3 "situational intelligence" context layer
 * (addendum §13, A1): `normalize-shot.ts` and `build-hole-sequence.ts`
 * against the A0 fixtures in `fixtures/situational-intelligence.ts`.
 *
 * No DB, no adapters — every fixture here is hand-authored data. Written
 * failing first against an empty `context/` package, per the addendum's
 * A1 checklist.
 */
import { describe, it, expect } from 'vitest';
import { buildHoleSequence } from '@/lib/coachhelm/v3/context/build-hole-sequence';
import { normalizeShot, normalizeShotValue } from '@/lib/coachhelm/v3/context/normalize-shot';
import { holeIdentityKey, type HoleContext, type ShotFact } from '@/lib/coachhelm/v3/context/types';
import {
  aroundGreenHoleOut,
  explicitPenaltyPair,
  incompleteShotSequence,
  mixedUnitApproach,
  par3TeeGreenAttempt,
  par5Layup,
  twoCourseSameHoleNumber,
} from './fixtures/situational-intelligence';

describe('normalizeShotValue — unit conversion and zero/missing separation', () => {
  it('converts yards to feet', () => {
    expect(normalizeShotValue(150, 'yards')).toEqual({ kind: 'value', value: 450, unit: 'feet' });
  });

  it('passes feet through unchanged', () => {
    expect(normalizeShotValue(9, 'feet')).toEqual({ kind: 'value', value: 9, unit: 'feet' });
  });

  it('passes percent, count, and strokes through as their own canonical unit', () => {
    expect(normalizeShotValue(58, 'percent')).toEqual({ kind: 'value', value: 58, unit: 'percent' });
    expect(normalizeShotValue(43, 'count')).toEqual({ kind: 'value', value: 43, unit: 'count' });
    expect(normalizeShotValue(2, 'strokes')).toEqual({ kind: 'value', value: 2, unit: 'strokes' });
  });

  it('treats a real recorded zero as a VALUE, never as missing', () => {
    // A holed-out shot legitimately has 0 feet left. This must not collapse
    // into the same bucket as "no measurement recorded" (the classic
    // `if (!value)` bug folds 0 and null/undefined together).
    expect(normalizeShotValue(0, 'feet')).toEqual({ kind: 'value', value: 0, unit: 'feet' });
    expect(normalizeShotValue(0, 'yards')).toEqual({ kind: 'value', value: 0, unit: 'feet' });
  });

  it('treats a null/undefined value as missing, distinctly from zero', () => {
    expect(normalizeShotValue(null, 'feet')).toEqual({ kind: 'missing', reason: 'no_value' });
    expect(normalizeShotValue(undefined, 'yards')).toEqual({ kind: 'missing', reason: 'no_value' });
  });

  it('treats a present value with a missing unit as missing, not a guessed unit', () => {
    expect(normalizeShotValue(128, null)).toEqual({ kind: 'missing', reason: 'no_unit' });
    expect(normalizeShotValue(128, undefined)).toEqual({ kind: 'missing', reason: 'no_unit' });
    expect(normalizeShotValue(128, '')).toEqual({ kind: 'missing', reason: 'no_unit' });
  });

  it('treats an unrecognized unit string as missing rather than silently passing the raw number through', () => {
    expect(normalizeShotValue(128, 'meters')).toEqual({
      kind: 'missing',
      reason: 'unrecognized_unit',
    });
  });

  it('treats a non-finite value as missing', () => {
    expect(normalizeShotValue(Number.NaN, 'feet')).toEqual({ kind: 'missing', reason: 'not_finite' });
    expect(normalizeShotValue(Number.POSITIVE_INFINITY, 'yards')).toEqual({
      kind: 'missing',
      reason: 'not_finite',
    });
  });
});

describe('normalizeShot — independent before/after conversion and explicit unknowns', () => {
  it('converts distance_to_hole_before and distance_to_hole_after independently, never assuming a shared unit', () => {
    // The exact production bug this guards against: a 43-yd/128-ft shot
    // read as a 128-YARD approach because before/after were assumed to
    // share one unit.
    const mixedShot = mixedUnitApproach.rawShots[1]!; // before: yards, after: feet
    const fact = normalizeShot(mixedShot);
    expect(fact.distance_to_hole_before_feet).toBe(540); // 180 yd * 3
    expect(fact.distance_to_hole_after_feet).toBe(9); // already feet
  });

  it('normalizes an unrecognized/omitted intent to "unknown" rather than guessing', () => {
    const raw = mixedUnitApproach.rawShots[0]!; // tee shot, no intent tagged
    expect(normalizeShot(raw).intent).toBe('unknown');
    expect(normalizeShot({ ...raw, intent: 'aggressive_go_for_it' }).intent).toBe('unknown');
  });

  it('carries an explicitly ingest-tagged intent through untouched', () => {
    const layupShot = par5Layup.rawShots[1]!; // intent: 'layup'
    expect(normalizeShot(layupShot).intent).toBe('layup');
    const goForGreenShot = par5Layup.rawShots[2]!; // intent: 'go_for_green'
    expect(normalizeShot(goForGreenShot).intent).toBe('go_for_green');
  });

  it('normalizes an unrecognized shot_type/club_type explicitly rather than crashing', () => {
    const raw = mixedUnitApproach.rawShots[0]!;
    expect(normalizeShot({ ...raw, shot_type: 'chip', club_type: 'wedge' })).toMatchObject({
      shot_type: 'unknown',
      club_type: null,
    });
  });

  it('keeps a missing after-distance as null (missing), not 0, on a lost-ball penalty shot', () => {
    const penaltyShot = explicitPenaltyPair.rawShots[1]!; // ball lost, no after-distance
    const fact = normalizeShot(penaltyShot);
    expect(fact.distance_to_hole_after_feet).toBeNull();
    expect(fact.is_penalty).toBe(true);
  });
});

describe('holeIdentityKey — missing course identity handled explicitly', () => {
  it('distinguishes two holes that share a hole_number but not a course', () => {
    const [holeA, holeB] = twoCourseSameHoleNumber.holes;
    expect(holeA!.hole_number).toBe(holeB!.hole_number); // same number...
    expect(holeIdentityKey(holeA!)).not.toBe(holeIdentityKey(holeB!)); // ...different identity
    expect(holeIdentityKey(holeA!)).toBe('course-a:7');
    expect(holeIdentityKey(holeB!)).toBe('course-b:7');
  });

  it('returns null — "cannot be safely grouped" — for a hole with no course_id, rather than falling back to hole_number', () => {
    const noCourseId: Pick<HoleContext, 'course_id' | 'hole_number'> = {
      course_id: null,
      hole_number: 7,
    };
    expect(holeIdentityKey(noCourseId)).toBeNull();
  });

  it('never treats two null-course holes as the same identity just because both are null', () => {
    const first: Pick<HoleContext, 'course_id' | 'hole_number'> = { course_id: null, hole_number: 7 };
    const second: Pick<HoleContext, 'course_id' | 'hole_number'> = { course_id: null, hole_number: 7 };
    // Both individually resolve to "cannot be grouped" — a caller must not
    // read two `null`s as equal and merge them.
    expect(holeIdentityKey(first)).toBeNull();
    expect(holeIdentityKey(second)).toBeNull();
  });
});

describe('buildHoleSequence — order, termination, and penalty representation', () => {
  function factsFor(fixtureRawShots: typeof par5Layup.rawShots): ShotFact[] {
    return fixtureRawShots.map(normalizeShot);
  }

  it('accepts a complete, well-ordered sequence on each course of the two-course fixture', () => {
    const facts = factsFor(twoCourseSameHoleNumber.rawShots);
    const [holeA, holeB] = twoCourseSameHoleNumber.holes;

    const resultA = buildHoleSequence(facts, holeA!);
    expect(resultA.complete).toBe(true);
    expect(resultA.reasons).toEqual([]);
    expect(resultA.shots).toHaveLength(3);

    const resultB = buildHoleSequence(facts, holeB!);
    expect(resultB.complete).toBe(true);
    expect(resultB.reasons).toEqual([]);
    expect(resultB.shots).toHaveLength(2);
  });

  it('accepts the par-5 lay-up sequence as complete', () => {
    const facts = factsFor(par5Layup.rawShots);
    const result = buildHoleSequence(facts, par5Layup.holes[0]!);
    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('accepts the par-3 tee-green-attempt sequence as complete', () => {
    const facts = factsFor(par3TeeGreenAttempt.rawShots);
    const result = buildHoleSequence(facts, par3TeeGreenAttempt.holes[0]!);
    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('accepts the mixed-unit approach sequence as complete', () => {
    const facts = factsFor(mixedUnitApproach.rawShots);
    const result = buildHoleSequence(facts, mixedUnitApproach.holes[0]!);
    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('accepts a chip-in from off the green as complete, with putt_made null throughout', () => {
    const facts = factsFor(aroundGreenHoleOut.rawShots);
    const result = buildHoleSequence(facts, aroundGreenHoleOut.holes[0]!);
    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.shots.every((s) => s.putt_made === null)).toBe(true);
    expect(result.shots.at(-1)?.result).toBe('hole');
  });

  it('terminates on putt_made === true even when result is null, on a count-matching hole', () => {
    // The must-fix case: the final putt was logged with `putt_made: true`
    // but `result` was never set to 'hole' — a real gap the shot-edit path
    // (`golf.ts`'s `updateShotImpl`) can produce, since it can set
    // `putt_made` independently of `result`. `result === 'hole'` alone
    // would miss this; the termination check must accept either signal.
    const hole: HoleContext = {
      round_id: 'round-putt-made-only',
      course_id: 'course-k',
      hole_number: 6,
      par: 4,
      total_strokes: 2,
      penalty_strokes: 0,
      putts: 1,
      gir: true,
    };
    const facts: ShotFact[] = [
      {
        round_id: 'round-putt-made-only',
        hole_number: 6,
        shot_number: 1,
        shot_type: 'approach',
        club_type: 'non_driver',
        intent: 'go_for_green',
        distance_to_hole_before_feet: 300,
        distance_to_hole_after_feet: 10,
        lie_before: 'fairway',
        lie_after: 'green',
        result: 'green',
        is_penalty: false,
        putt_made: null,
        observed_at: '2026-07-10T00:00:00.000Z',
      },
      {
        round_id: 'round-putt-made-only',
        hole_number: 6,
        shot_number: 2,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        distance_to_hole_before_feet: 10,
        distance_to_hole_after_feet: 0,
        lie_before: 'green',
        lie_after: 'hole',
        result: null, // never set — only putt_made records the hole-out
        is_penalty: false,
        putt_made: true,
        observed_at: '2026-07-10T00:01:00.000Z',
      },
    ];

    const result = buildHoleSequence(facts, hole);
    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('skips penalty-count reconciliation when the authoritative penalty_strokes is null (unknown, not zero)', () => {
    const hole: HoleContext = {
      round_id: 'round-unknown-penalty',
      course_id: 'course-l',
      hole_number: 2,
      par: 4,
      total_strokes: 2,
      penalty_strokes: null, // not recorded — must not be treated as 0
      putts: 1,
      gir: false,
    };
    const facts: ShotFact[] = [
      {
        round_id: 'round-unknown-penalty',
        hole_number: 2,
        shot_number: 1,
        shot_type: 'approach',
        club_type: 'non_driver',
        intent: 'unknown',
        distance_to_hole_before_feet: 300,
        distance_to_hole_after_feet: null,
        lie_before: 'fairway',
        lie_after: null,
        result: null,
        is_penalty: true, // a real penalty shot on this hole
        putt_made: null,
        observed_at: '2026-07-11T00:00:00.000Z',
      },
      {
        round_id: 'round-unknown-penalty',
        hole_number: 2,
        shot_number: 2,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        distance_to_hole_before_feet: 10,
        distance_to_hole_after_feet: 0,
        lie_before: 'green',
        lie_after: 'hole',
        result: 'hole',
        is_penalty: false,
        putt_made: true,
        observed_at: '2026-07-11T00:01:00.000Z',
      },
    ];

    const result = buildHoleSequence(facts, hole);
    // There is no authoritative penalty count to reconcile against, so no
    // mismatch is reported — the check is skipped entirely, not run against
    // an assumed 0.
    expect(result.reasons).not.toContain('penalty_count_mismatch');
  });

  it('keeps two penalty events ordered and never reclassifies either as a green attempt', () => {
    const facts = factsFor(explicitPenaltyPair.rawShots);
    const hole = explicitPenaltyPair.holes[0]!;
    const result = buildHoleSequence(facts, hole);

    expect(result.complete).toBe(true);
    expect(result.reasons).toEqual([]);

    // Both penalty shots stay at their recorded, sequential positions.
    const penaltyShots = result.shots.filter((s) => s.is_penalty);
    expect(penaltyShots.map((s) => s.shot_number)).toEqual([2, 3]);
    // Neither penalty shot reads as having found the green.
    for (const s of penaltyShots) {
      expect(s.result === 'green' || s.result === 'gir').toBe(false);
    }
    // penalty_strokes (2) reconciles with the is_penalty row count.
    expect(hole.penalty_strokes).toBe(2);
    expect(penaltyShots).toHaveLength(2);
  });

  it('flags a penalty shot that is misrecorded as a green-finding attempt', () => {
    // A deliberately BROKEN case, not one of the six named fixtures: a
    // penalty-flagged shot whose result claims it found the green. This
    // must never be accepted — the sequence must fail closed with a named
    // reason, not silently trust `result` over `is_penalty`.
    const hole: HoleContext = {
      round_id: 'round-broken',
      course_id: 'course-broken',
      hole_number: 1,
      par: 4,
      total_strokes: 2,
      penalty_strokes: 1,
      putts: 1,
      gir: false,
    };
    const facts: ShotFact[] = [
      {
        round_id: 'round-broken',
        hole_number: 1,
        shot_number: 1,
        shot_type: 'approach',
        club_type: 'non_driver',
        intent: 'unknown',
        distance_to_hole_before_feet: 300,
        distance_to_hole_after_feet: 10,
        lie_before: 'fairway',
        lie_after: 'green',
        result: 'green', // impossible: a penalty shot cannot also find the green
        is_penalty: true,
        putt_made: null,
        observed_at: '2026-06-01T00:00:00.000Z',
      },
      {
        round_id: 'round-broken',
        hole_number: 1,
        shot_number: 2,
        shot_type: 'putting',
        club_type: 'putter',
        intent: 'putt',
        distance_to_hole_before_feet: 10,
        distance_to_hole_after_feet: 0,
        lie_before: 'green',
        lie_after: 'hole',
        result: 'hole',
        is_penalty: false,
        putt_made: true,
        observed_at: '2026-06-01T00:01:00.000Z',
      },
    ];

    const result = buildHoleSequence(facts, hole);
    expect(result.complete).toBe(false);
    expect(result.reasons).toContain('penalty_shot_recorded_as_green_attempt');
  });

  it('reports an incomplete sequence as complete:false with every violated reason, not just the first', () => {
    const facts = factsFor(incompleteShotSequence.rawShots);
    const hole = incompleteShotSequence.holes[0]!;
    const result = buildHoleSequence(facts, hole);

    expect(result.complete).toBe(false);
    expect(result.reasons).toContain('shot_count_mismatch'); // 3 recorded vs 4 authoritative
    expect(result.reasons).toContain('sequence_not_terminated'); // never holed out
    // A matching row count alone would have been insufficient here anyway —
    // this fixture's row count IS wrong, but the termination check is an
    // independent finding, not inferred from the count mismatch.
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('reports no_shots_recorded when nothing matches the hole at all', () => {
    const hole: HoleContext = {
      round_id: 'round-empty',
      course_id: 'course-h',
      hole_number: 1,
      par: 4,
      total_strokes: 4,
      penalty_strokes: 0,
      putts: 2,
      gir: false,
    };
    const result = buildHoleSequence([], hole);
    expect(result.complete).toBe(false);
    expect(result.reasons).toEqual(['no_shots_recorded']);
  });

  it('flags a gap in shot numbering independently of the row-count check', () => {
    const hole: HoleContext = {
      round_id: 'round-gap',
      course_id: 'course-i',
      hole_number: 1,
      par: 4,
      total_strokes: 3,
      penalty_strokes: 0,
      putts: 1,
      gir: true,
    };
    // shot_number 1, 3, 4 — a gap at 2, but the ROW COUNT (3) still matches
    // total_strokes (3). Row count alone must not be treated as sufficient.
    const facts: ShotFact[] = [1, 3, 4].map((n) => ({
      round_id: 'round-gap',
      hole_number: 1,
      shot_number: n,
      shot_type: n === 4 ? 'putting' : 'approach',
      club_type: n === 4 ? 'putter' : 'non_driver',
      intent: 'unknown',
      distance_to_hole_before_feet: 100,
      distance_to_hole_after_feet: n === 4 ? 0 : 10,
      lie_before: 'fairway',
      lie_after: n === 4 ? 'hole' : 'green',
      result: n === 4 ? 'hole' : 'green',
      is_penalty: false,
      putt_made: n === 4 ? true : null,
      observed_at: '2026-06-01T00:00:00.000Z',
    }));

    const result = buildHoleSequence(facts, hole);
    expect(result.complete).toBe(false);
    expect(result.reasons).toContain('non_sequential_shot_numbers');
    expect(result.reasons).not.toContain('shot_count_mismatch');
  });
});
