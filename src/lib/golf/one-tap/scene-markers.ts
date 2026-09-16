import type { SceneMarker, SceneMarkerLink, SceneMarkers } from '../course-geometry/scene-markers';
import { hasFix, liveAnchors, type ShotAnchor } from './shot-anchor';

/** What the player sees on the course (master plan §5: YOU is not BALL).
 * Every live anchor of the hole is a dot with its σ ring; the newest
 * finalized one is the BALL, immutable until undone, and it never follows
 * the phone. YOU is the live device marker with its accuracy halo: it moves
 * continuously and is never shot truth. Consecutive finalized anchors are
 * joined by the derived shot; the walking path between them is never drawn
 * and never becomes a shot. A provisional anchor (the refinement window) is
 * hollow and unlabelled; a terminal anchor (cup mark) is marked as such.
 * Tombstoned anchors are not drawn, and nothing is ever snapped. */
export interface PlayerMarker {
  positionENU: readonly [number, number];
  /** Halo radius (metres): the smoothed reported accuracy. */
  accuracyM: number;
  /** No fresh fix: drawn dimmed, still where it last was. */
  stale?: boolean;
}
export const PLAYER_MARKER_KEY = 'player';
export function markersFromAnchors(anchors: readonly ShotAnchor[], rippleKey: string | null = null, player: PlayerMarker | null = null): SceneMarkers {
  const live = liveAnchors(anchors).filter(a => a.provisional ? hasFix(a) : true);
  const finalized = live.filter(a => !a.provisional), newest = finalized.at(-1) ?? null;
  const markers: SceneMarker[] = live.map(a => {
    const kind = a.provisional ? 'provisional' : a.terminal ? 'terminal' : a === newest ? 'ball' : 'anchor';
    const label = a.provisional ? undefined : a.terminal ? 'HOLED' : a === newest ? 'BALL' : String(finalized.indexOf(a) + 1);
    return { key: a.id, pointM: [a.positionENU[0], a.positionENU[1]], kind, sigmaM: a.sigmaM, label };
  });
  if (player) markers.push({ key: PLAYER_MARKER_KEY, pointM: [player.positionENU[0], player.positionENU[1]], kind: 'player', sigmaM: player.accuracyM, label: 'YOU', dimmed: player.stale === true });
  const links: SceneMarkerLink[] = [];
  for (let i = 1; i < finalized.length; i++) {
    const a = finalized[i - 1]!, b = finalized[i]!;
    links.push({ key: `${a.id}>${b.id}`, fromM: [a.positionENU[0], a.positionENU[1]], toM: [b.positionENU[0], b.positionENU[1]] });
  }
  return { markers, links, rippleKey };
}
