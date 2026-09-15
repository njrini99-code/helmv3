import type { DiagramEvent, LocalFeature, PointM } from './types';
import { inFeature } from './spatial';
import { RECONSTRUCTION_LIMITS } from './reconstruct';
import { createSurfaceGuard } from './surface-compatibility';

/** Defense at the scene boundary, independent of label layout. A representative
 * remains an estimate even when one reviewed surface is compatible. */
export function checkedAnchor(event: DiagramEvent, features: readonly LocalFeature[]): PointM | null {
  if (event.placement !== 'compatible_estimate' || !event.anchorM ||
    !event.anchorM.every(Number.isFinite) || event.evidence.penalty ||
    event.evidence.shotType === 'putting' || event.evidence.result === 'hole' ||
    event.evidence.issues.length || event.candidateFeatureIds.length !== 1) return null;
  const kind = { sand: 'bunker', fairway: 'fairway', green: 'green', rough: 'rough' }[event.evidence.result ?? ''];
  if (!kind) return null;
  const feature = features.find(f => f.id === event.inferredSurfaceFeatureId &&
    f.id === event.candidateFeatureIds[0] && f.kind === kind && f.reviewed);
  return feature && inFeature(event.anchorM, feature) &&
    createSurfaceGuard(features).clearance(event.anchorM, feature.kind, 1e-6) > 0 ? event.anchorM : null;
}

/** Feasible cells are conditional hypotheses and stay clipped by the renderer
 * to this same canonical feature. Invalid annotations cannot create a surface. */
export function checkedRegions(event: DiagramEvent, features: readonly LocalFeature[]): NonNullable<DiagramEvent['regions']> {
  if (!event.regions?.length || event.evidence.penalty || event.evidence.shotType === 'putting' ||
    event.evidence.issues.length || !['ambiguous', 'compatible_estimate'].includes(event.placement)) return [];
  const kind = { sand: 'bunker', fairway: 'fairway', green: 'green', rough: 'rough' }[event.evidence.result ?? ''];
  if (!kind || event.regions.reduce((sum, r) => sum + r.cells.length, 0) > RECONSTRUCTION_LIMITS.regionCellsPerEvent) return [];
  const guard = createSurfaceGuard(features);
  return event.regions.filter(region => {
    const feature = features.find(f => f.id === region.featureId && f.reviewed && f.kind === kind);
    return region.basis === 'sampled_feasible_region' && event.candidateFeatureIds.includes(region.featureId) && feature &&
      region.cells.length > 0 && region.cells.every(cell => [...cell.centerM, cell.radiusM].every(Number.isFinite) &&
        cell.radiusM > 0 && cell.radiusM <= RECONSTRUCTION_LIMITS.maximumCellRadiusM && inFeature(cell.centerM, feature) &&
        guard.clearance(cell.centerM, feature.kind, cell.radiusM) + 1e-7 >= cell.radiusM);
  });
}

/** Do not derive a segment merely because two arbitrary points are adjacent.
 * A connector must come from the same retained reconstruction sequence. */
export function checkedConnection(event: DiagramEvent, previous: DiagramEvent | undefined,
  features: readonly LocalFeature[]): NonNullable<DiagramEvent['connection']> | null {
  const connection = event.connection;
  if (!connection || !previous || connection.basis !== 'inferred_endpoint_separation' ||
    event.evidence.shotNumber !== previous.evidence.shotNumber + 1 ||
    ![...connection.fromM, ...connection.toM, connection.distanceM].every(Number.isFinite)) return null;
  const from = checkedAnchor(previous, features), to = checkedAnchor(event, features);
  if (!from || !to || connection.distanceM < 0 ||
    Math.hypot(from[0] - connection.fromM[0], from[1] - connection.fromM[1]) > 1e-7 ||
    Math.hypot(to[0] - connection.toM[0], to[1] - connection.toM[1]) > 1e-7 ||
    Math.abs(Math.hypot(from[0] - to[0], from[1] - to[1]) - connection.distanceM) > 1e-7) return null;
  return connection;
}
