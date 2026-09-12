import source from './cacapon.json';
import { parseGeometryPackage } from '@/lib/golf/course-geometry/schema';
import { buildHoleScene } from '@/lib/golf/course-geometry/build-scene';
import { normalizeLiveShot } from '@/lib/golf/course-geometry/normalize';
import type { ShotRecord } from '@/lib/types/golf';

export const pilotPackage = parseGeometryPackage(source);
/** Synthetic ledger, never production player data. The numeric evidence does
 * not prove any endpoint on the pilot course, so all physical anchors stay null. */
export const pilotShots: ShotRecord[] = [
  { shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee',
    distanceToHoleBefore: 383, distanceUnitBefore: 'yards', result: 'fairway',
    distanceToHoleAfter: 148, distanceUnitAfter: 'yards', shotDistance: 235, isPenalty: false },
  { shotNumber: 2, shotType: 'approach', clubType: 'non_driver', lieBefore: 'fairway',
    distanceToHoleBefore: 148, distanceUnitBefore: 'yards', result: 'sand',
    distanceToHoleAfter: 18, distanceUnitAfter: 'yards', shotDistance: 135, isPenalty: false,
    approachMissDirection: 'short_left', missDirection: 'short_left' },
];
export function pilotScene(holeKey = 'cacapon-01', includeEvents = true) {
  return buildHoleScene(pilotPackage, holeKey, includeEvents ? pilotShots.map(normalizeLiveShot) : []);
}

/** Presentation fixture with explicitly supplied test coordinates. These are
 * NOT the output of reconstructing player entries. Ordinary pilotScene stays
 * unresolved. This separate fixture demonstrates marker styling/containment. */
export function illustrativeScene() {
  const scene = pilotScene('cacapon-07');
  scene.overlayKind = 'analytic_fixture';
  const fixtures = [
    { feature: 'osm-way-885719202', point: [139.3914878419688, 524.840140060172] as const, before: 431, after: 158, miss: undefined },
    { feature: 'osm-way-885719199', point: [178.12531033169677, 398.3275348976763] as const, before: 158, after: 17, miss: 'short_right' as const },
  ];
  scene.events = fixtures.map((fixture, i) => ({
    evidence: normalizeLiveShot({ ...pilotShots[i]!, distanceToHoleBefore: fixture.before, distanceToHoleAfter: fixture.after,
      missDirection: fixture.miss, approachMissDirection: fixture.miss }),
    anchorM: fixture.point, placement: 'compatible_estimate', inferredSurfaceFeatureId: fixture.feature,
    candidateFeatureIds: [fixture.feature], reasons: ['analytic_fixture_only_not_a_reconstruction'],
  }));
  return scene;
}
