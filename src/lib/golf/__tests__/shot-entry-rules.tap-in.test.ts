import { describe, expect, it } from 'vitest';
import { planTapIn, tapInDistance, tapInWords, TAP_IN_LEAVE_FEET, type TapInInput } from '@/lib/golf/shot-entry-rules';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import { derivePuttMade } from '@/app/golf/actions/golf-action-shared';
import type { RoundHole, ShotRecord } from '@/lib/types/golf';

const HOLE: RoundHole = { number: 1, par: 4, yardage: 420, score: null };

const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 420, result: 'fairway', distanceToHoleAfter: 150, shotDistance: 270 });
const toGreen = (n: number, feet: number) =>
  shot({ shotNumber: n, shotType: 'approach', distanceToHoleBefore: 150, result: 'green', distanceToHoleAfter: feet, distanceUnitAfter: 'feet', shotDistance: 150 });

const input = (over: Partial<TapInInput> = {}): TapInInput => ({
  hole: HOLE,
  currentShot: 3,
  shotHistory: [TEE, toGreen(2, 25)],
  currentLie: 'green',
  isPutting: true,
  distanceToHole: 25,
  distanceUnit: 'feet',
  resultOfShot: null,
  distanceAfterShot: '',
  puttBreak: null,
  puttSlope: null,
  ...over,
});

describe('planTapIn: a tap in is a real, holed putt', () => {
  it('within 2 ft: one holed putt from where the ball lies, counted as a stroke and a putt', () => {
    const plan = planTapIn(input({ shotHistory: [TEE, toGreen(2, 2)], distanceToHole: 2 }))!;
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      shotNumber: 3,
      shotType: 'putting',
      clubType: 'putter',
      lieBefore: 'green',
      distanceToHoleBefore: 2,
      distanceUnitBefore: 'feet',
      result: 'hole',
      distanceToHoleAfter: 0,
      distanceUnitAfter: 'feet',
      puttDistanceFeet: 2,
      isPenalty: false,
    });
    expect(plan).toMatchObject({ fromFeet: 2, score: 3, putts: 1 });
    // The writers' mapping (round-partial / round-submit): a holed putt is written putt_made = true.
    expect(derivePuttMade(plan.rows[0]!)).toBe(true);
  });

  it('a 1 ft leave holed: the row the owner asked for (holed, 1 ft)', () => {
    const plan = planTapIn(input({ shotHistory: [TEE, toGreen(2, 1)], distanceToHole: 1 }))!;
    expect(plan.rows).toEqual([expect.objectContaining({ result: 'hole', distanceToHoleBefore: 1, puttDistanceFeet: 1 })]);
  });

  it('farther out: the putt on screen leaves 1 ft, then the 1 ft putt is holed; the chain stays continuous', () => {
    const plan = planTapIn(input({ puttBreak: 'left_to_right', puttSlope: 'uphill' }))!;
    expect(plan.rows).toHaveLength(2);
    const [lag, tap] = plan.rows;
    expect(lag).toMatchObject({ shotNumber: 3, result: 'green', distanceToHoleBefore: 25, distanceToHoleAfter: TAP_IN_LEAVE_FEET, puttDistanceFeet: 25, puttBreak: 'left_to_right', puttSlope: 'uphill' });
    expect(tap).toMatchObject({ shotNumber: 4, result: 'hole', distanceToHoleBefore: TAP_IN_LEAVE_FEET, distanceToHoleAfter: 0, puttDistanceFeet: 1 });
    expect(tap!.puttBreak).toBeUndefined();
    expect(plan).toMatchObject({ score: 4, putts: 2 });
    const stats = calculateHoleStats([TEE, toGreen(2, 25), ...plan.rows], HOLE);
    expect(stats).toMatchObject({ score: 4, putts: 2, greenInRegulation: true });
  });

  it('a putt stored in yards is converted to feet for its putt length', () => {
    const plan = planTapIn(input({ distanceToHole: 3, distanceUnit: 'yards' }))!;
    expect(plan.fromFeet).toBe(9);
    expect(plan.rows[0]).toMatchObject({ distanceToHoleBefore: 3, distanceUnitBefore: 'yards', puttDistanceFeet: 9 });
  });

  it('after a penalty the penalty stroke still counts in the score', () => {
    const history = [
      shot({ shotNumber: 1, shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 420, result: 'other', distanceToHoleAfter: 420, shotDistance: 0 }),
      shot({ shotNumber: 2, shotType: 'penalty', lieBefore: 'tee', result: 'penalty', isPenalty: true, penaltyType: 'ob', distanceToHoleBefore: 420, distanceToHoleAfter: 420 }),
      shot({ shotNumber: 3, shotType: 'tee', lieBefore: 'tee', distanceToHoleBefore: 420, result: 'fairway', distanceToHoleAfter: 150 }),
      toGreen(4, 2),
    ];
    const plan = planTapIn(input({ shotHistory: history, currentShot: 5, distanceToHole: 2 }))!;
    expect(plan.rows[0]!.shotNumber).toBe(5);
    expect(plan).toMatchObject({ score: 5, putts: 1 });
  });

  it('is not offered off the green, on a holed hole, once a result or a leave is picked, or past the stroke limit', () => {
    expect(planTapIn(input({ isPutting: false, currentLie: 'fairway' }))).toBeNull();
    expect(planTapIn(input({ shotHistory: [TEE, shot({ shotNumber: 2, shotType: 'approach', result: 'hole' })] }))).toBeNull();
    expect(planTapIn(input({ resultOfShot: 'green' }))).toBeNull();
    expect(planTapIn(input({ distanceAfterShot: '3' }))).toBeNull();
    expect(planTapIn(input({ distanceToHole: 0 }))).toBeNull();
    const fourteen = Array.from({ length: 14 }, (_, i) =>
      i === 0 ? { ...TEE, result: 'green' as const, distanceToHoleAfter: 30, distanceUnitAfter: 'feet' as const } : shot({ shotNumber: i + 1, shotType: 'putting', lieBefore: 'green', distanceToHoleBefore: 30, distanceUnitBefore: 'feet', result: 'green', distanceToHoleAfter: 30, distanceUnitAfter: 'feet' }),
    );
    // Shot 15 from 30 ft would write two strokes: 16 is past the limit, so it is not offered.
    expect(planTapIn(input({ shotHistory: fourteen, currentShot: 15, distanceToHole: 30 }))).toBeNull();
    // From 2 ft it is one stroke, the 15th: offered.
    expect(planTapIn(input({ shotHistory: fourteen, currentShot: 15, distanceToHole: 2 }))?.score).toBe(15);
  });
});

describe('tapInWords: the caption names every stroke and the score', () => {
  it('in feet and in meters (stored feet unchanged)', () => {
    const one = planTapIn(input({ shotHistory: [TEE, toGreen(2, 2)], distanceToHole: 2 }))!;
    const two = planTapIn(input())!;
    expect(tapInWords(one, 'yards')).toEqual({ caption: 'Holed from 2 ft · score 3', label: 'Tap in: holed from 2 ft, score 3' });
    expect(tapInWords(two, 'yards').caption).toBe('Two putts: leaves 1 ft, then holed · score 4');
    expect(tapInWords(two, 'meters').caption).toBe('Two putts: leaves 0.3 m, then holed · score 4');
    expect(tapInWords(one, 'meters').caption).toBe('Holed from 0.6 m · score 3');
    expect([tapInDistance(1, 'yards'), tapInDistance(0.5, 'yards'), tapInDistance(1, 'meters')]).toEqual(['1 ft', '0.5 ft', '0.3 m']);
  });
});

describe('planTapIn: never over a choice the player made', () => {
  it('is not offered once a putt miss tag is picked, so the tag is not dropped', () => {
    expect(planTapIn(input({ puttMissTags: ['short'] }))).toBeNull();
    expect(planTapIn(input({ puttMissTags: [] }))).not.toBeNull();
  });
});
