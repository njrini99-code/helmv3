/**
 * Round-entry audit W6 — the validation leftovers:
 *   RE-V1  shot continuity (±5 yd, penalties skipped), 9/18 in sequence,
 *          holes_played vs the configured count, partial-save rules.
 *   RE-S4  a completed round must have its configured hole count.
 *   RE-V2  a par-4/5 tee shot onto the green with no distance to judge asks.
 *   RE-V4  one score/putts/penalties definition.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveHoleCounts,
  deriveScoreAndPutts,
  firstBlockingPartialHoleIssue,
  SHOT_CONTINUITY_TOLERANCE_YARDS,
  validateHoleSequence,
  validateHolesPlayed,
  validateRoundEntry,
  validateShot,
  validateShotContinuity,
  type ValidatableHole,
  type ValidatableShot,
} from '../round-entry-validation';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import type { ShotRecord } from '@/lib/types/golf';

function shot(overrides: Partial<ValidatableShot>): ValidatableShot {
  return {
    shotNumber: 1,
    shotType: 'tee',
    distanceToHoleBefore: 400,
    distanceUnitBefore: 'yards',
    result: 'fairway',
    distanceToHoleAfter: 150,
    distanceUnitAfter: 'yards',
    isPenalty: false,
    ...overrides,
  };
}

function par4(holeNumber: number): ValidatableHole {
  return {
    holeNumber,
    par: 4,
    yardage: 400,
    score: 4,
    putts: 2,
    shots: [
      shot({ shotNumber: 1 }),
      shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 150, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      shot({ shotNumber: 3, shotType: 'putting', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet' }),
      shot({ shotNumber: 4, shotType: 'putting', distanceToHoleBefore: 2, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet' }),
    ],
  };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('validateShotContinuity (RE-V1)', () => {
  it('passes a chain where every shot starts where the last finished', () => {
    expect(validateShotContinuity(par4(1).shots!, { holeNumber: 1 })).toEqual([]);
  });

  it('asks to confirm a gap beyond ±5 yd, and only confirms', () => {
    const shots = [
      shot({ shotNumber: 1, distanceToHoleAfter: 150 }),
      shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 150 + SHOT_CONTINUITY_TOLERANCE_YARDS + 10 }),
    ];
    const issues = validateShotContinuity(shots, { holeNumber: 7 });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ rule: 'shot_start_mismatch', severity: 'confirm', holeNumber: 7, shotNumber: 2 });
  });

  it('tolerates a gap inside ±5 yd and converts feet to yards', () => {
    const shots = [
      shot({ shotNumber: 1, shotType: 'approach', distanceToHoleAfter: 30, distanceUnitAfter: 'feet', result: 'green' }),
      // 30 ft = 10 yd; a putt from 36 ft (12 yd) is inside the window.
      shot({ shotNumber: 2, shotType: 'putting', distanceToHoleBefore: 36, distanceUnitBefore: 'feet' }),
    ];
    expect(validateShotContinuity(shots, { holeNumber: 1 })).toEqual([]);
  });

  it('skips across a penalty (a drop or re-tee moves the ball)', () => {
    const shots = [
      shot({ shotNumber: 1, result: 'penalty', distanceToHoleAfter: 250 }),
      shot({ shotNumber: 2, shotType: 'penalty', isPenalty: true, result: 'penalty', distanceToHoleBefore: 400, distanceToHoleAfter: 400 }),
      shot({ shotNumber: 3, distanceToHoleBefore: 400 }),
    ];
    expect(validateShotContinuity(shots, { holeNumber: 1 })).toEqual([]);
  });

  it('skips unknown (0) distances', () => {
    const shots = [shot({ shotNumber: 1, distanceToHoleAfter: 0 }), shot({ shotNumber: 2, distanceToHoleBefore: 80 })];
    expect(validateShotContinuity(shots, { holeNumber: 1 })).toEqual([]);
  });

  it('never blocks a submit on its own', () => {
    const base = par4(1);
    const shots = [...base.shots!];
    shots[1] = { ...shots[1]!, distanceToHoleBefore: 190 };
    const hole: ValidatableHole = { ...base, shots };
    const result = validateRoundEntry(range(1, 18).map((n) => (n === 1 ? hole : par4(n))), { requireCompleteRound: true });
    expect(result.issues.some((i) => i.rule === 'shot_start_mismatch')).toBe(true);
    expect(result.blocking).toEqual([]);
  });
});

describe('validateHoleSequence (RE-V1)', () => {
  it.each([
    { name: '1–18', holes: range(1, 18), rules: [] },
    { name: 'front nine 1–9', holes: range(1, 9), rules: [] },
    { name: 'back nine 10–18 (real hole numbers kept)', holes: range(10, 18), rules: [] },
    { name: '5 holes', holes: range(1, 5), rules: ['hole_count_invalid'] },
    { name: '17 holes', holes: range(1, 17), rules: ['hole_count_invalid'] },
    { name: 'nine with a gap', holes: [1, 2, 3, 4, 5, 6, 7, 8, 10], rules: ['holes_not_sequential'] },
    { name: 'nine starting at 5', holes: range(5, 13), rules: ['holes_not_sequential'] },
  ])('$name', ({ holes, rules }) => {
    const issues = validateHoleSequence(holes);
    expect(issues.map((i) => i.rule)).toEqual(rules);
    for (const i of issues) expect(i.severity).toBe('block');
  });

  it('is only applied when the caller asks for a complete round', () => {
    const five = range(1, 5).map(par4);
    expect(validateRoundEntry(five).blocking.map((i) => i.rule)).not.toContain('hole_count_invalid');
    expect(validateRoundEntry(five, { requireCompleteRound: true }).blocking.map((i) => i.rule)).toContain('hole_count_invalid');
  });
});

describe('validateHolesPlayed (RE-S4)', () => {
  it('blocks a round started as 18 that arrives with 9 holes', () => {
    const [issue] = validateHolesPlayed(9, 18);
    expect(issue).toMatchObject({ rule: 'holes_played_mismatch', severity: 'block' });
    expect(issue!.message).toContain('started as 18 holes');
  });

  it('passes a matching count, and skips an unknown configuration', () => {
    expect(validateHolesPlayed(18, 18)).toEqual([]);
    expect(validateHolesPlayed(9, 9)).toEqual([]);
    expect(validateHolesPlayed(9, null)).toEqual([]);
    expect(validateHolesPlayed(9, undefined)).toEqual([]);
    expect(validateHolesPlayed(9, 12)).toEqual([]);
  });

  it('flows through validateRoundEntry as a blocking issue', () => {
    const nine = range(1, 9).map(par4);
    expect(validateRoundEntry(nine, { requireCompleteRound: true, configuredHoles: 18 }).blocking.map((i) => i.rule))
      .toEqual(['holes_played_mismatch']);
  });
});

describe('firstBlockingPartialHoleIssue (RE-V1, savePartialRound)', () => {
  it('ignores holes without a score or putts and never applies the 9/18 shape', () => {
    expect(firstBlockingPartialHoleIssue([par4(1), null, { holeNumber: 3, par: 4, score: null, putts: null }])).toBeNull();
  });

  it('returns the first blocking issue on a completed hole', () => {
    const bad = { ...par4(2), score: 2, putts: 2, shots: [] };
    expect(firstBlockingPartialHoleIssue([par4(1), bad])).toMatchObject({ rule: 'putts_exceed_score', holeNumber: 2 });
  });

  it('does not refuse a partial save over a confirm-only issue', () => {
    const base = par4(1);
    const shots = [...base.shots!];
    shots[1] = { ...shots[1]!, distanceToHoleBefore: 190 };
    const hole: ValidatableHole = { ...base, shots };
    expect(firstBlockingPartialHoleIssue([hole])).toBeNull();
  });
});

describe('tee shot with nothing to judge (RE-V2)', () => {
  it('asks to confirm a par-4 drive onto the green when neither distance nor yardage is known', () => {
    const issues = validateShot(
      shot({ distanceToHoleBefore: 0, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      { holeNumber: 4, par: 4, yardage: 0 },
    );
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([['tee_shot_unjudgeable', 'confirm']]);
  });

  it('still judges from the hole yardage when the shot distance is missing', () => {
    const issues = validateShot(
      shot({ distanceToHoleBefore: 0, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      { holeNumber: 4, par: 4, yardage: 520 },
    );
    expect(issues.map((i) => [i.rule, i.severity])).toEqual([['tee_shot_unreachable', 'block']]);
  });
});

describe('one score/putts definition (RE-V4)', () => {
  it('calculateHoleStats counts exactly what deriveHoleCounts counts', () => {
    const shots = [
      shot({ shotNumber: 1, result: 'penalty' }), // lost ball, no penalty record
      shot({ shotNumber: 2, distanceToHoleBefore: 400 }),
      shot({ shotNumber: 3, shotType: 'approach', distanceToHoleBefore: 150, result: 'green', distanceToHoleAfter: 10, distanceUnitAfter: 'feet' }),
      shot({ shotNumber: 4, shotType: 'putting', distanceToHoleBefore: 10, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet' }),
    ];
    const counts = deriveHoleCounts(shots);
    expect(counts).toEqual({ score: 5, putts: 1, penalties: 1 });
    expect(deriveScoreAndPutts(shots)).toEqual({ score: 5, putts: 1 });
    const stats = calculateHoleStats(shots as unknown as ShotRecord[], { number: 1, par: 4, yardage: 400 });
    expect({ score: stats.score, putts: stats.putts, penalties: stats.penaltyStrokes }).toEqual(counts);
  });
});
