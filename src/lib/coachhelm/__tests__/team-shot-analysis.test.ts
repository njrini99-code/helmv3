import { describe, expect, it } from 'vitest';
import { analyzeTeamShots, type TeamShotRow } from '../team-shot-analysis';

let seq = 0;
function shot(over: Partial<TeamShotRow>): TeamShotRow {
  seq += 1;
  return {
    id: `s${seq}`,
    round_id: 'r1',
    hole_number: seq,
    shot_number: 1,
    shot_type: 'approach',
    club_type: null,
    lie_before: 'fairway',
    lie_after: 'green',
    distance_to_hole_before: 150,
    distance_unit_before: 'yards',
    distance_to_hole_after: 20,
    distance_unit_after: 'feet',
    result: 'green',
    is_penalty: false,
    ...over,
  };
}
const many = (n: number, over: Partial<TeamShotRow>) => Array.from({ length: n }, () => shot(over));

describe('analyzeTeamShots (audit row 3)', () => {
  it('charges long tee shots on the rising Tour curve, so a routine 450-yd drive is not a leak', () => {
    // Old flat 3.60 tee baseline charged ~0.6 strokes of false loss here.
    const out = analyzeTeamShots(
      many(40, {
        shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 450,
        lie_after: 'fairway', distance_to_hole_after: 170, distance_unit_after: 'yards', result: 'fairway',
      }),
    );
    const top = out.yardageCurve.find((b) => b.rangeEnd === null)!;
    expect(top.rangeStart).toBe(250);
    expect(top.avgSG).toBeGreaterThan(0);
  });

  it('never flags the open-ended top bucket as a dead zone, and flags closed buckets against the team', () => {
    const out = analyzeTeamShots([
      // Terrible long shots: open-ended bucket, not a dead zone.
      ...many(30, {
        shot_type: 'tee', lie_before: 'tee', distance_to_hole_before: 480,
        lie_after: 'rough', distance_to_hole_after: 300, distance_unit_after: 'yards', result: 'rough',
      }),
      // 150-175 yd approaches to 20 ft: the team's norm.
      ...many(40, { distance_to_hole_before: 160 }),
      // 100-125 yd approaches missing into the rough at 30 yd: a real dead zone vs the team.
      ...many(20, {
        distance_to_hole_before: 110, lie_after: 'rough', distance_to_hole_after: 30,
        distance_unit_after: 'yards', result: 'rough',
      }),
    ]);
    expect(out.deadZones.some((d) => d.rangeEnd === null)).toBe(false);
    const dz = out.deadZones.find((d) => d.rangeStart === 100)!;
    expect(dz).toBeDefined();
    expect(dz.rangeEnd).toBe(125);
    expect(dz.shotCount).toBe(20);
    // Both anchors are reported: vs the team (deficit) and vs Tour (avgSG).
    expect(dz.deficit).toBeGreaterThan(0.2);
    expect(dz.avgSG).toBeLessThan(0);
  });

  it('keeps penalty rows out of every shot context and counts them', () => {
    const out = analyzeTeamShots([
      ...many(20, {}),
      ...many(3, { shot_type: 'penalty', is_penalty: true, lie_before: 'other', lie_after: 'penalty', result: 'penalty' }),
    ]);
    expect(out.penaltyStrokes).toBe(3);
    const counted = out.yardageCurve.reduce((n, b) => n + b.shotCount, 0);
    expect(counted).toBe(20);
  });

  it('labels the unmapped "other" lie as recovery, charged on the rough curve, not the fairway', () => {
    const out = analyzeTeamShots([
      ...many(20, {}),
      ...many(20, { lie_before: 'other', distance_to_hole_before: 150 }),
    ]);
    const lies = out.topWeaknesses.map((w) => w.lie);
    expect(lies).toContain('recovery');
    expect(lies).not.toContain('other');
    const recovery = out.topWeaknesses.find((w) => w.lie === 'recovery')!;
    const fairway = out.topWeaknesses.find((w) => w.lie === 'fairway')!;
    // Same result from the rough curve earns more SG than from the fairway curve.
    expect(recovery.avgSG).toBeGreaterThan(fairway.avgSG);
  });

  it('returns empty, honest output for no shots', () => {
    expect(analyzeTeamShots([])).toEqual({
      yardageCurve: [],
      deadZones: [],
      topWeaknesses: [],
      teamAvgSG: null,
      penaltyStrokes: 0,
    });
  });
});
