import type { SceneMarker, SceneMarkerLink, SceneMarkers } from '../course-geometry/scene-markers';
import { liveAnchors, type ShotAnchor } from './shot-anchor';

/** What the player sees on the course after each tap: every live anchor of
 * the hole as a dot with its σ ring, the newest finalized one labelled YOU,
 * consecutive finalized anchors joined by the derived shot. A provisional
 * anchor (the 750 ms refinement window) is hollow and unlabelled; a terminal
 * anchor (cup mark) is marked as such. Tombstoned anchors are not drawn, and
 * nothing is ever snapped. */
export function markersFromAnchors(anchors: readonly ShotAnchor[], rippleKey: string | null = null): SceneMarkers {
  const live = liveAnchors(anchors).filter(a => a.provisional ? a.rawLocationSamples.length > 0 : true);
  const finalized = live.filter(a => !a.provisional), newest = finalized.at(-1) ?? null;
  const markers: SceneMarker[] = live.map(a => {
    const kind = a.provisional ? 'provisional' : a.terminal ? 'terminal' : a === newest ? 'you' : 'anchor';
    const label = a.provisional ? undefined : a.terminal ? 'HOLED' : a === newest ? 'YOU' : String(finalized.indexOf(a) + 1);
    return { key: a.id, pointM: [a.positionENU[0], a.positionENU[1]], kind, sigmaM: a.sigmaM, label };
  });
  const links: SceneMarkerLink[] = [];
  for (let i = 1; i < finalized.length; i++) {
    const a = finalized[i - 1]!, b = finalized[i]!;
    links.push({ key: `${a.id}>${b.id}`, fromM: [a.positionENU[0], a.positionENU[1]], toM: [b.positionENU[0], b.positionENU[1]] });
  }
  return { markers, links, rippleKey };
}
