import { describe, it, expect } from 'vitest';
import { calculateHoleStats } from '@/lib/utils/shot-helpers';
import {
  makeShotRecord,
  makeRoundHole,
  par4BirdieShotRecords,
  par4BogeyShotRecords,
  par3GirShotRecords,
  sandSaveShotRecords,
  holeOutShotRecords,
} from '@/test/fixtures/golf-shots';

// ============================================================================
// calculateHoleStats — client-side HoleStats from ShotRecord[]
// ============================================================================

describe('calculateHoleStats', () => {
  describe('par 4 birdie (fairway, GIR, 1-putt)', () => {
    const hole = makeRoundHole({ number: 1, par: 4, yardage: 400 });
    const stats = calculateHoleStats(par4BirdieShotRecords(), hole);

    it('score = 3 (birdie)', () => {
      expect(stats.score).toBe(3);
    });

    it('putts = 1', () => {
      expect(stats.putts).toBe(1);
    });

    it('fairway hit = true', () => {
      expect(stats.fairwayHit).toBe(true);
    });

    it('GIR = true (approach in 2 on par 4)', () => {
      expect(stats.greenInRegulation).toBe(true);
    });

    it('usedDriver = true', () => {
      expect(stats.usedDriver).toBe(true);
    });

    it('driving distance recorded', () => {
      expect(stats.drivingDistance).toBe(250);
    });

    it('approach distance in yards', () => {
      expect(stats.approachDistance).toBe(150);
    });

    it('approach proximity in feet', () => {
      expect(stats.approachProximity).toBe(10);
    });

    it('first putt distance in feet', () => {
      expect(stats.firstPuttDistance).toBe(10);
    });

    it('first putt break recorded', () => {
      expect(stats.firstPuttBreak).toBe('left_to_right');
    });

    it('first putt slope recorded', () => {
      expect(stats.firstPuttSlope).toBe('uphill');
    });

    it('no scramble attempt', () => {
      expect(stats.scrambleAttempt).toBe(false);
    });

    it('no sand save attempt', () => {
      expect(stats.sandSaveAttempt).toBe(false);
    });

    it('0 penalty strokes', () => {
      expect(stats.penaltyStrokes).toBe(0);
    });

    it('no hole out', () => {
      expect(stats.holedOutDistance).toBeNull();
      expect(stats.holedOutType).toBeNull();
    });
  });

  describe('par 4 bogey (miss fairway, miss GIR, scramble fail)', () => {
    const hole = makeRoundHole({ number: 1, par: 4, yardage: 400 });
    const stats = calculateHoleStats(par4BogeyShotRecords(), hole);

    it('score = 5 (bogey)', () => {
      expect(stats.score).toBe(5);
    });

    it('putts = 2', () => {
      expect(stats.putts).toBe(2);
    });

    it('fairway miss', () => {
      expect(stats.fairwayHit).toBe(false);
    });

    it('GIR miss', () => {
      expect(stats.greenInRegulation).toBe(false);
    });

    it('scramble attempted but not made', () => {
      expect(stats.scrambleAttempt).toBe(true);
      expect(stats.scrambleMade).toBe(false);
    });

    it('drive miss direction', () => {
      expect(stats.driveMissDirection).toBe('right');
    });
  });

  describe('par 3 GIR (approach on shot 1)', () => {
    const hole = makeRoundHole({ number: 7, par: 3, yardage: 180 });
    const stats = calculateHoleStats(par3GirShotRecords(), hole);

    it('score = 3 (par)', () => {
      expect(stats.score).toBe(3);
    });

    it('GIR = true (hit green on shot 1, par-2 = 1)', () => {
      expect(stats.greenInRegulation).toBe(true);
    });

    it('fairway not applicable for par 3', () => {
      // Par 3 has no fairway tracking (par < 4)
      expect(stats.fairwayHit).toBeNull();
    });

    it('approach proximity in feet', () => {
      expect(stats.approachProximity).toBe(20);
    });

    it('first putt distance in feet', () => {
      expect(stats.firstPuttDistance).toBe(20);
    });

    it('first putt leave (missed first putt)', () => {
      expect(stats.firstPuttLeave).toBe(3);
    });
  });

  describe('sand save', () => {
    const hole = makeRoundHole({ number: 5, par: 4, yardage: 400 });
    const stats = calculateHoleStats(sandSaveShotRecords(), hole);

    it('score = 4 (par)', () => {
      expect(stats.score).toBe(4);
    });

    it('sand save attempted', () => {
      expect(stats.sandSaveAttempt).toBe(true);
    });

    it('sand save made (par)', () => {
      expect(stats.sandSaveMade).toBe(true);
    });

    it('scramble attempted (missed GIR)', () => {
      expect(stats.scrambleAttempt).toBe(true);
    });

    it('scramble made (par or better)', () => {
      expect(stats.scrambleMade).toBe(true);
    });
  });

  // SC-02: the PGA Tour's definition. Out of a greenside bunker and holed in two
  // strokes or fewer is a save whatever the score; par or better is not part of it.
  describe('sand save on the Tour definition (SC-02)', () => {
    const hole = makeRoundHole({ number: 1, par: 4, yardage: 430 });
    // Tee shot into the water, the drop, approach into the bunker, out to 5 ft, one putt.
    const bogeyAfterPenalty = () => [
      makeShotRecord({
        shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
        distanceToHoleBefore: 430, distanceUnitBefore: 'yards',
        result: 'other', distanceToHoleAfter: 210, distanceUnitAfter: 'yards', shotDistance: 220,
      }),
      makeShotRecord({
        shotNumber: 2, shotType: 'penalty', clubType: 'non_driver', lieBefore: 'other',
        distanceToHoleBefore: 210, distanceUnitBefore: 'yards',
        result: 'penalty', distanceToHoleAfter: 210, distanceUnitAfter: 'yards', shotDistance: 0,
        isPenalty: true, penaltyType: 'water',
      }),
      makeShotRecord({
        shotNumber: 3, shotType: 'approach', clubType: 'non_driver', lieBefore: 'rough',
        distanceToHoleBefore: 210, distanceUnitBefore: 'yards',
        result: 'sand', distanceToHoleAfter: 15, distanceUnitAfter: 'yards', shotDistance: 195,
      }),
      makeShotRecord({
        shotNumber: 4, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'sand',
        distanceToHoleBefore: 15, distanceUnitBefore: 'yards',
        result: 'green', distanceToHoleAfter: 5, distanceUnitAfter: 'feet', shotDistance: 15,
      }),
      makeShotRecord({
        shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
        distanceToHoleBefore: 5, distanceUnitBefore: 'feet',
        result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
      }),
    ];

    it('a bunker shot and one putt for a bogey after a penalty is a save', () => {
      const stats = calculateHoleStats(bogeyAfterPenalty(), hole);
      expect(stats.score).toBe(5);
      expect(stats.penaltyStrokes).toBe(1);
      expect(stats.sandSaveAttempt).toBe(true);
      expect(stats.sandSaveMade).toBe(true);
      // Scrambling keeps its par-or-better rule: the bogey is not a scramble.
      expect(stats.scrambleAttempt).toBe(true);
      expect(stats.scrambleMade).toBe(false);
    });

    it('three strokes from the bunker is an attempt, not a save', () => {
      const shots = bogeyAfterPenalty().slice(0, 4);
      shots.push(
        makeShotRecord({
          shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 5, distanceUnitBefore: 'feet',
          result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
        makeShotRecord({
          shotNumber: 6, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 2, distanceUnitBefore: 'feet',
          result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
      );
      const stats = calculateHoleStats(shots, hole);
      expect(stats.score).toBe(6);
      expect(stats.sandSaveAttempt).toBe(true);
      expect(stats.sandSaveMade).toBe(false);
    });

    it('a fairway bunker shot is not a sand-save attempt', () => {
      const shots = bogeyAfterPenalty().map((s) =>
        s.shotNumber === 4 ? { ...s, shotType: 'approach' as const } : s,
      );
      const stats = calculateHoleStats(shots, hole);
      expect(stats.sandSaveAttempt).toBe(false);
      expect(stats.sandSaveMade).toBe(false);
    });
  });

  describe('hole-out eagle', () => {
    const hole = makeRoundHole({ number: 10, par: 4, yardage: 350 });
    const stats = calculateHoleStats(holeOutShotRecords(), hole);

    it('score = 2 (eagle)', () => {
      expect(stats.score).toBe(2);
    });

    it('putts = 0', () => {
      expect(stats.putts).toBe(0);
    });

    it('GIR = true', () => {
      expect(stats.greenInRegulation).toBe(true);
    });

    it('records hole-out distance (converted to feet)', () => {
      // 120 yards * 3 = 360 feet
      expect(stats.holedOutDistance).toBe(360);
    });

    it('records hole-out type', () => {
      expect(stats.holedOutType).toBe('approach');
    });

    it('no first putt (holed out)', () => {
      expect(stats.firstPuttDistance).toBeNull();
    });
  });

  describe('penalty strokes', () => {
    it('counts penalty shots in score and penaltyStrokes', () => {
      const shots = [
        makeShotRecord({
          shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
          distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
          result: 'fairway', distanceToHoleAfter: 250, distanceUnitAfter: 'yards', shotDistance: 150,
        }),
        makeShotRecord({
          shotNumber: 2, shotType: 'penalty', clubType: 'non_driver', lieBefore: 'fairway',
          distanceToHoleBefore: 250, distanceUnitBefore: 'yards',
          result: 'penalty', distanceToHoleAfter: 250, distanceUnitAfter: 'yards', shotDistance: 0,
          isPenalty: true, penaltyType: 'water',
        }),
        makeShotRecord({
          shotNumber: 3, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
          distanceToHoleBefore: 250, distanceUnitBefore: 'yards',
          result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet', shotDistance: 250,
        }),
        makeShotRecord({
          shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 20, distanceUnitBefore: 'feet',
          result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
      ];
      const hole = makeRoundHole({ par: 4, yardage: 400 });
      const stats = calculateHoleStats(shots, hole);

      expect(stats.score).toBe(4);
      expect(stats.penaltyStrokes).toBe(1);
      expect(stats.putts).toBe(1);
    });
  });

  describe('three-putt', () => {
    it('records first putt distance and leave for 3-putt', () => {
      const shots = [
        makeShotRecord({
          shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
          distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
          result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250,
        }),
        makeShotRecord({
          shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
          distanceToHoleBefore: 150, distanceUnitBefore: 'yards',
          result: 'green', distanceToHoleAfter: 40, distanceUnitAfter: 'feet', shotDistance: 150,
        }),
        makeShotRecord({
          shotNumber: 3, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 40, distanceUnitBefore: 'feet',
          result: 'green', distanceToHoleAfter: 8, distanceUnitAfter: 'feet', shotDistance: 0,
          puttBreak: 'left_to_right', puttSlope: 'downhill',
        }),
        makeShotRecord({
          shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 8, distanceUnitBefore: 'feet',
          result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
        makeShotRecord({
          shotNumber: 5, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 2, distanceUnitBefore: 'feet',
          result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
      ];
      const hole = makeRoundHole({ par: 4 });
      const stats = calculateHoleStats(shots, hole);

      expect(stats.putts).toBe(3);
      expect(stats.firstPuttDistance).toBe(40);
      expect(stats.firstPuttLeave).toBe(8);
      expect(stats.firstPuttBreak).toBe('left_to_right');
      expect(stats.firstPuttSlope).toBe('downhill');
      expect(stats.firstPuttMissDirection).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles single putt hole (tap-in after chip)', () => {
      const shots = [
        makeShotRecord({
          shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
          distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
          result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards', shotDistance: 250,
        }),
        makeShotRecord({
          shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
          distanceToHoleBefore: 150, distanceUnitBefore: 'yards',
          result: 'rough', distanceToHoleAfter: 20, distanceUnitAfter: 'yards', shotDistance: 130,
        }),
        makeShotRecord({
          shotNumber: 3, shotType: 'around_green', clubType: 'non_driver', lieBefore: 'rough',
          distanceToHoleBefore: 20, distanceUnitBefore: 'yards',
          result: 'green', distanceToHoleAfter: 2, distanceUnitAfter: 'feet', shotDistance: 20,
        }),
        makeShotRecord({
          shotNumber: 4, shotType: 'putting', clubType: 'putter', lieBefore: 'green',
          distanceToHoleBefore: 2, distanceUnitBefore: 'feet',
          result: 'hole', distanceToHoleAfter: 0, distanceUnitAfter: 'feet', shotDistance: 0,
        }),
      ];
      const hole = makeRoundHole({ par: 4 });
      const stats = calculateHoleStats(shots, hole);

      expect(stats.score).toBe(4);
      expect(stats.putts).toBe(1);
      expect(stats.firstPuttDistance).toBe(2);
      expect(stats.scrambleAttempt).toBe(true);
      expect(stats.scrambleMade).toBe(true);
    });

    it('handles no putts (hole out)', () => {
      const stats = calculateHoleStats(holeOutShotRecords(), makeRoundHole({ par: 4, yardage: 350 }));
      expect(stats.putts).toBe(0);
      expect(stats.firstPuttDistance).toBeNull();
    });
  });
});
