import { MARKER_MOTION } from '../course-geometry/scene-markers';
import type { ProductionCameraState, TerrainPreset } from '../course-geometry/terrain';

/** Camera director (master plan "Camera states" / "Tap latency"). A pure
 * state machine: anchors and gestures move it, the scene reads the state and
 * maps it onto the existing production presets. Thresholds and envelopes are
 * starting points held in one place.
 *
 * §66 anti-jitter is a property of this module rather than a rule its callers
 * remember: no entry point here takes a location fix. `observeAnchor` is for
 * a finalized mark, `observeGesture` and `recenter` are the golfer's own
 * hands, and `tickCamera` only ends the manual window the golfer opened.
 * Live GPS therefore cannot reframe the course, however far or fast it moves,
 * and the frame the golfer is reading stays where they left it. */
export type CameraMode = 'HOLE_OVERVIEW' | 'PLAYER_FOLLOW' | 'APPROACH' | 'GREEN_COMPLEX' | 'PUTT_CONTEXT' | 'HOLE_TRANSITION' | 'MANUAL';
export interface CameraEnvelope { fovDegrees: readonly [number, number]; heightM: readonly [number, number]; composition: string }
export const CAMERA_ENVELOPE: Readonly<Record<Exclude<CameraMode, 'MANUAL'>, CameraEnvelope>> = Object.freeze({
  HOLE_OVERVIEW: { fovDegrees: [38, 42], heightM: [60, 95], composition: 'entire playing corridor readable' },
  PLAYER_FOLLOW: { fovDegrees: [38, 38], heightM: [45, 80], composition: 'player in lower third, landing area ahead' },
  APPROACH: { fovDegrees: [34, 38], heightM: [35, 60], composition: 'player + green complex + primary hazards' },
  GREEN_COMPLEX: { fovDegrees: [32, 36], heightM: [18, 35], composition: 'green/fringe/apron/bunkers dominant' },
  PUTT_CONTEXT: { fovDegrees: [32, 35], heightM: [12, 22], composition: 'restrained green view' },
  HOLE_TRANSITION: { fovDegrees: [38, 42], heightM: [60, 95], composition: 'lift → translate → settle' },
});
export const CAMERA_THRESHOLDS = Object.freeze({ approachM: 180, greenComplexM: 70, puttProbability: .7, idleResumeMs: 8000 });
/** §64/§66 visual defaults, not physics. `shotRevealMs` and `shotResultMs`
 * are the drawing's own timings, taken from where the drawing lives so the
 * two can never drift apart. */
export const MOTION = Object.freeze({
  pressMs: 90, pressScale: .96, statusMorphMs: 160, rippleMs: 340, reframeMs: 480, greenFocusMs: 540, holeTransitionMs: 760,
  reducedMotionMs: 150, refinementMs: 750, savedHoldMs: 700, chipMs: 160, undoWindowMs: 5000,
  shotRevealMs: MARKER_MOTION.revealMs, shotResultMs: MARKER_MOTION.resultHoldMs,
  easingLarge: 'cubic-bezier(0.22, 1, 0.36, 1)', easingMicro: 'ease-out',
});
/** How long a completed shot takes to draw itself on. Reduced Motion draws
 * the finished path at once, so there is no duration to wait out. */
export function shotRevealMs(reducedMotion: boolean): number { return reducedMotion ? 0 : MOTION.shotRevealMs; }
export const GESTURES = Object.freeze({ yawDegreesPerPoint: .22, pitchDegreesPerPoint: .16, pitchMin: 25, pitchMax: 68 });
export interface CameraDirectorState { mode: CameraMode; sinceMs: number; lastGestureMs: number | null; anchored: boolean }
export interface CameraObservation { distanceToGreenM: number | null; greenComplexProbability: number; terminal: boolean }
export function initialCameraState(nowMs: number): CameraDirectorState { return { mode: 'HOLE_OVERVIEW', sinceMs: nowMs, lastGestureMs: null, anchored: false }; }
export function automaticMode(observation: CameraObservation): Exclude<CameraMode, 'MANUAL' | 'HOLE_TRANSITION' | 'HOLE_OVERVIEW'> {
  if (observation.greenComplexProbability >= CAMERA_THRESHOLDS.puttProbability) return 'PUTT_CONTEXT';
  const d = observation.distanceToGreenM;
  if (d != null && d <= CAMERA_THRESHOLDS.greenComplexM) return 'GREEN_COMPLEX';
  if (d != null && d <= CAMERA_THRESHOLDS.approachM) return 'APPROACH';
  return 'PLAYER_FOLLOW';
}
export function observeAnchor(state: CameraDirectorState, observation: CameraObservation, nowMs: number): CameraDirectorState {
  if (observation.terminal) return { ...state, mode: 'HOLE_TRANSITION', sinceMs: nowMs, anchored: true };
  if (state.mode === 'MANUAL') return { ...state, anchored: true };
  const mode = automaticMode(observation);
  return mode === state.mode ? { ...state, anchored: true } : { mode, sinceMs: nowMs, lastGestureMs: state.lastGestureMs, anchored: true };
}
export function observeGesture(state: CameraDirectorState, nowMs: number): CameraDirectorState {
  return { ...state, mode: 'MANUAL', sinceMs: state.mode === 'MANUAL' ? state.sinceMs : nowMs, lastGestureMs: nowMs };
}
/** Idle resume: eight seconds after the last gesture, framing follows the anchor again. */
export function tickCamera(state: CameraDirectorState, observation: CameraObservation | null, nowMs: number): CameraDirectorState {
  if (state.mode !== 'MANUAL' || state.lastGestureMs == null || nowMs - state.lastGestureMs < CAMERA_THRESHOLDS.idleResumeMs) return state;
  if (!state.anchored || !observation) return { ...state, mode: 'HOLE_OVERVIEW', sinceMs: nowMs, lastGestureMs: null };
  return { ...state, mode: automaticMode(observation), sinceMs: nowMs, lastGestureMs: null };
}
export function nextHole(nowMs: number): CameraDirectorState { return initialCameraState(nowMs); }
export function recenter(state: CameraDirectorState, observation: CameraObservation | null, nowMs: number): CameraDirectorState {
  return observation && state.anchored ? { ...state, mode: automaticMode(observation), sinceMs: nowMs, lastGestureMs: null } : { ...state, mode: 'HOLE_OVERVIEW', sinceMs: nowMs, lastGestureMs: null };
}
export function transitionMs(to: CameraMode, reducedMotion: boolean): number {
  if (reducedMotion) return MOTION.reducedMotionMs;
  return to === 'HOLE_TRANSITION' || to === 'HOLE_OVERVIEW' ? MOTION.holeTransitionMs : to === 'GREEN_COMPLEX' || to === 'PUTT_CONTEXT' ? MOTION.greenFocusMs : MOTION.reframeMs;
}
/** Map onto the production terrain states the renderer already frames. */
export function productionStateFor(mode: CameraMode, manualPreset: TerrainPreset | null = null): { state: ProductionCameraState; preset: TerrainPreset } {
  if (mode === 'MANUAL' && manualPreset) return { state: manualPreset === 'putting' ? 'putting' : manualPreset === 'green' ? 'green' : manualPreset === 'approach' ? 'approach' : 'tee', preset: manualPreset };
  switch (mode) {
    case 'APPROACH': return { state: 'approach', preset: 'approach' };
    case 'GREEN_COMPLEX': return { state: 'green', preset: 'green' };
    case 'PUTT_CONTEXT': return { state: 'putting', preset: 'putting' };
    // PLAYER_FOLLOW composes "player in lower third, landing area ahead": the
    // tee state looks down the whole corridor from the player's end, so a mark
    // far from the green stays in frame; the approach state would crop it.
    case 'PLAYER_FOLLOW': return { state: 'tee', preset: 'tee' };
    default: return { state: 'tee', preset: 'tee' };
  }
}
export function clampPitch(pitch: number): number { return Math.min(GESTURES.pitchMax, Math.max(GESTURES.pitchMin, pitch)); }
