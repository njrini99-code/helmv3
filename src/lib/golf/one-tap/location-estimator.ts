import { wgs84ToEnu, type LocalOrigin } from './geodesy';

/** Live tap estimator (master plan "Live tap estimator"). Pure functions over
 * a retained sample stream so the same raw packet always replays to the same
 * estimate. Tuning values are configuration, not truth: they wait for the
 * Peek'n Peak field calibration (`kAcc` starts at 1). */
export interface LocationSample {
  timestampMs: number;
  longitude: number;
  latitude: number;
  altitudeM: number | null;
  horizontalAccuracyM: number;
  verticalAccuracyM: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  source: 'device' | 'synthetic';
}
export interface EstimatorConfig {
  lookbackMs: number;
  refinementMs: number;
  maxSampleAgeMs: number;
  poorAccuracyM: number;
  minSigmaM: number;
  minEffectiveAccuracyM: number;
  residualFloorM: number;
  residualAccuracyMultiple: number;
  kAcc: number;
  highSigmaM: number;
  highProbability: number;
  mediumSigmaM: number;
  mediumProbability: number;
}
export const ESTIMATOR_CONFIG: Readonly<EstimatorConfig> = Object.freeze({
  lookbackMs: 1500, refinementMs: 750, maxSampleAgeMs: 2000, poorAccuracyM: 25, minSigmaM: 1.5, minEffectiveAccuracyM: 2,
  residualFloorM: 3, residualAccuracyMultiple: 2.5, kAcc: 1, highSigmaM: 4, highProbability: .9, mediumSigmaM: 8, mediumProbability: .7,
});
export type Covariance2 = readonly [readonly [number, number], readonly [number, number]];
export type AnchorConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export interface LocationEstimate {
  positionENU: readonly [number, number];
  positionWgs84: readonly [number, number, number | null];
  covarianceENU2D: Covariance2;
  sigmaM: number;
  sigmaDeviceM: number;
  sigmaScatterM: number;
  medianAccuracyM: number;
  /** Every sample inside the window (retained on the anchor, never discarded). */
  windowSamples: LocationSample[];
  usedSamples: number;
  rejectedResiduals: number;
  /** No sample met the poor-accuracy threshold: the estimate is honest but poor. */
  poorAccuracy: boolean;
  basis: 'weighted_mean_of_window';
}
export class LocationBuffer {
  private samples: LocationSample[] = [];
  constructor(private readonly retainMs = 30_000) {}
  push(sample: LocationSample) {
    if (!Number.isFinite(sample.timestampMs) || !Number.isFinite(sample.horizontalAccuracyM)) return;
    this.samples.push(sample);
    this.samples.sort((a, b) => a.timestampMs - b.timestampMs);
    const cutoff = sample.timestampMs - this.retainMs;
    this.samples = this.samples.filter(s => s.timestampMs >= cutoff);
  }
  between(fromMs: number, toMs: number): LocationSample[] { return this.samples.filter(s => s.timestampMs >= fromMs && s.timestampMs <= toMs); }
  latest(): LocationSample | null { return this.samples.at(-1) ?? null; }
  size() { return this.samples.length; }
}
/** Best recent fix for the provisional anchor: the most accurate sample no
 * older than the lookback, ties to the freshest. Null → no provisional. */
export function provisionalLocation(buffer: LocationBuffer, tapMs: number, config = ESTIMATOR_CONFIG): LocationSample | null {
  const recent = buffer.between(tapMs - config.lookbackMs, tapMs).filter(s => s.horizontalAccuracyM > 0);
  return recent.reduce<LocationSample | null>((best, s) => !best || s.horizontalAccuracyM < best.horizontalAccuracyM ||
    (s.horizontalAccuracyM === best.horizontalAccuracyM && s.timestampMs > best.timestampMs) ? s : best, null);
}
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
function weightedMedian(values: number[], weights: number[]): number {
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const half = weights.reduce((s, w) => s + w, 0) / 2;
  let acc = 0;
  for (const i of order) { acc += weights[i]!; if (acc >= half) return values[i]!; }
  return values[order.at(-1)!]!;
}
/** Finalize the estimate for a tap from the retained buffer. Null means no
 * usable sample: the controller reports GPS_UNAVAILABLE and fabricates nothing. */
export function finalizeEstimate(buffer: LocationBuffer, tapMs: number, origin: LocalOrigin, config = ESTIMATOR_CONFIG): LocationEstimate | null {
  const window = buffer.between(tapMs - config.lookbackMs, tapMs + config.refinementMs)
    .filter(s => tapMs - s.timestampMs <= config.maxSampleAgeMs && s.horizontalAccuracyM > 0);
  if (!window.length) return null;
  const good = window.filter(s => s.horizontalAccuracyM <= config.poorAccuracyM);
  const samples = good.length ? good : window;
  const points = samples.map(s => wgs84ToEnu([s.longitude, s.latitude, null], origin));
  const centre = [median(points.map(p => p[0])), median(points.map(p => p[1]))] as const;
  const medianAccuracy = median(samples.map(s => s.horizontalAccuracyM));
  const residualLimit = Math.max(config.residualFloorM, config.residualAccuracyMultiple * medianAccuracy);
  const keptIndex = points.map((_, i) => i).filter(i => Math.hypot(points[i]![0] - centre[0], points[i]![1] - centre[1]) <= residualLimit);
  const kept = keptIndex.length ? keptIndex : points.map((_, i) => i);
  const weights = kept.map(i => 1 / Math.max(samples[i]!.horizontalAccuracyM, config.minEffectiveAccuracyM) ** 2);
  const total = weights.reduce((s, w) => s + w, 0);
  let meanE = 0, meanN = 0;
  kept.forEach((i, k) => { meanE += points[i]![0] * weights[k]! / total; meanN += points[i]![1] * weights[k]! / total; });
  const mean: readonly [number, number] = [meanE, meanN];
  let cee = 0, cnn = 0;
  kept.forEach((i, k) => { const de = points[i]![0] - mean[0], dn = points[i]![1] - mean[1], w = weights[k]! / total; cee += w * de * de; cnn += w * dn * dn; });
  const sigmaDevice = config.kAcc * weightedMedian(kept.map(i => samples[i]!.horizontalAccuracyM), weights);
  const sigmaScatter = Math.sqrt((cee + cnn) / 2);
  const sigma = Math.max(sigmaDevice, sigmaScatter, config.minSigmaM);
  const altitude = kept.map(i => samples[i]!.altitudeM).filter((a): a is number => a != null);
  const lon = kept.reduce((s, i, k) => s + samples[i]!.longitude * weights[k]! / total, 0), lat = kept.reduce((s, i, k) => s + samples[i]!.latitude * weights[k]! / total, 0);
  return { positionENU: mean, positionWgs84: [lon, lat, altitude.length ? median(altitude) : null],
    covarianceENU2D: [[sigma * sigma, 0], [0, sigma * sigma]], sigmaM: sigma, sigmaDeviceM: sigmaDevice, sigmaScatterM: sigmaScatter,
    medianAccuracyM: medianAccuracy, windowSamples: window, usedSamples: kept.length, rejectedResiduals: samples.length - kept.length,
    poorAccuracy: good.length === 0, basis: 'weighted_mean_of_window' };
}
export function anchorConfidence(sigmaM: number, pMax: number, config = ESTIMATOR_CONFIG): AnchorConfidence {
  if (sigmaM <= config.highSigmaM && pMax >= config.highProbability) return 'HIGH';
  if (sigmaM <= config.mediumSigmaM && pMax >= config.mediumProbability) return 'MEDIUM';
  return 'LOW';
}
export function maxEigenvalue2([[a, b], [c, d]]: Covariance2): number {
  const tr = a + d, det = a * d - b * c;
  return tr / 2 + Math.sqrt(Math.max(0, tr * tr / 4 - det));
}
