import { checkedAnchor } from './quality';
import type { HoleScene, PointM, ShotEvidence } from './types';

function pointAlong(a: PointM, b: PointM, amount: number): PointM {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount];
}

/**
 * Creates an intentionally labelled visual path from evidence already accepted
 * by reconstruction. It is not a recorded flight, a carry calculation, or a
 * spatial write. Ambiguous outcomes and penalty relocations remain without a
 * representative flight so the renderer cannot accidentally make them look
 * measured.
 */
export function decorateSceneWithDisplayTrajectories(scene: HoleScene): HoleScene {
  const route = scene.features.find(feature => feature.id === scene.hole.routeFeatureId && feature.kind === 'route')?.parts[0]?.[0];
  const retained = (scene.illustrativePreviewTrajectories ?? []).filter(item => item.source === 'interactive_preview_fixture');
  if (!route?.length) return retained.length === (scene.illustrativePreviewTrajectories?.length ?? 0) ? scene : {
    ...scene, illustrativePreviewTrajectories: retained,
  };

  const trajectories: NonNullable<HoleScene['illustrativePreviewTrajectories']>[number][] = [];
  let previous: { shotNumber: number; pointM: PointM; evidence: ShotEvidence } | null = null;

  for (const event of [...scene.events].sort((a, b) => a.evidence.shotNumber - b.evidence.shotNumber)) {
    const { evidence } = event;
    if (evidence.penalty || evidence.shotType === 'putting' || evidence.result === 'hole') {
      previous = null;
      continue;
    }
    const toM = checkedAnchor(event, scene.features);
    if (!toM) {
      previous = null;
      continue;
    }

    const fromM = previous && previous.shotNumber + 1 === evidence.shotNumber && !previous.evidence.penalty
      ? previous.pointM
      : evidence.shotType === 'tee' ? route[0]!
        : null;
    if (fromM) {
      trajectories.push({
        key: `reconstruction-display-flight-${evidence.eventKey}`,
        shotNumber: evidence.shotNumber,
        // A midpoint makes an elevated Three.js line legible while preserving
        // exact authoritative XY anchors at both ends.
        pointsM: [fromM, pointAlong(fromM, toM, .5), toM],
        source: 'reconstruction_display_estimate',
        anchorBasis: previous ? 'compatible_estimate' : 'route_reference',
      });
    }
    previous = { shotNumber: evidence.shotNumber, pointM: toM, evidence };
  }

  return {
    ...scene,
    illustrativePreviewTrajectories: [...retained, ...trajectories],
  };
}
