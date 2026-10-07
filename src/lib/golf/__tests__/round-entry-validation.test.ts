import { describe, it, expect } from 'vitest';
import {
  clampPuttDistanceFeet,
  deriveScoreAndPutts,
  maxHoleScore,
  validateHole,
  validateHoleTotals,
  validateRoundEntry,
  validateShot,
  type ValidatableHole,
  type ValidatableShot,
} from '../round-entry-validation';

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

/** A normal par 4: drive, approach to 20 ft, two putts. */
function normalPar4(holeNumber: number): ValidatableHole {
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

describe('validateHoleTotals — score and putts', () => {
  it.each([
    { name: 'par 4, 4 strokes, 2 putts', par: 4, score: 4, putts: 2, rules: [] },
    { name: 'hole-out from off the green (0 putts)', par: 4, score: 3, putts: 0, rules: [] },
    { name: 'ace (1 stroke, 0 putts)', par: 3, score: 1, putts: 0, rules: [] },
    { name: 'score 0', par: 4, score: 0, putts: 0, rules: ['score_out_of_range'] },
    { name: 'score above cap', par: 5, score: 16, putts: 2, rules: ['score_out_of_range'] },
    { name: 'par 3 at the live 15-stroke cap', par: 3, score: 15, putts: 3, rules: [] },
    { name: 'putts equal score', par: 4, score: 2, putts: 2, rules: ['putts_exceed_score'] },
    { name: 'putts above score', par: 4, score: 3, putts: 5, rules: ['putts_exceed_score'] },
    { name: 'one-stroke hole with a putt', par: 3, score: 1, putts: 1, rules: ['putts_exceed_score'] },
  ])('$name', ({ par, score, putts, rules }) => {
    const issues = validateHoleTotals({ holeNumber: 1, par, score, putts });
    expect(issues.map((i) => i.rule)).toEqual(rules);
    for (const i of issues) expect(i.severity).toBe('block');
  });

  it('caps at par + 10, never below the live tracker 15', () => {
    expect(maxHoleScore(3)).toBe(15);
    expect(maxHoleScore(5)).toBe(15);
    expect(maxHoleScore(6)).toBe(16);
  });
});

describe('validateShot — tee reachability and monotonic distance', () => {
  it.each([
    { name: 'par 4 drive to fairway', par: 4, before: 420, result: 'fairway' as const, after: 140, afterUnit: 'yards' as const, expected: [] },
    { name: 'drivable par 4 (330) onto green', par: 4, before: 330, result: 'green' as const, after: 30, afterUnit: 'feet' as const, expected: [] },
    { name: 'par 4 ace at 380 yd', par: 4, before: 380, result: 'hole' as const, after: 0, afterUnit: 'feet' as const, expected: [] },
    { name: '420-yd drive onto green', par: 4, before: 420, result: 'green' as const, after: 20, afterUnit: 'feet' as const, expected: [['tee_shot_unreachable', 'confirm']] },
    { name: '450-yd par-4 ace', par: 4, before: 450, result: 'hole' as const, after: 0, afterUnit: 'feet' as const, expected: [['tee_shot_unreachable', 'confirm']] },
    { name: '540-yd par 5 drive onto green', par: 5, before: 540, result: 'green' as const, after: 20, afterUnit: 'feet' as const, expected: [['tee_shot_unreachable', 'block']] },
    { name: 'par 3 tee shot onto green is ordinary', par: 3, before: 190, result: 'green' as const, after: 25, afterUnit: 'feet' as const, expected: [] },
  ])('$name', ({ par, before, result, after, afterUnit, expected }) => {
    const issues = validateShot(
      shot({ distanceToHoleBefore: before, result, distanceToHoleAfter: after, distanceUnitAfter: afterUnit }),
      { holeNumber: 7, par, yardage: before },
    );
    expect(issues.map((i) => [i.rule, i.severity])).toEqual(expected);
  });

  it('uses the confirm copy the player sees', () => {
    const [issue] = validateShot(
      shot({ distanceToHoleBefore: 380, result: 'green', distanceToHoleAfter: 15, distanceUnitAfter: 'feet' }),
      { holeNumber: 1, par: 5, yardage: 380 },
    );
    expect(issue).toBeUndefined();
    const [unusual] = validateShot(
      shot({ distanceToHoleBefore: 420, result: 'green', distanceToHoleAfter: 15, distanceUnitAfter: 'feet' }),
      { holeNumber: 1, par: 4, yardage: 420 },
    );
    expect(unusual?.message).toBe('A 420-yard drive onto the green? Tap to confirm.');
  });

  it.each([
    { name: 'approach that gets further away', s: { shotType: 'approach' as const, distanceToHoleBefore: 100, distanceToHoleAfter: 120, result: 'rough' as const }, expected: ['distance_not_decreasing'] },
    { name: 'approach that went long is a recovery', s: { shotType: 'approach' as const, distanceToHoleBefore: 30, distanceToHoleAfter: 40, result: 'rough' as const, approachMissDirection: 'long_left' }, expected: [] },
    { name: 'recovery shot (result other)', s: { shotType: 'approach' as const, distanceToHoleBefore: 150, distanceToHoleAfter: 160, result: 'other' as const }, expected: [] },
    { name: 'putt that ran long (tag)', s: { shotType: 'putting' as const, distanceToHoleBefore: 4, distanceUnitBefore: 'feet' as const, distanceToHoleAfter: 5, distanceUnitAfter: 'feet' as const, result: 'green' as const, puttMissTags: ['long'] }, expected: [] },
    { name: 'putt leaving more distance, no tag', s: { shotType: 'putting' as const, distanceToHoleBefore: 4, distanceUnitBefore: 'feet' as const, distanceToHoleAfter: 6, distanceUnitAfter: 'feet' as const, result: 'green' as const }, expected: ['distance_not_decreasing'] },
    { name: 'feet vs yards normalised (150 yd → 30 ft)', s: { shotType: 'approach' as const, distanceToHoleBefore: 150, distanceToHoleAfter: 30, distanceUnitAfter: 'feet' as const, result: 'green' as const }, expected: [] },
    { name: 'penalty record is never checked', s: { shotType: 'penalty' as const, isPenalty: true, distanceToHoleBefore: 200, distanceToHoleAfter: 250, result: 'penalty' as const }, expected: [] },
  ])('$name', ({ s, expected }) => {
    const issues = validateShot(shot(s), { holeNumber: 3, par: 4, yardage: 400 });
    expect(issues.map((i) => i.rule)).toEqual(expected);
    for (const i of issues) expect(i.severity).toBe('confirm');
  });
});

describe('clampPuttDistanceFeet', () => {
  it.each([
    [20, 20], [0, 0], [-5, 0], [150, 150], [2000, 150], [Number.NaN, null], [undefined, null], [null, null],
  ])('%s → %s', (input, expected) => {
    expect(clampPuttDistanceFeet(input as number | null | undefined)).toBe(expected);
  });
});

describe('deriveScoreAndPutts', () => {
  it('mirrors calculateHoleStats (shots + un-recorded penalty results)', () => {
    expect(deriveScoreAndPutts(normalPar4(1).shots!)).toEqual({ score: 4, putts: 2 });
    expect(deriveScoreAndPutts([shot({ result: 'penalty' }), shot({ shotNumber: 3 })])).toEqual({ score: 3, putts: 0 });
  });
});

describe('validateRoundEntry', () => {
  it('passes a normal 18-hole round with no issues and holesPlayed 18', () => {
    const holes = Array.from({ length: 18 }, (_, i) => normalPar4(i + 1));
    const result = validateRoundEntry(holes);
    expect(result.issues).toEqual([]);
    expect(result.holesPlayed).toBe(18);
    expect(validateHole(holes[0]!)).toEqual([]);
  });

  it('derives holesPlayed from distinct hole rows and blocks duplicates', () => {
    const holes = [normalPar4(1), normalPar4(2), normalPar4(2)];
    const result = validateRoundEntry(holes);
    expect(result.holesPlayed).toBe(2);
    expect(result.blocking.map((i) => i.rule)).toContain('duplicate_hole');
  });

  it('allows a genuinely great round (-8 over 18)', () => {
    const holes = Array.from({ length: 18 }, (_, i) => normalPar4(i + 1));
    for (let i = 0; i < 8; i++) holes[i] = { ...holes[i]!, score: 3, putts: 1, shots: [] };
    expect(validateRoundEntry(holes).blocking).toEqual([]);
  });

  it('blocks the 2026-09-17 shape: 18 holes, 37 strokes, drives onto every green, one-putts', () => {
    // 4 par 3s (180), 10 par 4s (420), 4 par 5s (540) — par 72. Every hole:
    // tee shot "onto the green" from full yardage, a 20 ft putt holed.
    const pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
    const yardage = (par: number) => (par === 3 ? 180 : par === 4 ? 420 : 540);
    const holes: ValidatableHole[] = pars.map((par, i) => {
      const extra = i === 0; // one hole with a two-putt → 37 total
      const shots: ValidatableShot[] = [
        shot({ shotNumber: 1, distanceToHoleBefore: yardage(par), result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
        ...(extra
          ? [shot({ shotNumber: 2, shotType: 'putting', distanceToHoleBefore: 20, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet' })]
          : []),
        shot({ shotNumber: extra ? 3 : 2, shotType: 'putting', distanceToHoleBefore: extra ? 2 : 20, distanceUnitBefore: 'feet', result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet' }),
      ];
      return { holeNumber: i + 1, par, yardage: yardage(par), score: extra ? 3 : 2, putts: extra ? 2 : 1, shots };
    });
    expect(holes.reduce((s, h) => s + h.score, 0)).toBe(37);

    const result = validateRoundEntry(holes);
    const rules = result.blocking.map((i) => i.rule);
    expect(rules).toContain('round_total_implausible');
    // Each par 5 drive onto the green is impossible on its own…
    expect(result.blocking.filter((i) => i.rule === 'tee_shot_unreachable')).toHaveLength(4);
    // …and every par 4 one asks to confirm.
    expect(result.issues.filter((i) => i.rule === 'tee_shot_unreachable' && i.severity === 'confirm')).toHaveLength(10);
  });

  it('applies the per-hole floor to a 9-hole round too', () => {
    const holes: ValidatableHole[] = Array.from({ length: 9 }, (_, i) => ({ holeNumber: i + 1, par: 4, score: 2, putts: 1 }));
    expect(validateRoundEntry(holes).blocking.map((i) => i.rule)).toEqual(['round_total_implausible']);
  });
});

describe('validateHoleShotConsistency — score/putts must match the shots', () => {
  it.each([
    { name: 'tracker hole (score = shots)', score: 4, putts: 2, penaltyStrokes: 0, rules: [] },
    { name: 'score typed lower than the shots', score: 3, putts: 2, penaltyStrokes: 0, rules: ['score_mismatch_shots'] },
    { name: 'score typed higher than the shots', score: 6, putts: 2, penaltyStrokes: 0, rules: ['score_mismatch_shots'] },
    { name: 'penalty kept on the row (4 shots + 1)', score: 5, putts: 2, penaltyStrokes: 1, rules: [] },
    { name: 'putts not matching putting shots', score: 4, putts: 1, penaltyStrokes: 0, rules: ['putts_mismatch_shots'] },
  ])('$name', ({ score, putts, penaltyStrokes, rules }) => {
    const hole = { ...normalPar4(2), score, putts, penaltyStrokes };
    expect(validateHole(hole).map((i) => i.rule)).toEqual(rules);
  });

  it('accepts a tracker penalty record (OB: stroke + penalty record)', () => {
    const shots: ValidatableShot[] = [
      shot({ shotNumber: 1, result: 'penalty' }),
      shot({ shotNumber: 2, shotType: 'penalty', isPenalty: true, result: 'penalty' }),
      ...normalPar4(1).shots!.map((s, i) => ({ ...s, shotNumber: i + 3 })),
    ];
    expect(validateHole({ holeNumber: 1, par: 4, yardage: 400, score: 6, putts: 2, penaltyStrokes: 1, shots })).toEqual([]);
  });

  it('skips the check for a hole with no shot data', () => {
    expect(validateHole({ holeNumber: 1, par: 4, score: 5, putts: 2 })).toEqual([]);
  });
});

describe('validateHoleShotConsistency — partial chains', () => {
  it('does not cross-check a chain that never holes out', () => {
    const hole: ValidatableHole = { holeNumber: 1, par: 4, yardage: 400, score: 4, putts: 2, shots: [shot({ result: 'fairway' })] };
    expect(validateHole(hole)).toEqual([]);
  });
});
