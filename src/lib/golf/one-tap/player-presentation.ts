import { wgs84ToEnuInFrame, type LocalOrigin } from './geodesy';
import type { LocationSample } from './location-estimator';

/** YOU on the course (master plan §5, §37). The live device marker shows a
 * presentation position: the receiver's fixes eased with a small deadband
 * and a time constant, so the marker walks instead of jittering. Evidence
 * is never touched here: anchors come from the estimator at the tap, and a
 * walking path is never a shot. A large jump is gated (two consistent fixes)
 * and then snapped, never animated across the fairway. */
export interface PlayerFix { positionENU: readonly [number, number]; accuracyM: number; timestampMs: number }
export interface PlayerPresentation {
  /** Where YOU is drawn. */
  positionENU: readonly [number, number];
  /** Where the receiver last plausibly put the phone; the marker eases toward it. */
  targetENU: readonly [number, number];
  /** Smoothed reported radius: the halo. */
  accuracyM: number;
  /** Last accepted fix time and the last presentation update. */
  fixMs: number;
  updatedMs: number;
  /** A far fix waiting for a second consistent one before the marker snaps. */
  pending: PlayerFix | null;
}
export interface PresentationConfig {
  /** Fixes inside this radius of the drawn marker do not move it. */
  deadbandM: number;
  /** Exponential approach time constant toward the target. */
  timeConstantMs: number;
  /** Smoothing time constant for the halo radius. */
  accuracyTimeConstantMs: number;
  /** A move beyond this snaps (never eases) once accepted. */
  snapM: number;
  /** Above this implied speed a jump waits for a confirming fix. */
  maxPlausibleSpeedMps: number;
  /** A confirming fix must land within max(this, 3 × its radius) of the pending one. */
  confirmM: number;
}
/** PROVISIONAL — CALIBRATE ON PEEK'N PEAK (§37 starting values). */
export const PRESENTATION_CONFIG: Readonly<PresentationConfig> = Object.freeze({
  deadbandM: 1, timeConstantMs: 1200, accuracyTimeConstantMs: 2000, snapM: 25, maxPlausibleSpeedMps: 12, confirmM: 10,
});
const dist = (a: readonly [number, number], b: readonly [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function playerFixFromSample(sample: LocationSample, origin: LocalOrigin): PlayerFix | null {
  if (!(sample.horizontalAccuracyM > 0) || !Number.isFinite(sample.timestampMs)) return null;
  // A fix outside the local frame (still driving in, a coarse first cell
  // fix) is no YOU marker, not a thrown frame error.
  const enu = wgs84ToEnuInFrame([sample.longitude, sample.latitude, null], origin);
  if (!enu) return null;
  return { positionENU: [enu[0], enu[1]], accuracyM: sample.horizontalAccuracyM, timestampMs: sample.timestampMs };
}
/** Fold a new fix into the presentation. Returns the previous object when
 * the fix changes nothing (a jittering phone inside the deadband). */
export function acceptPlayerFix(prev: PlayerPresentation | null, fix: PlayerFix, config: PresentationConfig = PRESENTATION_CONFIG): PlayerPresentation {
  if (!prev) return { positionENU: fix.positionENU, targetENU: fix.positionENU, accuracyM: fix.accuracyM, fixMs: fix.timestampMs, updatedMs: fix.timestampMs, pending: null };
  const dtMs = Math.max(0, fix.timestampMs - prev.fixMs);
  const accuracyM = prev.accuracyM + (fix.accuracyM - prev.accuracyM) * (1 - Math.exp(-dtMs / config.accuracyTimeConstantMs));
  const jump = dist(fix.positionENU, prev.positionENU);
  if (jump > config.snapM) {
    const implausible = jump / Math.max(dtMs, 1) * 1000 > config.maxPlausibleSpeedMps;
    const confirmed = prev.pending != null && dist(fix.positionENU, prev.pending.positionENU) <= Math.max(config.confirmM, 3 * fix.accuracyM);
    if (implausible && !confirmed) return { ...prev, pending: fix };
    // A real move this large is shown where it is, not walked across the course.
    return { positionENU: fix.positionENU, targetENU: fix.positionENU, accuracyM: fix.accuracyM, fixMs: fix.timestampMs, updatedMs: fix.timestampMs, pending: null };
  }
  const target = jump <= config.deadbandM ? prev.positionENU : fix.positionENU;
  if (target === prev.targetENU && accuracyM === prev.accuracyM && prev.pending == null && fix.timestampMs === prev.fixMs) return prev;
  // The easing clock restarts when the target moves; a held target keeps its clock.
  const updatedMs = target === prev.targetENU ? prev.updatedMs : Math.max(prev.updatedMs, fix.timestampMs);
  return { ...prev, targetENU: target, accuracyM, fixMs: fix.timestampMs, updatedMs, pending: null };
}
/** Advance the easing. Returns the same object when the marker is settled. */
export function tickPlayerPresentation(state: PlayerPresentation, nowMs: number, config: PresentationConfig = PRESENTATION_CONFIG): PlayerPresentation {
  const remaining = dist(state.targetENU, state.positionENU);
  if (remaining === 0) return state;
  const dtMs = nowMs - state.updatedMs;
  if (dtMs <= 0) return state;
  const alpha = 1 - Math.exp(-dtMs / config.timeConstantMs);
  // Under a decimetre is invisible at course scale: land exactly on the target.
  const next: readonly [number, number] = remaining * (1 - alpha) < .1 ? state.targetENU
    : [state.positionENU[0] + (state.targetENU[0] - state.positionENU[0]) * alpha, state.positionENU[1] + (state.targetENU[1] - state.positionENU[1]) * alpha];
  return { ...state, positionENU: next, updatedMs: nowMs };
}
