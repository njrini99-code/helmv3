import { describe, it, expect } from 'vitest';
import {
  calculateStrokesGainedForShot,
  getExpectedStrokes,
  withNextShotStart,
  withRecoveryStart,
  type RawShot,
} from '../golf-stats-calculator-shots';
import { attachShotStrokesGained } from '@/components/golf/coachhelm/round-review/shot-strokes-gained';
import { makeRawShot } from '@/test/fixtures/golf-shots';

// A par 4: drive into the trees, punch out, wedge on, two putts (5 strokes).
function blockedHole(flag: boolean | null, punchLie = 'other'): RawShot[] {
  return [
    makeRawShot({ id: 'tee', shot_number: 1, shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 400,
      result: 'other', lie_after: 'rough', distance_to_hole_after: 150, lie_after_recovery: flag }),
    makeRawShot({ id: 'punch', shot_number: 2, shot_type: 'approach', lie_before: punchLie, distance_to_hole_before: 150,
      result: 'fairway', lie_after: 'fairway', distance_to_hole_after: 90 }),
    makeRawShot({ id: 'wedge', shot_number: 3, shot_type: 'approach', lie_before: 'fairway', distance_to_hole_before: 90,
      result: 'green', lie_after: 'green', distance_to_hole_after: 20, distance_unit_after: 'feet' }),
    makeRawShot({ id: 'putt1', shot_number: 4, shot_type: 'putting', lie_before: 'green', distance_to_hole_before: 20,
      distance_unit_before: 'feet', result: 'green', lie_after: 'green', distance_to_hole_after: 2, distance_unit_after: 'feet' }),
    makeRawShot({ id: 'putt2', shot_number: 5, shot_type: 'putting', lie_before: 'green', distance_to_hole_before: 2,
      distance_unit_before: 'feet', result: 'hole', putt_made: true, distance_to_hole_after: 0 }),
  ];
}

function perShotSg(hole: RawShot[]): number[] {
  return hole.map((s) => calculateStrokesGainedForShot(withNextShotStart(withRecoveryStart(s, hole), hole)) ?? NaN);
}

describe('recovery tap (golf_shots.lie_after_recovery)', () => {
  it('prices the shot after a blocked drive from the recovery curve and charges the drive', () => {
    const hole = blockedHole(true);
    expect(withRecoveryStart(hole[1]!, hole).lie_before).toBe('recovery');
    expect(withNextShotStart(hole[0]!, hole).lie_after).toBe('recovery');
    const [drive, punch] = perShotSg(hole);
    expect(drive).toBeCloseTo(getExpectedStrokes('tee', 400) - 1 - getExpectedStrokes('recovery', 150), 6);
    expect(punch).toBeCloseTo(getExpectedStrokes('recovery', 150) - 1 - getExpectedStrokes('fairway', 90), 6);
  });

  it('keeps the hole telescoping: the flag moves strokes between shots, never the total', () => {
    const total = (flag: boolean | null) => perShotSg(blockedHole(flag)).reduce((a, b) => a + b, 0);
    const expected = getExpectedStrokes('tee', 400) - 5;
    expect(total(true)).toBeCloseTo(expected, 6);
    expect(total(false)).toBeCloseTo(expected, 6);
    expect(total(null)).toBeCloseTo(expected, 6);
  });

  it('does nothing when the player said clear, was not asked, or the ball is not in rough or other', () => {
    for (const hole of [blockedHole(false), blockedHole(null), blockedHole(true, 'fairway'), blockedHole(true, 'sand')]) {
      expect(withRecoveryStart(hole[1]!, hole).lie_before).toBe(hole[1]!.lie_before);
      expect(withNextShotStart(hole[0]!, hole).lie_after).toBe(hole[1]!.lie_before);
    }
  });

  it('works through a rough lie as well as other', () => {
    const hole = blockedHole(true, 'rough');
    expect(withRecoveryStart(hole[1]!, hole).lie_before).toBe('recovery');
    expect(withNextShotStart(hole[0]!, hole).lie_after).toBe('recovery');
  });

  it('a penalty drop between the drive and the next shot clears the tap', () => {
    const hole = blockedHole(true);
    const withPenalty: RawShot[] = [
      hole[0]!,
      makeRawShot({ id: 'pen', shot_number: 2, shot_type: 'penalty', is_penalty: true, result: 'penalty',
        lie_before: 'other', distance_to_hole_before: 150, lie_after_recovery: true }),
      ...hole.slice(1).map((s) => ({ ...s, shot_number: s.shot_number + 1 })),
    ];
    // An unplayable drop moved the ball: the shot after it is priced from its
    // own lie, and the drive ends there. A penalty row's own flag never counts.
    expect(withRecoveryStart(withPenalty[2]!, withPenalty).lie_before).toBe('other');
    expect(withNextShotStart(withPenalty[0]!, withPenalty).lie_after).toBe('other');
    expect(withRecoveryStart(withPenalty[1]!, withPenalty).lie_before).toBe('other');
    const reviewed = attachShotStrokesGained(withPenalty);
    const engine = perShotSg(withPenalty);
    // The penalty row itself is priced by each path's own penalty rule; compare the shots.
    reviewed.forEach((s, i) => {
      if (i !== 1) expect(s.sg).toBeCloseTo(engine[i]!, 6);
    });
  });

  it('round review per-shot SG agrees with the Stats engine', () => {
    const hole = blockedHole(true);
    const reviewed = attachShotStrokesGained(hole);
    const engine = perShotSg(hole);
    reviewed.forEach((s, i) => expect(s.sg).toBeCloseTo(engine[i]!, 6));
  });
});
