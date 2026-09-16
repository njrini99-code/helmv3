import { SHOT_PATH_OPACITY, type SceneMarker, type SceneMarkerLink, type SceneMarkers } from '../course-geometry/scene-markers';
import { hasFix, liveAnchors, shotTrajectory, type ShotAnchor } from './shot-anchor';

/** What the player sees on the course (master plan §5: YOU is not BALL).
 * Every live anchor of the hole is a dot with its σ ring; the newest
 * finalized one is the BALL, immutable until undone, and it never follows
 * the phone. YOU is the live device marker with its accuracy halo: it moves
 * continuously and is never shot truth. Consecutive finalized anchors are
 * joined by the derived shot; the walking path between them is never drawn
 * and never becomes a shot. A provisional anchor (the refinement window) is
 * hollow and unlabelled; a terminal anchor (cup mark) is marked as such.
 * Tombstoned anchors are not drawn, and nothing is ever snapped.
 *
 * §62–63: each shot carries the shape it is drawn with — the illustrative
 * arc for a full shot, the surface connector for a putt or a chord too short
 * to arc — and its place in the hierarchy, brightest for the shot just
 * completed and dimmer behind it. The shot that has just been marked asks
 * for its reveal; the overlay decides whether to animate it. */
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
    const chordM = Math.hypot(b.positionENU[0] - a.positionENU[0], b.positionENU[1] - a.positionENU[1]);
    const trajectory = shotTrajectory(a.primaryLie, b.primaryLie, chordM);
    // 0 is the shot just completed; the hierarchy falls off behind it (§63).
    const age = finalized.length - 1 - i;
    links.push({ key: `${a.id}>${b.id}`, fromM: [a.positionENU[0], a.positionENU[1]], toM: [b.positionENU[0], b.positionENU[1]],
      basis: trajectory.basis, apexM: trajectory.apexM,
      opacity: age === 0 ? SHOT_PATH_OPACITY.current : age === 1 ? SHOT_PATH_OPACITY.previous : SHOT_PATH_OPACITY.older,
      // The mark that closed this shot is the one rippling: the shot was just
      // played here and now. Marks restored from storage ripple at no point,
      // so a reload redraws the hole without replaying it.
      reveal: age === 0 && rippleKey != null && rippleKey === b.id });
  }
  return { markers, links, rippleKey };
}
