import { describe, it, expect } from 'vitest';
import { isPlausibleApproach, APPROACH_MAX_YARDS } from '@/lib/golf/approach-plausibility';

/**
 * Regression guard for the shapes observed in a real submitted round
 * (Pebble Beach, 2026-08-02) where 4 of 8 `approach_miss_details` rows were
 * not approach shots at all — every one of them tagged `short`, because the
 * tracker forces a miss direction and offers no "laid up" option.
 */
describe('isPlausibleApproach', () => {
  const approach = (over: Partial<Parameters<typeof isPlausibleApproach>[0]> = {}) => ({
    distanceToHoleBeforeYards: 160,
    distanceToHoleAfterYards: 20,
    lieBefore: 'fairway',
    par: 4,
    ...over,
  });

  describe('rejects the shapes that corrupted approach stats', () => {
    it('rejects a layup on a par 5 (270y, finishes in the fairway)', () => {
      expect(
        isPlausibleApproach(approach({
          distanceToHoleBeforeYards: 270,
          distanceToHoleAfterYards: 110,
          par: 5,
        })),
      ).toBe(false);
    });

    it('rejects the replayed tee shot after a penalty (375y from the tee on a par 4)', () => {
      expect(
        isPlausibleApproach(approach({
          distanceToHoleBeforeYards: 375,
          distanceToHoleAfterYards: 160,
          lieBefore: 'tee',
          par: 4,
        })),
      ).toBe(false);
    });

    it('rejects a shot that made no material progress (topped shot / OOB drop)', () => {
      expect(
        isPlausibleApproach(approach({
          distanceToHoleBeforeYards: 150,
          distanceToHoleAfterYards: 148,
        })),
      ).toBe(false);
    });

    it('rejects a tee lie on a par 4 even inside the distance ceiling', () => {
      expect(
        isPlausibleApproach(approach({ distanceToHoleBeforeYards: 200, lieBefore: 'tee', par: 4 })),
      ).toBe(false);
    });

    it.each([null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rejects a non-positive/non-finite starting distance (%s)',
      (d) => {
        expect(isPlausibleApproach(approach({ distanceToHoleBeforeYards: d as number }))).toBe(false);
      },
    );
  });

  describe('keeps genuine approaches', () => {
    it.each([
      ['fairway', 4],
      ['rough', 4],
      ['sand', 5],
      ['bunker', 4],
      ['fringe', 4],
    ] as const)('accepts a real approach from %s', (lie, par) => {
      expect(isPlausibleApproach(approach({ lieBefore: lie, par }))).toBe(true);
    });

    it('accepts a par-3 tee shot — it IS the approach', () => {
      expect(
        isPlausibleApproach(approach({
          distanceToHoleBeforeYards: 185,
          distanceToHoleAfterYards: 15,
          lieBefore: 'tee',
          par: 3,
        })),
      ).toBe(true);
    });

    it('accepts a greenside chip (around-green shots still belong to the approach family)', () => {
      expect(
        isPlausibleApproach(approach({ distanceToHoleBeforeYards: 25, distanceToHoleAfterYards: 3, lieBefore: 'rough' })),
      ).toBe(true);
    });

    it('accepts when the finish is unknown — an unknown finish is not evidence against', () => {
      expect(
        isPlausibleApproach(approach({ distanceToHoleAfterYards: null })),
      ).toBe(true);
    });

    it('is inclusive at the distance ceiling and exclusive just past it', () => {
      expect(
        isPlausibleApproach(approach({ distanceToHoleBeforeYards: APPROACH_MAX_YARDS, distanceToHoleAfterYards: 30 })),
      ).toBe(true);
      expect(
        isPlausibleApproach(approach({ distanceToHoleBeforeYards: APPROACH_MAX_YARDS + 1, distanceToHoleAfterYards: 30 })),
      ).toBe(false);
    });
  });
});
