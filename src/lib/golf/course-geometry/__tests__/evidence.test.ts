import { describe, it, expect } from 'vitest';
import { normalizeLiveShot, normalizePersistedShot, DIRECTIONS, auditContinuity } from '../normalize';
import { buildHoleScene } from '../build-scene';
import { parseGeometryPackage } from '../schema';
import { makeShotRecord } from '@/test/fixtures/golf-shots';
import { calculateHoleStats, calculateShotDistanceWithDirection } from '@/lib/utils/shot-helpers';
import { buildPenaltyShot } from '@/hooks/golf/use-penalty-handler';
import { displayToFeet, displayToYards } from '@/lib/golf/distance-units';
import source from '@/test/fixtures/course-geometry/cacapon.json';

describe('original evidence boundary', () => {
  it.each(DIRECTIONS)('preserves %s in live, edited and persisted evidence', direction => {
    const live = normalizeLiveShot(makeShotRecord({ shotType: 'approach', approachMissDirection: direction, missDirection: direction }));
    const db = normalizePersistedShot({ shot_number: 2, shot_type: 'approach', miss_direction: direction });
    expect(live.miss).toBe(direction); expect(db.miss).toBe(direction);
  });
  it('keeps an edited tee fairway direction that normal entry would not ask for', () => {
    expect(normalizeLiveShot(makeShotRecord({ result: 'fairway', missDirection: 'right' })).miss).toBe('right');
  });
  it('keeps Other even with the historical lossy rough lie', () => {
    const e = normalizePersistedShot({ shot_number: 2, result: 'other', lie_after: 'rough' });
    expect(e.result).toBe('other'); expect(e.issues).toContain('lossy_other_lie');
  });
  it('preserves independent before/after units, including rolled-off putts', () => {
    const e = normalizePersistedShot({ shot_number: 1, shot_type: 'putting', lie_before: 'green',
      result: 'sand', lie_after: 'sand', distance_to_hole_before: 20, distance_unit_before: 'feet',
      distance_to_hole_after: 5, distance_unit_after: 'feet' });
    expect(e.before.valueM).toBeCloseTo(6.096, 10); expect(e.after.valueM).toBeCloseTo(1.524, 10);
    expect(e.issues).toEqual([]);
  });
  it('meters are converted only at entry; equivalent canonical values stay equivalent', () => {
    const shot = makeShotRecord({ distanceToHoleBefore: displayToYards(91.44, 'meters'),
      distanceToHoleAfter: displayToFeet(1.524, 'meters'), distanceUnitAfter: 'feet', result: 'green' });
    const e = normalizeLiveShot(shot);
    expect(e.before.valueM).toBeCloseTo(91.44); expect(e.after.valueM).toBeCloseTo(1.524);
    expect(e.original).toEqual(shot);
  });
  it('unit conflicts are flagged without silently applying a lie-based override', () => {
    const e = normalizePersistedShot({ shot_number: 1, lie_before: 'green', distance_to_hole_before: 10, distance_unit_before: 'yards' });
    expect(e.before.valueM).toBeCloseTo(9.144); expect(e.issues).toContain('before:unit_lie_conflict');
    const unknown = normalizePersistedShot({ shot_number: 1, lie_before: 'green', distance_to_hole_before: 10 });
    expect(unknown.before.valueM).toBeNull(); expect(unknown.before.originalValue).toBe(10);
  });
  it('missing is not zero or straight; putt tags stay separate from direction', () => {
    const e = normalizePersistedShot({ shot_number: 1, shot_type: 'putting', miss_direction: 'low_short', putt_break: 'multiple', putt_slope: 'severe' });
    expect(e.before.valueM).toBeNull(); expect(e.miss).toBeNull();
    expect(e.putt.tags).toEqual(['low', 'short']); expect(e.putt.break).toBe('multiple');
    expect(normalizePersistedShot({ shot_number: 1 }).miss).toBeNull();
  });
  it('make/result is authoritative, never final index or remaining distance', () => {
    expect(normalizePersistedShot({ shot_number: 5, shot_type: 'putting', distance_to_hole_after: 0 }).putt.made).toBeNull();
    expect(normalizeLiveShot(makeShotRecord({ shotType: 'putting', result: 'hole' })).putt.made).toBe(true);
  });
  it('retains legacy calculated length and stats without using it for an endpoint', () => {
    const shot = makeShotRecord({ distanceToHoleBefore: 350, distanceToHoleAfter: 200, shotDistance: 150 });
    expect(calculateShotDistanceWithDirection(350, 200, 'right')).toBe(150);
    const stats = calculateHoleStats([shot], { number: 1, par: 4, yardage: 350 });
    const pkg = parseGeometryPackage(source);
    const scene = buildHoleScene(pkg, 'cacapon-01', [normalizeLiveShot(shot)]);
    expect(scene.events[0]!.anchorM).toBeNull(); expect(scene.target.kind).toBe('unknown_pin');
    expect(scene.events[0]!.evidence.legacyLength.estimated).toBe(true);
    expect(calculateHoleStats([shot], { number: 1, par: 4, yardage: 350 })).toEqual(stats);
    expect(stats.drivingDistance).toBe(150);
  });
  it.each(['ob', 'lost', 'water', 'unplayable'] as const)('preserves current-main %s penalty next origin and event numbering', type => {
    const shot = makeShotRecord({ result: 'other' });
    const penalty = buildPenaltyShot({ shotHistory: [shot], currentShot: 2, currentLie: 'other', distanceToHole: 150, distanceUnit: 'yards' }, type);
    const e = normalizeLiveShot(penalty);
    expect(e.shotNumber).toBe(2); expect(e.penalty!.nextDistance.originalValue).toBe(type === 'ob' || type === 'lost' ? 400 : 150);
    const scene = buildHoleScene(parseGeometryPackage(source), 'cacapon-01', [normalizeLiveShot(shot), e]);
    expect(scene.events[1]!.anchorM).toBeNull(); expect(scene.events[1]!.placement).toBe('schematic');
  });
  it('edits/undo rebuild from surviving events and diagnose inconsistent starts', () => {
    const first = normalizeLiveShot(makeShotRecord({ shotNumber: 1, distanceToHoleAfter: 100 }));
    const next = normalizeLiveShot(makeShotRecord({ shotNumber: 2, lieBefore: 'sand', distanceToHoleBefore: 110 }));
    expect(auditContinuity([first, next])[1]!.issues).toEqual(expect.arrayContaining(['neighbor_distance_conflict', 'neighbor_lie_conflict']));
    expect(auditContinuity([first])).toHaveLength(1); expect(next.issues).toEqual([]);
  });
});
