import { checkedAnchor, checkedRegions } from './quality';
import type { HoleScene, ShotEvidence } from './types';

/** Copy follows the same validated evidence as the overlay, including cases
 * where the scene is missing. A possible surface is never an observed finish. */
export function describePosition(scene: HoleScene | null | undefined, evidence: ShotEvidence) {
  if (evidence.penalty) return { label: 'Penalty event', detail: 'Penalty stroke. No flight; the next origin follows the recorded penalty transition.' };
  if (evidence.shotType === 'putting') return { label: 'Putting distances', detail: 'Recorded putting distances. The line is illustrated; it does not measure break or the day’s pin location.' };
  if (evidence.result === 'hole') return { label: 'Holed · pin unknown', detail: 'Recorded as holed. The actual cup location is unknown.' };
  const event = scene?.events.find(candidate => candidate.evidence.eventKey === evidence.eventKey);
  if (event && scene) {
    if (checkedAnchor(event, scene.features)) return { label: 'Estimated position', detail: 'Estimated finish within a compatible reviewed surface. The dashed connection is an estimate, not measured ball flight. Pin location unknown.' };
    const regions = checkedRegions(event, scene.features);
    const constraints = !event.evidence.miss ? 'distance and mapped surface'
      : event.reasons.includes('direction_frame_unresolved') || event.reasons.includes('tee_direction_aim_unknown')
        ? 'distance and mapped surface; the direction frame is unresolved'
        : 'distance and direction';
    if (regions.length) return {
      label: regions.length > 1 ? `${regions.length} possible areas` : 'Possible area',
      detail: regions.length > 1
        ? `${regions.length} mapped surfaces fit the recorded ${constraints}. Shading shows possible areas; it does not select an exact finish. Pin location unknown.`
        : `Shading shows a possible area that fits the recorded ${constraints}. It does not establish an exact finish. Pin location unknown.`,
    };
  }
  return { label: 'Position unresolved', detail: 'Position unresolved. Distances and direction do not establish an exact endpoint on this outline. Pin location unknown.' };
}
