import { describe, expect, it } from 'vitest';
import { calculateStatsFromShots } from '../golf-stats-calculator-shots';
import { makeHoleInfo, makeRawShot, makeRoundInfo } from '@/test/fixtures/golf-shots';

/**
 * Off the tee's sentence "N penalty strokes a round come off the tee" (coach audit 13 Nov) printed every penalty.
 * teePenaltiesPerRound counts the penalties SG-4 charges to the tee: earned by a tee shot on a par 4 or 5.
 */
describe('teePenaltiesPerRound', () => {
  const pen = (hole: number, shot: number, lie: string) =>
    makeRawShot({ hole_number: hole, shot_number: shot, shot_type: 'penalty', is_penalty: true, result: 'penalty', lie_before: lie, club_type: null });
  const shots = [
    // Hole 1, par 4: drive into water, drop in the fairway: a tee penalty.
    makeRawShot({ hole_number: 1, shot_number: 1, result: 'water' }),
    pen(1, 2, 'fairway'),
    // Hole 2, par 3: tee shot OB, re-tee: charged to approach (a par 3's tee shot is an approach).
    makeRawShot({ hole_number: 2, shot_number: 1, club_type: 'non_driver', distance_to_hole_before: 180, result: 'ob' }),
    pen(2, 2, 'tee'),
    // Hole 3, par 5: approach from the fairway into water: an approach penalty.
    makeRawShot({ hole_number: 3, shot_number: 1, result: 'fairway' }),
    makeRawShot({ hole_number: 3, shot_number: 2, shot_type: 'approach', club_type: 'non_driver', lie_before: 'fairway', distance_to_hole_before: 230, result: 'water' }),
    pen(3, 3, 'fairway'),
  ];
  const holes = Array.from({ length: 18 }, (_, i) =>
    makeHoleInfo({ hole_number: i + 1, par: i === 1 ? 3 : i === 2 ? 5 : 4, penalty_strokes: i < 3 ? 1 : 0 }),
  );

  it('counts only penalties earned off a par-4 or par-5 tee, per 18 holes', () => {
    const stats = calculateStatsFromShots(shots, holes, [makeRoundInfo()]);
    expect(stats.teePenaltiesPerRound).toBe(1);
  });

  it('leaves every penalty in penaltiesPerRound, as Fairway reads it', () => {
    const stats = calculateStatsFromShots(shots, holes, [makeRoundInfo()]);
    expect(stats.penaltiesPerRound).toBe(3);
  });

  it('is null when no hole was played', () => {
    expect(calculateStatsFromShots([], [], []).teePenaltiesPerRound).toBeNull();
  });
});
