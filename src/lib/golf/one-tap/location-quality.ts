import type { AnchorConfidence, LocationSample } from './location-estimator';
import type { LocationStatus } from './location-source';

/** Location quality (master plan §36 "Motion / cart logic" and §8.2 weak
 * location). Pure grading over the sample stream; nothing here rejects a
 * mark or invents a position. A moving capture still saves, with lower
 * confidence, and the live HUD only speaks up when the fix is degraded. */
export type CaptureMotion = 'stationary' | 'settling' | 'moving' | 'unknown';
export interface MotionConfig {
  /** Reported or displacement speed at or under this is a stationary candidate. */
  stationarySpeedMps: number;
  /** Above stationary and up to this is settling (stepping out of a cart). */
  settlingSpeedMps: number;
  /** Positional evidence needs at least this much time between fixes. */
  motionMinSpanMs: number;
  /** Net displacement under this floor is jitter, not motion (metres). */
  displacementFloorM: number;
  /** The floor also scales with the reported radius: two fixes of radius a
   * scatter about a·√2 apart at rest, so the floor is this multiple of a. */
  displacementAccuracyMultiple: number;
}
/** PROVISIONAL — CALIBRATE ON PEEK'N PEAK (§36 initial tunables). */
export const MOTION_CONFIG: Readonly<MotionConfig> = Object.freeze({ stationarySpeedMps: .8, settlingSpeedMps: 1.8, motionMinSpanMs: 500, displacementFloorM: 3, displacementAccuracyMultiple: 1.5 });
export interface MotionEvidence {
  captureMotion: CaptureMotion;
  /** Median of the finite reported speeds in the window; null with none. */
  reportedSpeedMps: number | null;
  /** Net displacement between the earliest and latest fix over their span;
   * null below the minimum span. Zero when under the jitter floor. */
  displacementSpeedMps: number | null;
  displacementM: number | null;
}
export interface TimedPoint { timestampMs: number; positionENU: readonly [number, number]; speedMps: number | null }
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
/** Speed is noisy near zero and displacement is noisy at the accuracy scale,
 * so both are read and the larger wins: reported speed catches a rolling
 * cart with tight fixes, displacement catches motion the receiver does not
 * report. Displacement only counts beyond the jitter floor, which is the
 * larger of the configured floor and 1.5 × the window's median reported radius. */
export function classifyCaptureMotion(points: readonly TimedPoint[], medianAccuracyM: number, config: MotionConfig = MOTION_CONFIG): MotionEvidence {
  const speeds = points.map(p => p.speedMps).filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);
  const reportedSpeedMps = speeds.length ? median(speeds) : null;
  const ordered = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const first = ordered[0], last = ordered.at(-1);
  const spanMs = first && last ? last.timestampMs - first.timestampMs : 0;
  let displacementM: number | null = null, displacementSpeedMps: number | null = null;
  if (first && last && spanMs >= config.motionMinSpanMs) {
    displacementM = Math.hypot(last.positionENU[0] - first.positionENU[0], last.positionENU[1] - first.positionENU[1]);
    const floor = Math.max(config.displacementFloorM, Number.isFinite(medianAccuracyM) ? config.displacementAccuracyMultiple * medianAccuracyM : 0);
    displacementSpeedMps = displacementM > floor ? displacementM / (spanMs / 1000) : 0;
  }
  const evidence = [reportedSpeedMps, displacementSpeedMps].filter((v): v is number => v != null);
  if (!evidence.length) return { captureMotion: 'unknown', reportedSpeedMps, displacementSpeedMps, displacementM };
  const speed = Math.max(...evidence);
  const captureMotion: CaptureMotion = speed <= config.stationarySpeedMps ? 'stationary' : speed <= config.settlingSpeedMps ? 'settling' : 'moving';
  return { captureMotion, reportedSpeedMps, displacementSpeedMps, displacementM };
}
/** §36 "otherwise save with lower confidence": a mark taken while moving
 * drops one grade. Settling and stationary keep the estimator's grade. */
export function confidenceForMotion(confidence: AnchorConfidence, motion: CaptureMotion): AnchorConfidence {
  if (motion !== 'moving') return confidence;
  return confidence === 'HIGH' ? 'MEDIUM' : 'LOW';
}

/** Live fix quality for the HUD (§8.2). `good` stays silent; the others
 * earn the single location chip. Age uses the fix timestamp, so a paused or
 * stalled watch decays to `stale` without a status event. `off_course` is a
 * healthy fix outside the course's local frame (the drive in, a coarse first
 * cell fix): the phone knows where it is, and it is not here. */
export type LocationQuality = 'good' | 'fair' | 'poor' | 'stale' | 'none' | 'off_course';
export interface QualityConfig { goodAccuracyM: number; fairAccuracyM: number; staleAfterMs: number }
/** PROVISIONAL — CALIBRATE ON PEEK'N PEAK. `fairAccuracyM` matches the estimator's poor-accuracy threshold. */
export const QUALITY_CONFIG: Readonly<QualityConfig> = Object.freeze({ goodAccuracyM: 8, fairAccuracyM: 25, staleAfterMs: 6000 });
export function gradeLocationQuality(latest: Pick<LocationSample, 'timestampMs' | 'horizontalAccuracyM'> | null, nowMs: number, status: LocationStatus | null = null, config: QualityConfig = QUALITY_CONFIG): LocationQuality {
  if (status === 'denied' || status === 'unavailable' || status === 'idle') return 'none';
  if (!latest || !(latest.horizontalAccuracyM > 0)) return 'none';
  if (status === 'paused' || status === 'reacquiring' || nowMs - latest.timestampMs > config.staleAfterMs) return 'stale';
  if (latest.horizontalAccuracyM <= config.goodAccuracyM) return 'good';
  return latest.horizontalAccuracyM <= config.fairAccuracyM ? 'fair' : 'poor';
}
