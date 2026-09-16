import type { CourseGeometryPackage, HoleScene, ShotEvidence } from './types';
import { localFeature } from './schema';
import { auditContinuity } from './normalize';
import { fitCamera, projectToLocal } from './project';
import type { TerrainMesh } from './terrain';
import { greenReferencePoint, nominalGreenPin, reconstructHoleEvidence } from './reconstruct';

/** The same physical coordinates and bounded evidence reconstruction feed
 * review, compact, strip and export. Camera fitting never changes evidence. */
export function buildHoleScene(pkg: CourseGeometryPackage, holeKey: string, evidence: readonly ShotEvidence[] = [], terrain?: TerrainMesh): HoleScene {
  const hole = pkg.holes.find(h => h.key === holeKey);
  if (!hole) throw new Error('Unknown physical hole');
  const features = pkg.features.filter(f => hole.featureIds.includes(f.id)).map(f => localFeature(f, pkg));
  const route = features.find(f => f.id === hole.routeFeatureId)?.parts[0]?.[0];
  if (hole.routeFeatureId && (!route || route.length < 2)) throw new Error('Missing physical routing');
  const start = route?.[0], end = route?.at(-1);
  const targetUp = start && end ? Math.PI / 2 - Math.atan2(end[1] - start[1], end[0] - start[0]) : 0;
  const points = features.filter(f => f.kind !== 'woods').flatMap(f => f.parts.flat(2));
  // One geometry-only orientation for BOTH contexts. Maximize uniform scale
  // in their shared reference aspect; the tee stays below-left of the target.
  let orientationRadians = targetUp - Math.PI / 6;
  let bestScale = 0;
  for (let degrees = -60; route && degrees <= -16; degrees += 2) {
    const angle = targetUp + degrees * Math.PI / 180;
    const scale = fitCamera(points, 320, 360, angle, 12).scale;
    if (scale > bestScale) { bestScale = scale; orientationRadians = angle; }
  }
  if (!route) orientationRadians = 0; // North-up context; no invented tee/route.
  const reconstructed = reconstructHoleEvidence(hole, features, auditContinuity(evidence), pkg.status);
  const events = reconstructed.events;
  const reference = greenReferencePoint(hole, features);
  const estimate = reconstructed.estimatedPin ?? nominalGreenPin(hole, features, pkg.status,
    hole.nominalTargetWgs84 ? projectToLocal(hole.nominalTargetWgs84, pkg.originWgs84) : undefined);
  return {
    ...(terrain?.geometryHash === pkg.contentHash && terrain.physicalHoleKey === holeKey ? { terrain,
      contextFeatures: pkg.features.filter(f => terrain.contextFeatureIds?.includes(f.id) && !hole.featureIds.includes(f.id)).map(f => localFeature(f, pkg)),
    } : {}),
    overlayKind: events.some(e => e.regions?.length) ? 'estimated_regions' : 'unresolved',
    packageHash: pkg.contentHash, physicalHoleKey: holeKey, algorithmVersion: 'manual-bounds-v1',
    sharedGreenHoleOrdinals: hole.greenFeatureId ? pkg.holes.filter(h => h.greenFeatureId === hole.greenFeatureId).map(h => h.ordinal) : [],
    target: { kind: 'unknown_pin', greenFeatureId: hole.greenFeatureId, ...(estimate ? { estimate } : {}), ...(reference ? { reference } : {}) }, hole, features, orientationRadians,
    attribution: [...new Set(pkg.sources.map(s => s.attribution))].join(' · '),
    events,
  };
}
