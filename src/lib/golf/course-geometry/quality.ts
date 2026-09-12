import type { DiagramEvent, LocalFeature, PointM } from './types';
import { inFeature } from './spatial';

/** Defense at the scene boundary, independent of label layout. Stage 2 only
 * supplies physical anchors in analytic fixtures; ordinary evidence stays null. */
export function checkedAnchor(event: DiagramEvent, features: readonly LocalFeature[]): PointM | null {
  if (event.placement !== 'compatible_estimate' || !event.anchorM ||
    !event.anchorM.every(Number.isFinite) || event.evidence.penalty ||
    event.evidence.shotType === 'putting' || event.evidence.result === 'hole' ||
    event.evidence.issues.length || event.candidateFeatureIds.length !== 1) return null;
  const kind = { sand: 'bunker', fairway: 'fairway', green: 'green', rough: 'rough' }[event.evidence.result ?? ''];
  if (!kind) return null;
  const feature = features.find(f => f.id === event.inferredSurfaceFeatureId &&
    f.id === event.candidateFeatureIds[0] && f.kind === kind && f.reviewed);
  return feature && inFeature(event.anchorM, feature) ? event.anchorM : null;
}
