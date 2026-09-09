import { describe, it, expect } from 'vitest';
import { makeShotRecord } from '@/test/fixtures/golf-shots';
import { buildPenaltyShot } from '@/hooks/golf/use-penalty-handler';

/**
 * A penalty row is a stroke of its own; its position is where the ball is
 * played from NEXT. OB / lost ball are stroke and distance — the next stroke
 * is replayed from where the errant shot was hit — while water / unplayable
 * play on from the drop. Before this, every penalty copied the drop spot, so
 * OB holes were scored a stroke short (the re-tee never got entered) and the
 * penalty was charged to the wrong part of the game.
 */
const teeShotIntoTrouble = makeShotRecord({
  shotNumber: 1, shotType: 'tee', lieBefore: 'tee',
  distanceToHoleBefore: 400, distanceUnitBefore: 'yards',
  result: 'other', distanceToHoleAfter: 180, distanceUnitAfter: 'yards',
});

// Position after that shot was recorded: the provisional / drop spot.
const atTheLandingSpot = {
  shotHistory: [teeShotIntoTrouble],
  currentShot: 2,
  currentLie: 'other' as const,
  distanceToHole: 180,
  distanceUnit: 'yards' as const,
};

describe('buildPenaltyShot', () => {
  it('OB is stroke and distance: back to the tee at full yardage', () => {
    const row = buildPenaltyShot(atTheLandingSpot, 'ob');
    expect(row).toMatchObject({
      shotNumber: 2, shotType: 'penalty', isPenalty: true, penaltyType: 'ob', result: 'penalty',
      lieBefore: 'tee', distanceToHoleAfter: 400, distanceUnitAfter: 'yards', shotDistance: 0,
    });
  });

  it('lost ball is stroke and distance too', () => {
    const row = buildPenaltyShot(atTheLandingSpot, 'lost');
    expect(row.lieBefore).toBe('tee');
    expect(row.distanceToHoleAfter).toBe(400);
  });

  it('water plays on from the drop: keeps the current position', () => {
    const row = buildPenaltyShot(atTheLandingSpot, 'water');
    expect(row.lieBefore).toBe('other');
    expect(row.distanceToHoleAfter).toBe(180);
    expect(row.penaltyType).toBe('water');
  });

  it('unplayable plays on from the drop', () => {
    const row = buildPenaltyShot(atTheLandingSpot, 'unplayable');
    expect(row.lieBefore).toBe('other');
    expect(row.distanceToHoleAfter).toBe(180);
  });

  it('OB on a mid-hole shot replays from that shot\'s own spot, not the tee', () => {
    const approach = makeShotRecord({
      shotNumber: 2, shotType: 'approach', lieBefore: 'fairway',
      distanceToHoleBefore: 180, distanceUnitBefore: 'yards',
      result: 'other', distanceToHoleAfter: 40, distanceUnitAfter: 'yards',
    });
    const row = buildPenaltyShot({
      shotHistory: [teeShotIntoTrouble, approach], currentShot: 3,
      currentLie: 'other', distanceToHole: 40, distanceUnit: 'yards',
    }, 'ob');
    expect(row.lieBefore).toBe('fairway');
    expect(row.distanceToHoleAfter).toBe(180);
  });

  it('skips earlier penalty rows when finding the shot that earned this one', () => {
    const firstPenalty = buildPenaltyShot(atTheLandingSpot, 'water');
    const row = buildPenaltyShot({
      ...atTheLandingSpot, shotHistory: [teeShotIntoTrouble, firstPenalty], currentShot: 3,
    }, 'ob');
    expect(row.lieBefore).toBe('tee');
    expect(row.distanceToHoleAfter).toBe(400);
  });

  it('falls back to the current position when no shot has been recorded yet', () => {
    const row = buildPenaltyShot({ ...atTheLandingSpot, shotHistory: [], currentShot: 1, currentLie: 'tee', distanceToHole: 400 }, 'ob');
    expect(row.lieBefore).toBe('tee');
    expect(row.distanceToHoleAfter).toBe(400);
  });
});
