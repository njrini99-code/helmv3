import { describe, it, expect } from 'vitest';
import { makeShotRecord, makeRoundHole } from '@/test/fixtures/golf-shots';
import { buildErrantStroke, buildPenaltyShot } from '@/hooks/golf/use-penalty-handler';
import type { ShotTrackingState } from '@/hooks/golf/use-shot-state-machine';

/** A full tracking state at rest; tests override the position they need. */
function standingState(): ShotTrackingState {
  return {
    currentShot: 1, shotHistory: [], distanceToHole: 400, distanceUnit: 'yards', currentLie: 'tee', holeYardage: 400,
    usedDriver: null, resultOfShot: null, missDirection: null, puttBreak: null, puttSlope: null, puttMissTags: [],
    approachMissDirection: null, approachMissLieType: undefined, distanceAfterShot: '', distanceAfterUnit: 'yards',
    autoSaveStatus: 'idle', pendingSaveCount: 0, showPenaltyModal: false, penaltyType: null, penaltyOrigin: 'here',
    showUndoConfirm: false, undoSaving: false, undoError: null, showEditModal: false, editingShot: null,
    editFormData: null, editSaving: false, editError: null, showDeleteConfirm: false, selectedShotNumber: null,
  } as unknown as ShotTrackingState;
}

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

/**
 * 2026-09-10 (owner's test round d69bd372, hole 1): shot 3 entered as tee →
 * fairway 115; the player then hit from the fairway, lost it, and tapped
 * Penalty WITHOUT entering that stroke — and was sent back to the tee at 420.
 * The un-entered stroke is the one that went; it is recorded from the current
 * spot and the replay is from there.
 */
describe('buildPenaltyShot — origin', () => {
  const safeInFairway = makeShotRecord({
    shotNumber: 3, shotType: 'tee', lieBefore: 'tee',
    distanceToHoleBefore: 420, distanceUnitBefore: 'yards',
    result: 'fairway', distanceToHoleAfter: 115, distanceUnitAfter: 'yards',
  });
  const standingInFairway = {
    shotHistory: [safeInFairway],
    currentShot: 4,
    currentLie: 'fairway' as const,
    distanceToHole: 115,
    distanceUnit: 'yards' as const,
  };

  it("'here' replays from the current position, not the last entered shot's start", () => {
    const row = buildPenaltyShot(standingInFairway, 'lost', 'here', 5);
    expect(row).toMatchObject({ shotNumber: 5, lieBefore: 'fairway', distanceToHoleAfter: 115, penaltyType: 'lost' });
  });

  it("'entered' still replays from where the last entered shot was hit", () => {
    const row = buildPenaltyShot(standingInFairway, 'ob', 'entered');
    expect(row).toMatchObject({ shotNumber: 4, lieBefore: 'tee', distanceToHoleAfter: 420 });
  });

  it('water ignores origin: plays on from the drop either way', () => {
    expect(buildPenaltyShot(standingInFairway, 'water', 'entered').distanceToHoleAfter).toBe(115);
    expect(buildPenaltyShot(standingInFairway, 'water', 'here').distanceToHoleAfter).toBe(115);
  });
});

describe('buildErrantStroke', () => {
  it('records the un-entered stroke from the current spot with the ball back at the same spot', () => {
    const state = {
      ...standingState(),
      shotHistory: [],
      currentShot: 1,
      currentLie: 'tee' as const,
      distanceToHole: 420,
      distanceUnit: 'yards' as const,
      usedDriver: true,
    };
    const row = buildErrantStroke(state, makeRoundHole({ par: 4 }));
    expect(row).toMatchObject({
      shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
      distanceToHoleBefore: 420, result: 'other', distanceToHoleAfter: 420, isPenalty: false,
    });
  });

  it('types a fairway stroke by distance and never as a driver', () => {
    const state = { ...standingState(), currentShot: 4, currentLie: 'fairway' as const, distanceToHole: 115, distanceUnit: 'yards' as const, usedDriver: true };
    const row = buildErrantStroke(state, makeRoundHole({ par: 4 }));
    expect(row.shotType).toBe('approach');
    expect(row.clubType).toBe('non_driver');
  });
});
