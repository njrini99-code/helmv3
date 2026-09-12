import type { CourseGeometryPackage, HoleScene, ShotEvidence } from './types';
import { localFeature } from './schema';
import { auditContinuity } from './normalize';
import { fitCamera } from './project';

/** Stage 2 leaves endpoints unresolved. Stage 5 adds bounded latent-target
 * sequences, not circles fed with legacy derived lengths. The same scene
 * feeds review, compact, strip and export without reinterpreting evidence. */
export function buildHoleScene(pkg: CourseGeometryPackage, holeKey: string, evidence: readonly ShotEvidence[] = []): HoleScene {
  const hole = pkg.holes.find(h => h.key === holeKey);
  if (!hole) throw new Error('Unknown physical hole');
  const features = pkg.features.filter(f => hole.featureIds.includes(f.id)).map(f => localFeature(f, pkg));
  const route = features.find(f => f.id === hole.routeFeatureId)?.parts[0]?.[0];
  if (!route || route.length < 2) throw new Error('Missing physical routing');
  const start = route[0]!, end = route.at(-1)!;
  const targetUp = Math.PI / 2 - Math.atan2(end[1] - start[1], end[0] - start[0]);
  const points = features.flatMap(f => f.parts.flat(2));
  // One geometry-only orientation for BOTH contexts. Maximize uniform scale
  // in their shared reference aspect; the tee stays below-left of the target.
  let orientationRadians = targetUp - Math.PI / 6;
  let bestScale = 0;
  for (let degrees = -60; degrees <= -16; degrees += 2) {
    const angle = targetUp + degrees * Math.PI / 180;
    const scale = fitCamera(points, 320, 360, angle, 12).scale;
    if (scale > bestScale) { bestScale = scale; orientationRadians = angle; }
  }
  return {
    overlayKind: 'unresolved', packageHash: pkg.contentHash, physicalHoleKey: holeKey, algorithmVersion: 'evidence-only-v1',
    target: { kind: 'unknown_pin', greenFeatureId: hole.greenFeatureId }, hole, features, orientationRadians,
    attribution: [...new Set(pkg.sources.map(s => s.attribution))].join(' · '),
    events: auditContinuity(evidence).map(e => ({ evidence: e, anchorM: null,
      placement: e.penalty || e.shotType === 'putting' || e.result === 'hole' ? 'schematic' : 'unknown',
      inferredSurfaceFeatureId: null, candidateFeatureIds: [],
      reasons: [...e.issues, e.penalty ? 'penalty_transition_without_flight' : 'endpoint_not_determined'],
    })),
  };
}
